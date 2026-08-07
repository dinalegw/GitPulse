package cmd

import (
	"fmt"
	"time"

	"github.com/gitpulse/gitpulse/internal/config"
	"github.com/gitpulse/gitpulse/internal/scheduler"
	"github.com/spf13/cobra"
)

func newStatusCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Show repository, configuration, and schedule status",
		Long: `Show a snapshot of the configured repository, the effective
configuration, and today's commit schedule.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runStatus(cmd, nil)
		},
	}
	return cmd
}

func runStatus(cmd *cobra.Command, _ []string) error {
	a, err := newApp()
	if err != nil {
		return err
	}
	defer a.close()

	ctx := cmd.Context()

	fmt.Printf("GitPulse status\n")
	fmt.Printf("===============\n")
	fmt.Printf("Configuration file: %s\n", a.configPath)
	if !a.manager.Exists() {
		fmt.Printf("Configuration:      not initialized (run 'gitpulse init')\n")
		return nil
	}
	fmt.Printf("Enabled:            %v\n", a.cfg.Enabled)
	fmt.Printf("Dry-run:            %v\n", a.cfg.DryRun)
	fmt.Printf("Repository:         %s\n", orEmpty(a.cfg.RepositoryPath))
	fmt.Printf("Remote branch:      %s/%s\n", orEmpty(a.cfg.PushRemote), orEmpty(a.cfg.RemoteBranch))
	fmt.Printf("Commits per day:    %d\n", a.cfg.CommitsPerDay)
	fmt.Printf("Schedule:           %s - %s (%s)\n", a.cfg.StartTime, a.cfg.EndTime, a.cfg.Timezone)
	if a.cfg.CommitIntervalMinutes > 0 {
		fmt.Printf("Commit interval:    %d minutes\n", a.cfg.CommitIntervalMinutes)
	}
	fmt.Printf("Metadata:           %s/%s\n", a.cfg.MetadataDir, a.cfg.MetadataFile)

	if a.cfg.RepositoryPath == "" {
		fmt.Printf("\nRepository:          not configured; run 'gitpulse config set %s <path>'\n", config.KeyRepositoryPath)
		return nil
	}

	client := a.newGitClient()
	repo, err := client.Detect(ctx)
	if err != nil {
		fmt.Fprintf(cmd.ErrOrStderr(), "\nCannot inspect repository: %v\n", err)
		return nil
	}
	if !repo {
		fmt.Printf("\nRepository:          %s is not a git working tree\n", a.cfg.RepositoryPath)
		return nil
	}

	branch, err := client.CurrentBranch(ctx)
	if err != nil {
		branch = "unknown"
	}
	clean, err := client.IsClean(ctx)
	cleanText := "unknown"
	if err == nil {
		if clean {
			cleanText = "clean"
		} else {
			cleanText = "changes present"
		}
	}
	fmt.Printf("Current branch:     %s\n", branch)
	fmt.Printf("Working tree:       %s\n", cleanText)

	hasRemote, err := client.HasRemote(ctx, a.cfg.PushRemote)
	remoteText := "no"
	if err == nil && hasRemote {
		remoteText = "yes"
	}
	fmt.Printf("Remote %q:        %s\n", a.cfg.PushRemote, remoteText)

	last, err := client.LastCommitTime(ctx)
	if err == nil {
		fmt.Printf("Last commit:        %s\n", last.Format("2006-01-02 15:04"))
	}

	sched := scheduler.NewDailyScheduler(a.log)
	now := time.Now()
	events, err := sched.EventsForDay(now, a.cfg)
	if err != nil {
		fmt.Printf("\nSchedule:           %v\n", err)
		return nil
	}
	fmt.Printf("Today's events:     %d\n", len(events))
	for _, e := range events {
		marker := " "
		if e.After(now) {
			marker = ">"
		}
		fmt.Printf("  %s %s\n", marker, e.Format("15:04"))
	}
	next, err := sched.NextRun(now, a.cfg)
	if err == nil {
		fmt.Printf("Next run:           %s\n", next.Format("2006-01-02 15:04"))
	}
	return nil
}

func orEmpty(value string) string {
	if value == "" {
		return "(not set)"
	}
	return value
}
