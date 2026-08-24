package cmd

import (
	"fmt"

	"github.com/dinalegw/GitPulse/internal/version"
	"github.com/spf13/cobra"
)

func newVersionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print the GitPulse version",
		Long: `Print version, build, and runtime information for this GitPulse
binary.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			fmt.Fprint(cmd.OutOrStdout(), version.Detail())
			return nil
		},
	}
}
