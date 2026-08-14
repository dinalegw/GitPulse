// Package cmd defines the GitPulse command line interface.
//
// Each command is kept in its own file, has a single responsibility, and
// delegates all real work to the internal packages. Commands only handle
// flag parsing, output formatting, and error presentation.
package cmd

import (
	"fmt"
	"os"

	"github.com/gitpulse/gitpulse/internal/config"
	"github.com/gitpulse/gitpulse/internal/git"
	"github.com/gitpulse/gitpulse/internal/logger"
	"github.com/gitpulse/gitpulse/internal/utils"
	"github.com/gitpulse/gitpulse/internal/version"
	"github.com/spf13/cobra"
)

var (
	configPathFlag string
	logLevelFlag   string
)

// NewRootCmd builds the root gitpulse command with all subcommands attached.
func NewRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:   "gitpulse",
		Short: "Automate scheduled, user-configured Git commits",
		Long: `GitPulse automates scheduled Git commits on repositories you choose.

GitPulse is transparent and user-controlled. It only ever acts on the
configuration you provide and it never modifies files it does not own.

  GitPulse is intended for automating commits according to your own workflow.
  Users are responsible for ensuring automated commits accurately reflect
  meaningful repository activity.

Run 'gitpulse help <command>' for details about any command.`,
		SilenceUsage:  true,
		SilenceErrors: true,
		Args:          cobra.NoArgs,
		Version:       version.String(),
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runInteractive(cmd)
		},
	}

	root.PersistentFlags().StringVar(&configPathFlag, "config", "", "path to the GitPulse configuration file (default ~/.gitpulse/config.yaml)")
	root.PersistentFlags().StringVar(&logLevelFlag, "log-level", "", "override the configured log level (trace, debug, info, warn, error, fatal, panic)")
	root.SetVersionTemplate(fmt.Sprintf("%s\n", version.Detail()))

	root.AddCommand(
		newInitCmd(),
		newConfigCmd(),
		newRunCmd(),
		newStatusCmd(),
		newLogsCmd(),
		newValidateCmd(),
		newVersionCmd(),
		newDoctorCmd(),
	)

	return root
}

// Execute runs the CLI. It returns a non-zero exit code on failure.
func Execute() int {
	root := NewRootCmd()
	if err := root.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		return 1
	}
	return 0
}

// app bundles the services that most commands need so that individual
// commands stay small.
type app struct {
	manager    *config.Manager
	configPath string
	cfg        config.Config
	log        *logger.Logger
	logPath    string
}

// newApp loads the configuration and builds a logger using the effective log
// level (CLI flag overrides the configured value).
func newApp() (*app, error) {
	path, err := resolveConfigPath()
	if err != nil {
		return nil, err
	}

	manager := config.NewManager(path)
	cfg, err := manager.Load()
	if err != nil {
		return nil, err
	}

	logPath, err := utils.DefaultLogPath()
	if err != nil {
		return nil, err
	}

	level := cfg.LogLevel
	if logLevelFlag != "" {
		level = logLevelFlag
	}

	log, err := logger.New(level, "text", logPath, os.Stderr)
	if err != nil {
		return nil, err
	}

	return &app{manager: manager, configPath: path, cfg: cfg, log: log, logPath: logPath}, nil
}

// close releases the app logger's file handle.
func (a *app) close() {
	_ = a.log.Close()
}

// newGitClient builds a git client operating on the configured repository.
func (a *app) newGitClient() *git.Client {
	return git.New(a.cfg.RepositoryPath, git.NewRealRunner(a.log))
}

// resolveConfigPath returns the configuration file path, preferring the
// --config flag when set.
func resolveConfigPath() (string, error) {
	if configPathFlag != "" {
		return utils.ExpandPath(configPathFlag)
	}
	return utils.DefaultConfigPath()
}
