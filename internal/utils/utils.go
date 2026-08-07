// Package utils provides small, reusable helpers used across GitPulse.
//
// The helpers in this package have no dependencies on other GitPulse
// packages, keeping it at the bottom of the dependency graph.
package utils

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// AppDirName is the name of the directory GitPulse uses inside a user's home
// directory to store its configuration and logs.
const AppDirName = ".gitpulse"

// ConfigFileName is the default name of the GitPulse configuration file.
const ConfigFileName = "config.yaml"

// LogFileName is the default name of the GitPulse log file.
const LogFileName = "gitpulse.log"

// HomeDir returns the current user's home directory.
func HomeDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}
	return home, nil
}

// AppDir returns the path to the GitPulse data directory inside the user's
// home directory, for example /home/alice/.gitpulse. The directory is not
// created by this function.
func AppDir() (string, error) {
	home, err := HomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, AppDirName), nil
}

// DefaultConfigPath returns the default path of the configuration file.
func DefaultConfigPath() (string, error) {
	dir, err := AppDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, ConfigFileName), nil
}

// DefaultLogPath returns the default path of the log file.
func DefaultLogPath() (string, error) {
	dir, err := AppDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, LogFileName), nil
}

// ExpandPath expands a leading ~ or ~/ into the user's home directory and
// converts the result to an absolute, clean path. Empty input returns an
// error.
func ExpandPath(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", fmt.Errorf("path must not be empty")
	}

	expanded := path
	if path == "~" {
		home, err := HomeDir()
		if err != nil {
			return "", err
		}
		expanded = home
	} else if strings.HasPrefix(path, "~/") || strings.HasPrefix(path, `~\`) {
		home, err := HomeDir()
		if err != nil {
			return "", err
		}
		expanded = filepath.Join(home, path[2:])
	}

	abs, err := filepath.Abs(expanded)
	if err != nil {
		return "", fmt.Errorf("cannot resolve path %q: %w", path, err)
	}
	return filepath.Clean(abs), nil
}

// ParseClock parses a time-of-day string in the form HH:MM and returns the
// hour and minute. It accepts an optional leading zero but does not accept
// seconds or timezone information.
func ParseClock(value string) (hour, minute int, err error) {
	parts := strings.Split(value, ":")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid time %q: expected HH:MM", value)
	}

	h, err := parseClockField(parts[0], "hour")
	if err != nil {
		return 0, 0, err
	}
	m, err := parseClockField(parts[1], "minute")
	if err != nil {
		return 0, 0, err
	}
	if h > 23 {
		return 0, 0, fmt.Errorf("invalid time %q: hour must be between 00 and 23", value)
	}
	if m > 59 {
		return 0, 0, fmt.Errorf("invalid time %q: minute must be between 00 and 59", value)
	}
	return h, m, nil
}

func parseClockField(value, name string) (int, error) {
	if len(value) != 2 {
		return 0, fmt.Errorf("invalid %s %q: expected two digits", name, value)
	}
	n := 0
	for _, r := range value {
		if r < '0' || r > '9' {
			return 0, fmt.Errorf("invalid %s %q: expected digits only", name, value)
		}
		n = n*10 + int(r-'0')
	}
	return n, nil
}

// ClockString formats hour and minute as a zero padded HH:MM string.
func ClockString(hour, minute int) string {
	return fmt.Sprintf("%02d:%02d", hour, minute)
}

// LoadLocation resolves a timezone name into a time.Location. The special
// value "Local" (case-insensitive) returns time.Local.
func LoadLocation(name string) (*time.Location, error) {
	if strings.EqualFold(strings.TrimSpace(name), "Local") {
		return time.Local, nil
	}
	loc, err := time.LoadLocation(strings.TrimSpace(name))
	if err != nil {
		return nil, fmt.Errorf("invalid timezone %q: %w", name, err)
	}
	return loc, nil
}

// EnsureDir creates the directory at path (and any parents) with the given
// permission bits if it does not already exist. An existing directory is left
// untouched.
func EnsureDir(path string, perm os.FileMode) error {
	if err := os.MkdirAll(path, perm); err != nil {
		return fmt.Errorf("cannot create directory %q: %w", path, err)
	}
	return nil
}

// FileExists reports whether path exists and is a regular file (not a
// directory).
func FileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// DirExists reports whether path exists and is a directory.
func DirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}
