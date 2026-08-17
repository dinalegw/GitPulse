package cmd

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/gitpulse/gitpulse/internal/commits"
	"github.com/gitpulse/gitpulse/internal/config"
	"github.com/gitpulse/gitpulse/internal/git"
	"github.com/gitpulse/gitpulse/internal/logger"
	"github.com/gitpulse/gitpulse/internal/utils"
	"github.com/gitpulse/gitpulse/internal/validation"
	"github.com/spf13/cobra"
)

func runInteractive(cmd *cobra.Command) error {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println("Welcome to GitPulse Interactive Mode")
	fmt.Println("=====================================")
	fmt.Println()

	log, err := logger.New("info", "text", "", os.Stderr)
	if err != nil {
		return err
	}
	defer log.Close()

	absPath, err := promptRepoPath(reader, log)
	if err != nil {
		return err
	}

	commitCount, err := promptCommitCount(reader)
	if err != nil {
		return err
	}

	intervalMin, err := promptInterval(reader)
	if err != nil {
		return err
	}

	message, err := promptMessage(reader)
	if err != nil {
		return err
	}

	template := message
	if !strings.Contains(template, "%d") {
		template = template + " #%d"
	}
	escaped := strings.ReplaceAll(template, "%d", "\x00")
	escaped = strings.ReplaceAll(escaped, "%", "%%")
	escaped = strings.ReplaceAll(escaped, "\x00", "%d")

	fmt.Println()
	fmt.Printf("Starting: %d commit(s) to %s\n", commitCount, absPath)
	fmt.Printf("Interval: %d minutes between commits\n", intervalMin)
	fmt.Printf("Message:  %s\n", message)
	fmt.Println()

	cfg := config.Config{
		Enabled:                  true,
		RepositoryPath:           absPath,
		RemoteBranch:             "main",
		CommitsPerDay:            commitCount,
		CommitIntervalMinutes:    intervalMin,
		StartTime:                "09:00",
		EndTime:                  "18:00",
		Timezone:                 "Local",
		DryRun:                   false,
		LogLevel:                 "info",
		MetadataDir:              ".gitpulse",
		MetadataFile:             "activity.log",
		PushRemote:               "origin",
		CommitMessageTemplate:    escaped,
		MaxCommitsPerCycle:       100,
		MinimumCommitIntervalMin: 1,
	}

	if problems := validation.Validate(cfg); len(problems) > 0 {
		for _, p := range problems {
			fmt.Printf("Validation issue: %s Fix: %s\n", p.Message, p.Fix)
		}
		return fmt.Errorf("configuration is not valid")
	}

	client := git.New(absPath, git.NewRealRunner(log))
	cycle, err := commits.NewCycle(cfg, client, log, false)
	if err != nil {
		return err
	}

	ctx := signalContext(cmd.Context())
	startTime := time.Now()
	totalCreated := 0
	totalSkipped := 0
	totalPushed := false

	for i := 0; i < commitCount; i++ {
		fmt.Printf("[%s] Creating commit %d of %d...\n", time.Now().Format("15:04:05"), i+1, commitCount)
		res, err := cycle.RunN(ctx, 1)
		if err != nil {
			fmt.Printf("Error: %v\n", err)
			return err
		}
		totalCreated += res.Created
		totalSkipped += res.Skipped
		if res.Pushed {
			totalPushed = true
		}
		fmt.Printf("[%s] Created commit #%d (pushed: %v)\n", time.Now().Format("15:04:05"), res.FirstSeq, res.Pushed)

		if i < commitCount-1 && intervalMin > 0 {
			fmt.Printf("[%s] Waiting %d minutes...\n", time.Now().Format("15:04:05"), intervalMin)
			select {
			case <-ctx.Done():
				fmt.Println("\nInterrupted.")
				return ctx.Err()
			case <-time.After(time.Duration(intervalMin) * time.Minute):
			}
		}
	}

	duration := time.Since(startTime)
	fmt.Println()
	fmt.Println("=====================================")
	fmt.Println("Done!")
	fmt.Printf("Total commits created: %d\n", totalCreated)
	fmt.Printf("Total commits skipped: %d\n", totalSkipped)
	fmt.Printf("Pushed:                %v\n", totalPushed)
	fmt.Printf("Duration:              %s\n", duration.Round(time.Millisecond))
	fmt.Printf("Finished at:           %s\n", time.Now().Format("2006-01-02 15:04:05 MST"))
	fmt.Println("=====================================")

	return nil
}

func promptRepoPath(reader *bufio.Reader, log *logger.Logger) (string, error) {
	for attempts := 0; attempts < 3; attempts++ {
		repoPath, err := prompt(reader, "Enter repository path")
		if err != nil {
			return "", err
		}
		repoPath = strings.TrimSpace(repoPath)
		if repoPath == "" {
			fmt.Println("Error: repository path cannot be empty. Please try again.")
			continue
		}

		absPath, err := utils.ExpandPath(repoPath)
		if err != nil {
			fmt.Printf("Error: invalid path: %v. Please try again.\n", err)
			continue
		}

		if !utils.DirExists(absPath) {
			fmt.Printf("Error: directory does not exist: %s. Please try again.\n", absPath)
			continue
		}

		client := git.New(absPath, git.NewRealRunner(log))
		ctx := context.Background()
		isRepo, err := client.Detect(ctx)
		if err != nil {
			fmt.Printf("Error: cannot inspect repository: %v. Please try again.\n", err)
			continue
		}
		if !isRepo {
			fmt.Printf("Error: %s is not a git working tree. Run 'git init' there first. Please try again.\n", absPath)
			continue
		}

		return absPath, nil
	}
	return "", fmt.Errorf("too many invalid repository path attempts")
}

func promptCommitCount(reader *bufio.Reader) (int, error) {
	for attempts := 0; attempts < 3; attempts++ {
		commitsStr, err := prompt(reader, "Number of commits")
		if err != nil {
			return 0, err
		}
		commitsStr = strings.TrimSpace(commitsStr)
		var commitCount int
		if _, err := fmt.Sscanf(commitsStr, "%d", &commitCount); err != nil || commitCount < 1 {
			fmt.Println("Error: number of commits must be a positive integer. Please try again.")
			continue
		}
		return commitCount, nil
	}
	return 0, fmt.Errorf("too many invalid commit count attempts")
}

func promptInterval(reader *bufio.Reader) (int, error) {
	for attempts := 0; attempts < 3; attempts++ {
		intervalStr, err := prompt(reader, "Minutes between commits")
		if err != nil {
			return 0, err
		}
		intervalStr = strings.TrimSpace(intervalStr)
		var intervalMin int
		if _, err := fmt.Sscanf(intervalStr, "%d", &intervalMin); err != nil || intervalMin < 0 {
			fmt.Println("Error: interval must be zero or a positive integer. Please try again.")
			continue
		}
		return intervalMin, nil
	}
	return 0, fmt.Errorf("too many invalid interval attempts")
}

func promptMessage(reader *bufio.Reader) (string, error) {
	for attempts := 0; attempts < 3; attempts++ {
		message, err := prompt(reader, "Commit message")
		if err != nil {
			return "", err
		}
		message = strings.TrimSpace(message)
		if message == "" {
			fmt.Println("Error: commit message cannot be empty. Please try again.")
			continue
		}
		return message, nil
	}
	return "", fmt.Errorf("too many invalid message attempts")
}

func prompt(reader *bufio.Reader, text string) (string, error) {
	fmt.Printf("%s: ", text)
	input, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return input, nil
}
