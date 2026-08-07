package cmd

import (
	"fmt"

	"github.com/gitpulse/gitpulse/internal/validation"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

func newConfigCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "Show or update the GitPulse configuration",
		Long: `Inspect or modify the GitPulse configuration.

Without a subcommand, config prints the effective configuration: defaults
merged with the values stored in the configuration file.

Configuration is stored as human readable YAML.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runConfigShow(cmd, nil)
		},
	}

	cmd.AddCommand(
		&cobra.Command{
			Use:   "show",
			Short: "Print the effective configuration",
			Args:  cobra.NoArgs,
			RunE: func(cmd *cobra.Command, _ []string) error {
				return runConfigShow(cmd, nil)
			},
		},
		&cobra.Command{
			Use:   "path",
			Short: "Print the configuration file path",
			Args:  cobra.NoArgs,
			RunE: func(cmd *cobra.Command, _ []string) error {
				a, err := newApp()
				if err != nil {
					return err
				}
				defer a.close()
				fmt.Println(a.configPath)
				return nil
			},
		},
		newConfigSetCmd(),
	)

	return cmd
}

func runConfigShow(cmd *cobra.Command, _ []string) error {
	a, err := newApp()
	if err != nil {
		return err
	}
	defer a.close()

	fmt.Printf("# GitPulse configuration\n")
	fmt.Printf("# File: %s\n", a.configPath)
	fmt.Printf("# Source: %s\n", configSource(a.manager.Exists()))
	fmt.Printf("\n")

	data, err := yaml.Marshal(a.cfg)
	if err != nil {
		return fmt.Errorf("cannot render configuration: %w", err)
	}
	fmt.Print(string(data))

	if !a.manager.Exists() {
		fmt.Printf("# Configuration file does not exist yet; run 'gitpulse init' to create it.\n")
	}
	return nil
}

func configSource(exists bool) string {
	if exists {
		return "file (values merged over defaults)"
	}
	return "defaults only (no file yet)"
}

func newConfigSetCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "set <key> <value>",
		Short: "Set a single configuration value",
		Long: `Set a single configuration value and persist it to the
configuration file. Run 'gitpulse config' to see the full list of keys.

Numeric keys accept whole numbers, and the boolean keys enabled and
dry_run accept true/false.`,
		Example: `  gitpulse config set repository_path /home/alice/projects/app
  gitpulse config set commits_per_day 3
  gitpulse config set start_time 10:00
  gitpulse config set timezone Europe/Paris
  gitpulse config set enabled true
  gitpulse config set dry_run true`,
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runConfigSet(cmd, args[0], args[1])
		},
	}
}

func runConfigSet(cmd *cobra.Command, key, value string) error {
	a, err := newApp()
	if err != nil {
		return err
	}
	defer a.close()

	cfg, err := a.manager.Set(key, value)
	if err != nil {
		return err
	}

	fmt.Printf("Set %s = %v\n", key, value)

	for _, p := range validation.Validate(cfg) {
		if p.Key == key {
			fmt.Fprintf(cmd.ErrOrStderr(), "Warning: %s Fix: %s\n", p.Message, p.Fix)
		}
	}
	fmt.Printf("Configuration saved to %s\n", a.configPath)
	return nil
}
