package cmd

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dinalegw/GitPulse/internal/commits"
	"github.com/dinalegw/GitPulse/internal/config"
	"github.com/dinalegw/GitPulse/internal/git"
	"github.com/dinalegw/GitPulse/internal/logger"
	"github.com/dinalegw/GitPulse/internal/repository"
	"github.com/dinalegw/GitPulse/internal/utils"
	"github.com/dinalegw/GitPulse/internal/validation"
	"github.com/dinalegw/GitPulse/internal/version"
	"github.com/spf13/cobra"
)

func runInteractive(cmd *cobra.Command) error {
	reader := bufio.NewReader(os.Stdin)

	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("cannot determine current directory: %w", err)
	}

	fmt.Println("Welcome to GitPulse Interactive Mode")
	fmt.Println("=====================================")
	fmt.Println("Developed by BLACKSAUCE")
	fmt.Printf("Version: %s\n", version.String())
	fmt.Println()
	fmt.Printf("Current directory: %s\n", cwd)
	fmt.Println()

	log, err := logger.New("info", "text", "", os.Stderr)
	if err != nil {
		return err
	}
	defer log.Close()

	absPath, err := promptRepoPath(reader, log, cwd)
	if err != nil {
		return err
	}

	pullClient := git.New(absPath, git.NewRealRunner(log))
	pullCtx := context.Background()
	branch, err := pullClient.CurrentBranch(pullCtx)
	if err != nil {
		fmt.Printf("Warning: cannot determine current branch: %v\n", err)
		branch = "main"
	} else {
		hasRemote, _ := pullClient.HasRemote(pullCtx, "origin")
		if hasRemote {
			fmt.Printf("Pulling latest changes from origin/%s...\n", branch)
			if err := pullClient.Pull(pullCtx, "origin", branch); err != nil {
				fmt.Printf("Error: failed to pull latest changes: %v\n", err)
				fmt.Println("Please resolve the issue and try again.")
				return err
			}
			fmt.Printf("Repository is up to date with origin/%s.\n", branch)
		} else {
			fmt.Println("No remote 'origin' configured.")
			remoteInput, err := prompt(reader, "Add remote origin? [Y/n]")
			if err != nil {
				return err
			}
			remoteInput = strings.TrimSpace(remoteInput)
			if strings.EqualFold(remoteInput, "y") || strings.EqualFold(remoteInput, "yes") || remoteInput == "" {
				url, err := prompt(reader, "Enter remote URL")
				if err != nil {
					return err
				}
				url = strings.TrimSpace(url)
				if url != "" {
					if addErr := pullClient.AddRemote(pullCtx, "origin", url); addErr != nil {
						fmt.Printf("Error: failed to add remote: %v\n", addErr)
						return addErr
					}
					fmt.Printf("Remote 'origin' added: %s\n", url)
					fmt.Printf("Pulling latest changes from origin/%s...\n", branch)
					if pullErr := pullClient.Pull(pullCtx, "origin", branch); pullErr != nil {
						fmt.Printf("Warning: pull failed after adding remote: %v\n", pullErr)
						fmt.Println("Continuing with local commits. You can push manually later.")
					} else {
						fmt.Printf("Repository is up to date with origin/%s.\n", branch)
					}
				} else {
					fmt.Println("No URL provided. Skipping remote setup.")
					fmt.Println("You can add a remote later with: git remote add origin <url>")
				}
			} else {
				fmt.Println("Skipping remote setup.")
				fmt.Println("You can add a remote later with: git remote add origin <url>")
			}
		}
	}
	fmt.Println()

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
		RemoteBranch:             branch,
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

