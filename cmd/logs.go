package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/dinalegw/GitPulse/internal/utils"
	"github.com/spf13/cobra"
)

func newLogsCmd() *cobra.Command {
	var lines int
	var tail bool

	cmd := &cobra.Command{
		Use:   "logs",
		Short: "Show recent GitPulse log entries",
		Long: `Print entries from the GitPulse log file, most recent last.

The default log file lives next to the configuration file
(~/.gitpulse/gitpulse.log).`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runLogs(cmd, lines, tail)
		},
	}

	cmd.Flags().IntVarP(&lines, "lines", "n", 50, "number of lines to show")
	cmd.Flags().BoolVar(&tail, "tail", true, "show the most recent lines; disable to show from the start")

	return cmd
}

func runLogs(cmd *cobra.Command, lines int, tail bool) error {
	if lines < 1 {
		return fmt.Errorf("--lines must be at least 1")
	}

	logPath, err := utils.DefaultLogPath()
	if err != nil {
		return err
	}

	if !utils.FileExists(logPath) {
		return fmt.Errorf("no log file found at %s; run a command like 'gitpulse status' or 'gitpulse run' to generate logs", logPath)
	}

	f, err := os.Open(logPath)
	if err != nil {
		return fmt.Errorf("cannot open log file %q: %w", logPath, err)
	}
	defer f.Close()

	if tail {
		if err := printTail(f, cmd, lines); err != nil {
			return err
		}
	} else {
		scanner := bufio.NewScanner(f)
		count := 0
		for scanner.Scan() && count < lines {
			fmt.Fprintln(cmd.OutOrStdout(), scanner.Text())
			count++
		}
		if err := scanner.Err(); err != nil {
			return fmt.Errorf("cannot read log file %q: %w", logPath, err)
		}
	}
	return nil
}

// printTail prints the last n non-empty lines of f using a fixed ring buffer
// so memory usage is bounded regardless of file size.
func printTail(f *os.File, cmd *cobra.Command, n int) error {
	scanner := bufio.NewScanner(f)
	ring := make([]string, n)
	idx := 0
	filled := 0
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		ring[idx%n] = line
		idx++
		if filled < n {
			filled++
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("cannot read log file: %w", err)
	}

	start := idx - filled
	for i := 0; i < filled; i++ {
		fmt.Fprintln(cmd.OutOrStdout(), ring[(start+i)%n])
	}
	return nil
}
