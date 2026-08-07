package validation

import (
	"path/filepath"
	"testing"

	"github.com/gitpulse/gitpulse/internal/config"
)

// validConfig returns a configuration that passes all checks.
func validConfig(t *testing.T) config.Config {
	t.Helper()
	dir := t.TempDir()
	return config.Config{
		Enabled:                  true,
		RepositoryPath:           dir,
		RemoteBranch:             "main",
		CommitsPerDay:            4,
		CommitIntervalMinutes:    0,
		StartTime:                "09:00",
		EndTime:                  "18:00",
		Timezone:                 "Local",
		DryRun:                   false,
		LogLevel:                 "info",
		MetadataDir:              ".gitpulse",
		MetadataFile:             "activity.log",
		PushRemote:               "origin",
		CommitMessageTemplate:    "chore: GitPulse automated pulse #%d",
		MaxCommitsPerCycle:       100,
		MinimumCommitIntervalMin: 1,
	}
}

func TestValidConfigPasses(t *testing.T) {
	if len(Validate(validConfig(t))) != 0 {
		t.Fatalf("valid config should pass, problems: %+v", Validate(validConfig(t)))
	}
}

func TestValidateProblemCases(t *testing.T) {
	tests := []struct {
		name string
		key  string
		mut  func(*config.Config)
	}{
		{"empty repository path", config.KeyRepositoryPath, func(c *config.Config) { c.RepositoryPath = "" }},
		{"missing repository path", config.KeyRepositoryPath, func(c *config.Config) { c.RepositoryPath = filepath.Join(t.TempDir(), "nope") }},
		{"empty branch", config.KeyRemoteBranch, func(c *config.Config) { c.RemoteBranch = "" }},
		{"zero commits", config.KeyCommitsPerDay, func(c *config.Config) { c.CommitsPerDay = 0 }},
		{"negative commits", config.KeyCommitsPerDay, func(c *config.Config) { c.CommitsPerDay = -3 }},
		{"too many commits", config.KeyCommitsPerDay, func(c *config.Config) { c.CommitsPerDay = MaxCommitsPerDay + 1 }},
		{"negative interval", config.KeyCommitIntervalMinutes, func(c *config.Config) { c.CommitIntervalMinutes = -1 }},
		{"invalid start time", config.KeyStartTime, func(c *config.Config) { c.StartTime = "25:00" }},
		{"invalid end time", config.KeyEndTime, func(c *config.Config) { c.EndTime = "noon" }},
		{"end before start", config.KeyEndTime, func(c *config.Config) { c.EndTime = "08:00" }},
		{"end equals start", config.KeyEndTime, func(c *config.Config) { c.EndTime = "09:00" }},
		{"interval larger than window", config.KeyCommitIntervalMinutes, func(c *config.Config) { c.CommitIntervalMinutes = 60 * 20 }},
		{"interval below minimum", config.KeyCommitIntervalMinutes, func(c *config.Config) { c.CommitIntervalMinutes = 5; c.MinimumCommitIntervalMin = 30 }},
		{"invalid timezone", config.KeyTimezone, func(c *config.Config) { c.Timezone = "Mars/Olympus" }},
		{"empty timezone", config.KeyTimezone, func(c *config.Config) { c.Timezone = "" }},
		{"invalid log level", config.KeyLogLevel, func(c *config.Config) { c.LogLevel = "verbose" }},
		{"empty metadata dir", config.KeyMetadataDir, func(c *config.Config) { c.MetadataDir = "" }},
		{"metadata escapes repo", config.KeyMetadataDir, func(c *config.Config) { c.MetadataDir = "../etc" }},
		{"metadata absolute path", config.KeyMetadataDir, func(c *config.Config) { c.MetadataDir = "/tmp/x" }},
		{"template without placeholder", config.KeyCommitMessageTemplate, func(c *config.Config) { c.CommitMessageTemplate = "chore: pulse" }},
		{"max commits too small", config.KeyMaxCommitsPerCycle, func(c *config.Config) { c.MaxCommitsPerCycle = 0 }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := validConfig(t)
			tt.mut(&cfg)

			problems := Validate(cfg)
			if len(problems) == 0 {
				t.Fatalf("expected at least one problem for %s, got none", tt.name)
			}
			found := false
			for _, p := range problems {
				if p.Key == tt.key {
					found = true
					if p.Message == "" {
						t.Errorf("problem for key %q has empty message", tt.key)
					}
					if p.Fix == "" {
						t.Errorf("problem for key %q has empty fix", tt.key)
					}
				}
			}
			if !found {
				t.Errorf("no problem reported for key %q (got %+v)", tt.key, problems)
			}
		})
	}
}

func TestValidateReportsMultipleProblems(t *testing.T) {
	cfg := config.Config{
		RepositoryPath: "",
		RemoteBranch:   "",
		Timezone:       "Nowhere/Land",
	}
	problems := Validate(cfg)
	if len(problems) < 3 {
		t.Errorf("expected multiple problems, got %d", len(problems))
	}
	if !problems.HasFatal() {
		t.Error("HasFatal should be true when problems exist")
	}
}