func promptRepoPath(reader *bufio.Reader, log *logger.Logger, cwd string) (string, error) {
	for attempts := 0; attempts < 10; attempts++ {
		defaultPath := "."
		promptText := "Enter repository path"

		if attempts == 0 {
			client := git.New(cwd, git.NewRealRunner(log))
			ctx := context.Background()
			if isRepo, _ := client.Detect(ctx); isRepo {
				defaultPath = cwd
				promptText = fmt.Sprintf("Detected Git repository in current directory:\n%s\n\nUse this repository? [Y/n]", cwd)
			} else {
				promptText = fmt.Sprintf("Enter repository path [%s]", defaultPath)
			}
		}

		input, err := prompt(reader, promptText)
		if err != nil {
			return "", err
		}
		input = strings.TrimSpace(input)

		if attempts == 0 {
			client := git.New(cwd, git.NewRealRunner(log))
			ctx := context.Background()
			if isRepo, _ := client.Detect(ctx); isRepo {
				if input == "" || strings.EqualFold(input, "y") || strings.EqualFold(input, "yes") || input == "." {
					return cwd, nil
				}
				if strings.EqualFold(input, "n") || strings.EqualFold(input, "no") {
					promptText = "Enter repository path [.]"
					input, err = prompt(reader, promptText)
					if err != nil {
						return "", err
					}
					input = strings.TrimSpace(input)
				}
			}
		}

		if input == "" {
			input = defaultPath
		}

		absPath, err := repository.ResolveRepositoryPath(input)
		if err != nil {
			printRepoError(err)
			continue
		}

		info, err := repository.ValidateRepository(context.Background(), absPath, git.NewRealRunner(log))
		if err != nil {
			if repoErr, ok := err.(*repository.PathError); ok {
				if strings.Contains(repoErr.Reason, "does not exist") && isSingleComponent(input) {
					foundPath, foundInfo := searchCommonDirectories(input, reader, log)
					if foundPath != "" {
						if !foundInfo.IsClean {
							fmt.Println()
							fmt.Println("Warning: repository has uncommitted changes.")
							fmt.Println("GitPulse will not overwrite your existing work.")
							fmt.Println("Please commit or stash your changes before continuing.")
							fmt.Println()
							continue
						}
						if foundInfo.Readme == "" {
							fmt.Println()
							fmt.Printf("Warning: README.md not found in %s.\n", foundInfo.Path)
							readmeInput, err := prompt(reader, "Continue without README.md? [y/N]")
							if err != nil {
								return "", err
							}
							readmeInput = strings.TrimSpace(readmeInput)
							if !strings.EqualFold(readmeInput, "y") && !strings.EqualFold(readmeInput, "yes") {
								createInput, err := prompt(reader, "Create README.md? [Y/n]")
								if err != nil {
									return "", err
								}
								createInput = strings.TrimSpace(createInput)
								if strings.EqualFold(createInput, "y") || strings.EqualFold(createInput, "yes") || createInput == "" {
									readmePath := filepath.Join(foundInfo.Path, "README.md")
									content := "# " + filepath.Base(foundInfo.Path) + "\n\nThis repository is managed by GitPulse.\n"
									if writeErr := os.WriteFile(readmePath, []byte(content), 0o644); writeErr != nil {
										fmt.Printf("Warning: could not create README.md: %v\n", writeErr)
									} else {
										fmt.Printf("Created README.md in %s\n", foundInfo.Path)
										foundInfo.Readme = "README.md"
									}
								}
							}
						}
						fmt.Println()
						fmt.Printf("Repository: %s\n", foundInfo.Path)
						fmt.Printf("Branch:     %s\n", foundInfo.Branch)
						if foundInfo.HasRemote {
							fmt.Printf("Remote:    %s\n", foundInfo.RemoteName)
						} else {
							fmt.Printf("Remote:    (none)\n")
						}
						if foundInfo.Readme != "" {
							fmt.Printf("README:    %s\n", foundInfo.Readme)
						} else {
							fmt.Printf("README:    (none)\n")
						}
						fmt.Println()
						return foundPath, nil
					}
					fmt.Println()
					fmt.Printf("Error: %s\n", repoErr.Reason)
					if repoErr.Hint != "" {
						fmt.Printf("\nHint: %s\n", repoErr.Hint)
					}
					home, homeErr := utils.HomeDir()
					searched := []string{filepath.Join(cwd, input)}
					if homeErr == nil {
						searched = append(searched, filepath.Join(home, input))
					}
					for _, d := range commonProjectDirs() {
						searched = append(searched, filepath.Join(d, input))
					}
					fmt.Printf("\nGitPulse searched:\n")
					for _, p := range searched {
						fmt.Printf("  - %s\n", p)
					}
					fmt.Println()
					continue
				}
			}
			printRepoError(err)
			continue
		}

		if !info.IsClean {
			fmt.Println()
			fmt.Println("Warning: repository has uncommitted changes.")
			fmt.Println("GitPulse will not overwrite your existing work.")
			fmt.Println("Please commit or stash your changes before continuing.")
			fmt.Println()
			continue
		}

		if info.Readme == "" {
			fmt.Println()
			fmt.Printf("Warning: README.md not found in %s.\n", info.Path)
			readmeInput, err := prompt(reader, "Continue without README.md? [y/N]")
			if err != nil {
				return "", err
			}
			readmeInput = strings.TrimSpace(readmeInput)
			if !strings.EqualFold(readmeInput, "y") && !strings.EqualFold(readmeInput, "yes") {
				createInput, err := prompt(reader, "Create README.md? [Y/n]")
				if err != nil {
					return "", err
				}
				createInput = strings.TrimSpace(createInput)
				if strings.EqualFold(createInput, "y") || strings.EqualFold(createInput, "yes") || createInput == "" {
					readmePath := filepath.Join(info.Path, "README.md")
					content := "# " + filepath.Base(info.Path) + "\n\nThis repository is managed by GitPulse.\n"
					if writeErr := os.WriteFile(readmePath, []byte(content), 0o644); writeErr != nil {
						fmt.Printf("Warning: could not create README.md: %v\n", writeErr)
					} else {
						fmt.Printf("Created README.md in %s\n", info.Path)
						info.Readme = "README.md"
					}
				}
			}
		}

		fmt.Println()
		fmt.Printf("Repository: %s\n", info.Path)
		fmt.Printf("Branch:     %s\n", info.Branch)
		if info.HasRemote {
			fmt.Printf("Remote:    %s\n", info.RemoteName)
		} else {
			fmt.Printf("Remote:    (none)\n")
		}
		if info.Readme != "" {
			fmt.Printf("README:    %s\n", info.Readme)
		} else {
			fmt.Printf("README:    (none)\n")
		}
		fmt.Println()

		return absPath, nil
	}
	return "", fmt.Errorf("too many invalid repository path attempts")
}

