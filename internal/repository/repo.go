package repository

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/dinalegw/GitPulse/internal/git"
)

type RepositoryInfo struct {
	Path       string
	IsBare     bool
	Branch     string
	HasRemote  bool
	RemoteName string
	Readme     string
	IsClean    bool
}

func ValidateRepository(ctx context.Context, path string, runner git.CommandRunner) (*RepositoryInfo, error) {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, &PathError{
				Input:  path,
				Reason: fmt.Sprintf("Repository directory does not exist:\n%s", path),
				Hint:   "Please enter an existing Git repository path.",
			}
		}
		if os.IsPermission(err) {
			return nil, &PathError{
				Input:  path,
				Reason: fmt.Sprintf("GitPulse cannot access:\n%s\n\nCheck your filesystem permissions.", path),
				Hint:   "",
			}
		}
		return nil, &PathError{
			Input:  path,
			Reason: fmt.Sprintf("Cannot access path %q: %v", path, err),
			Hint:   "",
		}
	}

	if !info.IsDir() {
		return nil, &PathError{
			Input:  path,
			Reason: fmt.Sprintf("The specified path is a file, not a directory:\n%s", path),
			Hint:   "Enter a directory containing a Git repository.",
		}
	}

	client := git.New(path, runner)

	isRepo, err := client.Detect(ctx)
	if err != nil {
		return nil, &PathError{
			Input:  path,
			Reason: fmt.Sprintf("Cannot inspect repository at %q: %v", path, err),
			Hint:   "Make sure this directory contains a Git repository.",
		}
	}
	if !isRepo {
		isBare, err := client.IsBare(ctx)
		if err != nil {
			return nil, &PathError{
				Input:  path,
				Reason: fmt.Sprintf("Cannot inspect repository at %q: %v", path, err),
				Hint:   "Make sure this directory contains a Git repository.",
			}
		}
		if isBare {
			return nil, &PathError{
				Input:  path,
				Reason: "This repository is a bare Git repository.\nGitPulse requires a working tree because it modifies files.\nPlease provide a normal working-tree repository.",
				Hint:   "",
			}
		}
		return nil, &PathError{
			Input:  path,
			Reason: fmt.Sprintf("This directory exists but is not a Git repository:\n%s", path),
			Hint:   "Run 'git init' there first, or select a different directory.",
		}
	}

	isBare, err := client.IsBare(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot determine if repository is bare: %w", err)
	}
	if isBare {
		return nil, &PathError{
			Input:  path,
			Reason: "This repository is a bare Git repository.\nGitPulse requires a working tree because it modifies files.\nPlease provide a normal working-tree repository.",
			Hint:   "",
		}
	}

	branch, err := client.CurrentBranch(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot determine current branch: %w", err)
	}

	hasRemote, _ := client.HasRemote(ctx, "origin")
	remoteName := ""
	if hasRemote {
		remoteName = "origin"
	}

	isClean, _ := client.IsClean(ctx)

	readme := findReadme(path)

	return &RepositoryInfo{
		Path:       path,
		IsBare:     isBare,
		Branch:     branch,
		HasRemote:  hasRemote,
		RemoteName: remoteName,
		Readme:     readme,
		IsClean:    isClean,
	}, nil
}

func findReadme(dir string) string {
	names := []string{"README.md", "readme.md", "Readme.md", "README.MD", "README"}
	for _, name := range names {
		p := filepath.Join(dir, name)
		info, err := os.Stat(p)
		if err == nil && !info.IsDir() {
			return name
		}
	}
	return ""
}
