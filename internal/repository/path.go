package repository

import (
	"fmt"
	"strings"

	"github.com/gitpulse/gitpulse/internal/utils"
)

type PathError struct {
	Input  string
	Reason string
	Hint   string
}

func (e *PathError) Error() string {
	if e.Hint != "" {
		return e.Reason + "\n\nHint: " + e.Hint
	}
	return e.Reason
}

func IsCommandLike(input string) bool {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return false
	}
	parts := strings.Fields(trimmed)
	if len(parts) == 0 {
		return false
	}
	commands := map[string]bool{
		"pwd": true, "ls": true, "cd": true, "git": true,
		"cat": true, "echo": true, "mkdir": true, "rm": true,
		"cp": true, "mv": true, "touch": true, "vim": true,
		"nano": true, "less": true, "more": true, "find": true,
		"grep": true, "curl": true, "wget": true, "ssh": true,
		"scp": true, "sudo": true, "apt": true, "npm": true,
		"go": true, "python": true, "python3": true, "node": true,
		"clear": true, "exit": true, "whoami": true, "date": true,
	}
	return commands[parts[0]]
}

func ResolveRepositoryPath(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return "", nil
	}

	if IsCommandLike(trimmed) {
		return "", &PathError{
			Input:  input,
			Reason: fmt.Sprintf("%q was interpreted as a repository path, not a terminal command.", trimmed),
			Hint:   "To select the current directory, enter: .",
		}
	}

	expanded, err := utils.ExpandPath(trimmed)
	if err != nil {
		return "", &PathError{
			Input:  input,
			Reason: fmt.Sprintf("Invalid repository path %q: %v", trimmed, err),
			Hint:   "Use \".\" for the current directory, or enter a full path like /home/user/repo.",
		}
	}

	return expanded, nil
}