func searchCommonDirectories(name string, reader *bufio.Reader, log *logger.Logger) (string, *repository.RepositoryInfo) {
	candidates := []string{}
	home, homeErr := utils.HomeDir()
	if homeErr == nil {
		candidates = append(candidates, filepath.Join(home, name))
	}
	for _, d := range commonProjectDirs() {
		candidates = append(candidates, filepath.Join(d, name))
	}

	for _, candidate := range candidates {
		info, err := repository.ValidateRepository(context.Background(), candidate, git.NewRealRunner(log))
		if err == nil {
			return candidate, info
		}
	}

	if homeErr == nil {
		foundPath, foundInfo := searchHomeRecursive(name, home, 4, log)
		if foundPath != "" {
			return foundPath, foundInfo
		}
	}

	return "", nil
}

func searchHomeRecursive(name string, root string, maxDepth int, log *logger.Logger) (string, *repository.RepositoryInfo) {
	var foundPath string
	var foundInfo *repository.RepositoryInfo

	filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		if filepath.Base(path) != name {
			return nil
		}
		depth := len(strings.Split(path, string(os.PathSeparator))) - len(strings.Split(root, string(os.PathSeparator)))
		if depth > maxDepth {
			return filepath.SkipDir
		}
		info, err := repository.ValidateRepository(context.Background(), path, git.NewRealRunner(log))
		if err == nil {
			foundPath = path
			foundInfo = info
			return filepath.SkipDir
		}
		return nil
	})

	return foundPath, foundInfo
}

func commonProjectDirs() []string {
	home, err := utils.HomeDir()
	if err != nil {
		return nil
	}
	dirs := []string{"projects", "code", "repos", "src", "workspace", "Documents", "Desktop"}
	var result []string
	for _, d := range dirs {
		p := filepath.Join(home, d)
		if info, err := os.Stat(p); err == nil && info.IsDir() {
			result = append(result, p)
		}
	}
	return result
}

func isSingleComponent(input string) bool {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return false
	}
	if strings.HasPrefix(trimmed, "./") || strings.HasPrefix(trimmed, "../") || trimmed == "." || trimmed == ".." {
		return false
	}
	if strings.HasPrefix(trimmed, "/") || strings.HasPrefix(trimmed, `\`) {
		return false
	}
	cleaned := filepath.Clean(trimmed)
	if cleaned == "." || cleaned == ".." {
		return false
	}
	return !strings.ContainsRune(cleaned, os.PathSeparator)
}

func printRepoError(err error) {
	if repoErr, ok := err.(*repository.PathError); ok {
		fmt.Printf("Error: %s\n", repoErr.Reason)
		if repoErr.Hint != "" {
			fmt.Printf("\nHint: %s\n", repoErr.Hint)
		}
	} else {
		fmt.Printf("Error: %v\n", err)
	}
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
