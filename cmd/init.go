package cmd

import (
	"fmt"

	"github.com/dinalegw/GitPulse/internal/config"
	"github.com/dinalegw/GitPulse/internal/git"
	"github.com/dinalegw/GitPulse/internal/utils"
	"github.com/spf13/cobra"
)

type initFlags struct {
	repo     string
	branch   string
	commits  int
	enabled  bool
	dryRun   bool
	noDetect bool
}

func newInitCmd() *cobra.Command {
	flags := &initFlags{}
	cmd := &cobra.Command{
		Use:   "init",
		Short: "Initialize GitPulse configuration",
		Long: `Initialize a GitPulse configuration file.

If no repository is given with --repo, GitPulse checks whether the current
directory is a git repository and configures it automatically.

The target branch is inferred from the current branch when --branch is not
provided. If that branch tracks a remote branch, the upstream branch is used.
The command never assumes that every repository uses main.

The command never touches an existing configuration file. Use
'gitpulse config set <key> <value>' to change settings afterwards.`,
		Example: `  gitpulse init
  gitpulse init --repo /path/to/repo
  gitpulse init --repo ~/projects/app --branch main --commits 3
  gitpulse init --repo ~/projects/app --enabled --dry-run`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runInit(cmd, flags)
		},
	}

	cmd.Flags().StringVar(&flags.repo, "repo", "", "repository path to commit to (default: current directory if it is a git repository)")
	cmd.Flags().StringVar(&flags.branch, "branch", "", "remote branch to push to (default: current branch, or its upstream branch when available)")
	cmd.Flags().IntVar(&flags.commits, "commits", 0, "number of commits per day (default: 4)")
	cmd.Flags().BoolVar(&flags.enabled, "enabled", false, "mark GitPulse as enabled (default: false)")
	cmd.Flags().BoolVar(&flags.dryRun, "dry-run", false, "enable dry-run mode (default: false)")
	cmd.Flags().BoolVar(&flags.noDetect, "no-detect", false, "do not auto-detect the repository from the current directory")

	return cmd
}

func runInit(cmd *cobra.Command, flags *initFlags) error {
	a, err := newApp()
	if err != nil {
		return err
	}
	defer a.close()

	if a.manager.Exists() {
		return fmt.Errorf("GitPulse is already initialized at %s; use 'gitpulse config set <key> <value>' to change settings, or delete the file to re-initialize", a.configPath)
	}

	cfg := a.cfg

	if flags.repo != "" {
		expanded, err := utils.ExpandPath(flags.repo)
		if err != nil {
			return fmt.Errorf("cannot resolve repository path: %w", err)
		}
		cfg.RepositoryPath = expanded
	} else if !flags.noDetect {
		cwd, err := utils.ExpandPath(".")
		if err != nil {
			return err
		}
		client := git.New(cwd, git.NewRealRunner(a.log))
		repo, err := client.Detect(cmd.Context())
		if err == nil && repo {
			cfg.RepositoryPath = cwd
			if flags.branch == "" {
				if upstream, upstreamErr := client.UpstreamBranch(cmd.Context()); upstreamErr == nil && upstream != "" {
					cfg.RemoteBranch = upstream
				} else if current, branchErr := client.CurrentBranch(cmd.Context()); branchErr == nil && current != "" {
					cfg.RemoteBranch = current
				}
			}
		}
	}

	if flags.branch != "" {
		cfg.RemoteBranch = flags.branch
	}
	if flags.commits > 0 {
		cfg.CommitsPerDay = flags.commits
	}
	if flags.enabled {
		cfg.Enabled = true
	}
	if flags.dryRun {
		cfg.DryRun = true
	}

	if err := a.manager.Save(cfg); err != nil {
		return err
	}

	fmt.Fprintf(cmd.OutOrStdout(), "GitPulse initialized.\n")
	fmt.Fprintf(cmd.OutOrStdout(), "  Configuration file: %s\n", a.configPath)
	if cfg.RepositoryPath == "" {
		fmt.Fprintf(cmd.OutOrStdout(), "  Repository:        (not set — run 'gitpulse config set %s <path>')\n", config.KeyRepositoryPath)
	} else {
		fmt.Fprintf(cmd.OutOrStdout(), "  Repository:        %s\n", cfg.RepositoryPath)
	}
	fmt.Fprintf(cmd.OutOrStdout(), "  Push remote:       %s\n", cfg.PushRemote)
	fmt.Fprintf(cmd.OutOrStdout(), "  Remote branch:     %s\n", cfg.RemoteBranch)
	fmt.Fprintf(cmd.OutOrStdout(), "\nNext steps:\n")
	fmt.Fprintf(cmd.OutOrStdout(), "  gitpulse validate   # check the configuration\n")
	fmt.Fprintf(cmd.OutOrStdout(), "  gitpulse status     # inspect the repository and schedule\n")
	fmt.Fprintf(cmd.OutOrStdout(), "  gitpulse run --dry-run  # simulate a commit cycle\n")
	fmt.Fprintf(cmd.OutOrStdout(), "  gitpulse run        # create commits now\n")
	fmt.Fprintf(cmd.OutOrStdout(), "  gitpulse run --schedule  # run on the configured schedule\n")
	return nil
}
