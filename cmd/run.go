package cmd

import (
	"context"
	"fmt"
	"time"

	"github.com/dinalegw/GitPulse/internal/commits"
	"github.com/dinalegw/GitPulse/internal/scheduler"
	"github.com/dinalegw/GitPulse/internal/validation"
	"github.com/spf13/cobra"
)

type runFlags struct {
	schedule bool
	daemon   bool
	once     bool
	dryRun   bool
	forceRun bool
	count    int
}

func newRunCmd() *cobra.Command {
	flags := &runFlags{}
	cmd := &cobra.Command{
		Use:   "run",
		Short: "Create and push GitPulse commits",
		Long: `Create GitPulse commits and push them to the configured remote.

Without flags, run performs one commit cycle immediately, creating the
configured number of commits and pushing once.

With --schedule (alias --daemon), run stays in the foreground and executes
one commit at each time in the configured daily schedule until interrupted.
Scheduled mode requires enabled to be true in the configuration.

Use --dry-run to simulate the cycle without changing anything.`,
		Example: `  gitpulse run
  gitpulse run --dry-run
  gitpulse run --count 2
  gitpulse run --schedule
  gitpulse run --schedule --dry-run`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runRun(cmd, flags)
		},
	}

	cmd.Flags().BoolVar(&flags.schedule, "schedule", false, "run continuously on the configured daily schedule")
	cmd.Flags().BoolVar(&flags.daemon, "daemon", false, "alias for --schedule")
	cmd.Flags().BoolVar(&flags.once, "once", false, "run a single cycle and exit (default behavior)")
	cmd.Flags().BoolVar(&flags.dryRun, "dry-run", false, "simulate the cycle without creating commits")
	cmd.Flags().BoolVar(&flags.forceRun, "no-dry-run", false, "force real commits even if dry_run is enabled in the configuration")
	cmd.Flags().IntVar(&flags.count, "count", 0, "number of commits to create in a single cycle (default: commits_per_day from configuration)")

	return cmd
}

func runRun(cmd *cobra.Command, flags *runFlags) error {
	a, err := newApp()
	if err != nil {
		return err
	}
	defer a.close()

	scheduled := flags.schedule || flags.daemon
	if scheduled && !a.cfg.Enabled {
		return fmt.Errorf("GitPulse is disabled (enabled: false); scheduled runs require enabled=true. Enable it with 'gitpulse config set enabled true', or run a one-shot cycle with 'gitpulse run --once'")
	}

	dryRun := a.cfg.DryRun || flags.dryRun
	if flags.forceRun {
		dryRun = false
	}

	ctx := signalContext(cmd.Context())

	if scheduled {
		return runScheduled(ctx, a, dryRun)
	}
	return runOnce(ctx, cmd, a, dryRun, flags.count)
}

func runOnce(ctx context.Context, cmd *cobra.Command, a *app, dryRun bool, count int) error {
	client := a.newGitClient()
	cycle, err := commits.NewCycle(a.cfg, client, a.log, dryRun)
	if err != nil {
		return err
	}

	if count == 0 {
		count = a.cfg.CommitsPerDay
	}

	fmt.Printf("GitPulse run (dry-run: %v)\n", dryRun)
	fmt.Printf("  Repository: %s\n", a.cfg.RepositoryPath)
	fmt.Printf("  Commits:    %d\n", count)
	fmt.Println()

	res, err := cycle.RunN(ctx, count)
	if err != nil {
		fmt.Fprintf(cmd.ErrOrStderr(), "GitPulse run failed after creating %d commit(s): %v\n", res.Created, err)
		return err
	}

	fmt.Printf("Created  %d commit(s)\n", res.Created)
	fmt.Printf("Skipped  %d (nothing to commit)\n", res.Skipped)
	if res.Pushed {
		fmt.Printf("Pushed   yes (%s/%s)\n", a.cfg.PushRemote, a.cfg.RemoteBranch)
	} else if dryRun {
		fmt.Printf("Pushed   skipped (dry-run)\n")
	}
	fmt.Printf("Duration %s\n", res.Duration.Round(time.Millisecond))
	return nil
}

func runScheduled(ctx context.Context, a *app, dryRun bool) error {
	if problems := validation.Validate(a.cfg); len(problems) > 0 {
		return fmt.Errorf("configuration is not valid: %w", problems)
	}

	client := a.newGitClient()
	sched := scheduler.NewDailyScheduler(a.log)

	job := func(ctx context.Context) error {
		cycle, err := commits.NewCycle(a.cfg, client, a.log, dryRun)
		if err != nil {
			return err
		}
		res, err := cycle.RunN(ctx, 1)
		if err != nil {
			return err
		}
		fmt.Printf("Scheduled commit created: seq=%d pushed=%v\n", res.FirstSeq, res.Pushed)
		return nil
	}

	return sched.RunLoop(ctx, a.cfg, job)
}
