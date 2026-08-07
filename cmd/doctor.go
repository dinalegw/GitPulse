package cmd

import (
	"fmt"
	"os"

	"github.com/gitpulse/gitpulse/internal/git"
	"github.com/gitpulse/gitpulse/internal/validation"
	"github.com/gitpulse/gitpulse/internal/version"
	"github.com/spf13/cobra"
)

func newDoctorCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "doctor",
		Short: "Diagnose the GitPulse installation",
		Long: `Run a series of health checks against the environment, the
configuration, and the configured repository.

Checks are printed as:

  [OK]   the check passed
  [WARN] the check passed but may cause problems
  [FAIL] the check failed

The exit code is 1 when any check fails.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runDoctor(cmd, nil)
		},
	}
	return cmd
}

// doctorCheck describes the outcome of a single health check.
type doctorCheck struct {
	name string
	ok   bool
	warn bool
	note string
}

func runDoctor(cmd *cobra.Command, _ []string) error {
	ctx := cmd.Context()
	failures := 0

	a, err := newApp()
	if err != nil {
		return err
	}
	defer a.close()

	fmt.Printf("GitPulse doctor — %s\n", version.String())
	fmt.Println()

	checks := []doctorCheck{}

	// 1. git binary.
	checks = append(checks, func() doctorCheck {
		if err := git.EnsureGitAvailable(); err != nil {
			return doctorCheck{name: "git is installed", note: err.Error()}
		}
		return doctorCheck{name: "git is installed", ok: true}
	}())

	// 2. Configuration file.
	checks = append(checks, func() doctorCheck {
		if a.manager.Exists() {
			return doctorCheck{name: "configuration file exists", ok: true, note: a.configPath}
		}
		return doctorCheck{name: "configuration file exists", note: fmt.Sprintf("no configuration file at %s; run 'gitpulse init'", a.configPath)}
	}())

	// 3. Configuration validity.
	problems := validation.Validate(a.cfg)
	if len(problems) > 0 {
		checks = append(checks, doctorCheck{name: "configuration is valid", note: fmt.Sprintf("%d problem(s) found", len(problems))})
	} else {
		checks = append(checks, doctorCheck{name: "configuration is valid", ok: true})
	}

	// 4. Repository detection.
	checks = append(checks, func() doctorCheck {
		if a.cfg.RepositoryPath == "" {
			return doctorCheck{name: "repository is a git working tree", note: "repository_path is not set"}
		}
		client := a.newGitClient()
		repo, err := client.Detect(ctx)
		if err != nil {
			return doctorCheck{name: "repository is a git working tree", note: err.Error()}
		}
		if !repo {
			return doctorCheck{name: "repository is a git working tree", note: fmt.Sprintf("%s is not a git working tree", a.cfg.RepositoryPath)}
		}
		return doctorCheck{name: "repository is a git working tree", ok: true, note: a.cfg.RepositoryPath}
	}())

	// 5. Remote branch.
	if a.cfg.RepositoryPath != "" {
		checks = append(checks, func() doctorCheck {
			client := a.newGitClient()
			repo, _ := client.Detect(ctx)
			if !repo {
				return doctorCheck{name: "remote branch exists on remote", note: "repository is not a git working tree"}
			}
			hasRemote, err := client.HasRemote(ctx, a.cfg.PushRemote)
			if err != nil {
				return doctorCheck{name: "remote branch exists on remote", note: err.Error()}
			}
			if !hasRemote {
				return doctorCheck{name: "remote branch exists on remote", ok: true, warn: true, note: fmt.Sprintf("remote %q is not configured; pushes will be skipped until it is added", a.cfg.PushRemote)}
			}
			exists, err := client.RemoteBranchExists(ctx, a.cfg.PushRemote, a.cfg.RemoteBranch)
			if err != nil {
				return doctorCheck{name: "remote branch exists on remote", note: err.Error()}
			}
			if !exists {
				return doctorCheck{name: "remote branch exists on remote", ok: true, warn: true, note: fmt.Sprintf("%s/%s has no remote branch yet; the first push will create it", a.cfg.PushRemote, a.cfg.RemoteBranch)}
			}
			return doctorCheck{name: "remote branch exists on remote", ok: true, note: fmt.Sprintf("%s/%s", a.cfg.PushRemote, a.cfg.RemoteBranch)}
		}())
	}

	// 6. Log file writability.
	checks = append(checks, func() doctorCheck {
		f, err := os.OpenFile(a.logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			return doctorCheck{name: "log file is writable", note: err.Error()}
		}
		f.Close()
		return doctorCheck{name: "log file is writable", ok: true, note: a.logPath}
	}())

	for _, c := range checks {
		status := "[FAIL]"
		switch {
		case c.ok && c.warn:
			status = "[WARN]"
		case c.ok:
			status = "[OK]  "
		default:
			failures++
		}
		fmt.Printf("  %s %s\n", status, c.name)
		if c.note != "" {
			fmt.Printf("        %s\n", c.note)
		}
	}

	if failures > 0 {
		return fmt.Errorf("doctor found %d failing check(s)", failures)
	}
	return nil
}
