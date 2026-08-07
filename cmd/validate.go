package cmd

import (
	"fmt"

	"github.com/gitpulse/gitpulse/internal/validation"
	"github.com/spf13/cobra"
)

func newValidateCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "validate",
		Short: "Validate the GitPulse configuration",
		Long: `Check the configuration for problems before running GitPulse.

Reports every problem found, why it matters, and how to fix it. The command
also inspects the configured repository and reports whether GitPulse can
actually run against it.

Exit code 0 means the configuration is valid; exit code 1 means at least one
problem was found.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runValidate(cmd, nil)
		},
	}
	return cmd
}

func runValidate(cmd *cobra.Command, _ []string) error {
	a, err := newApp()
	if err != nil {
		return err
	}
	defer a.close()

	ctx := cmd.Context()

	fmt.Printf("Validating GitPulse configuration\n")
	fmt.Printf("  File: %s\n", a.configPath)
	if !a.manager.Exists() {
		fmt.Printf("  Note: configuration file does not exist; defaults are being used. Run 'gitpulse init' to create it.\n")
	}
	fmt.Println()

	problems := validation.Validate(a.cfg)
	if len(problems) == 0 {
		fmt.Printf("  [OK]   configuration is valid\n")
	} else {
		for _, p := range problems {
			fmt.Printf("  [FAIL] %s\n", p.Message)
			if p.Fix != "" {
				fmt.Printf("         Fix: %s\n", p.Fix)
			}
		}
	}

	// Repository checks are informational: a missing repository is reported
	// but does not invalidate the configuration file itself.
	if a.cfg.RepositoryPath != "" && len(problems) == 0 {
		client := a.newGitClient()
		repo, err := client.Detect(ctx)
		switch {
		case err != nil:
			fmt.Printf("  [WARN] cannot inspect repository: %v\n", err)
		case !repo:
			fmt.Printf("  [WARN] %s is not a git working tree\n", a.cfg.RepositoryPath)
		default:
			fmt.Printf("  [OK]   %s is a git working tree\n", a.cfg.RepositoryPath)
			if remote, err := client.HasRemote(ctx, a.cfg.PushRemote); err == nil && !remote {
				fmt.Printf("  [WARN] remote %q is not configured; push will be skipped. Add it with 'git remote add %s <url>'\n", a.cfg.PushRemote, a.cfg.PushRemote)
			}
		}
	}

	fmt.Println()
	if len(problems) > 0 {
		return fmt.Errorf("configuration has %d problem(s); fix them and run 'gitpulse validate' again", len(problems))
	}
	return nil
}
