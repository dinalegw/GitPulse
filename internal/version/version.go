// Package version provides version metadata for GitPulse builds.
//
// The Version, Commit, and Date values can be overridden at build time by
// the linker using the -X flag, for example:
//
//	go build -ldflags "-X github.com/gitpulse/gitpulse/internal/version.Version=1.0.0 \
//	-X github.com/gitpulse/gitpulse/internal/version.Commit=abcdef \
//	-X github.com/gitpulse/gitpulse/internal/version.Date=2026-08-07"
package version

import (
	"fmt"
	"runtime"
	"strings"
)

var (
	// Version is the semantic version of the build. It defaults to the
	// released version and can be overridden by the linker.
	Version = "1.0.0"

	// Commit is the git commit SHA the binary was built from. It is set via
	// the linker at build time.
	Commit = "unknown"

	// Date is the build timestamp. It is set via the linker at build time.
	Date = "unknown"
)

// String returns a single-line, human readable version string.
func String() string {
	return fmt.Sprintf("GitPulse v%s (%s)", Version, Commit)
}

// Detail returns a multi-line description of the build including the Go
// runtime and platform information.
func Detail() string {
	var b strings.Builder
	b.WriteString(String())
	b.WriteString("\n")
	b.WriteString(fmt.Sprintf("Build date: %s\n", Date))
	b.WriteString(fmt.Sprintf("Go version: %s\n", runtime.Version()))
	b.WriteString(fmt.Sprintf("Platform:   %s/%s\n", runtime.GOOS, runtime.GOARCH))
	return b.String()
}
