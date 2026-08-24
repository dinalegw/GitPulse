package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dinalegw/GitPulse/internal/utils"
)

func testManager(t *testing.T) *Manager {
	t.Helper()
	return NewManager(filepath.Join(t.TempDir(), "config.yaml"))
}

func TestLoadDefaultsWhenFileMissing(t *testing.T) {
	m := testManager(t)
	cfg, err := m.Load()
	if err != nil {
		t.Fatalf("Load on missing file should not fail: %v", err)
	}

	if cfg.Enabled {
		t.Error("default enabled should be false")
	}
	if cfg.CommitsPerDay != 4 {
		t.Errorf("default commits_per_day = %d, want 4", cfg.CommitsPerDay)
	}
	if cfg.RemoteBranch != "main" {
		t.Errorf("default remote_branch = %q, want main", cfg.RemoteBranch)
	}
	if cfg.StartTime != "09:00" || cfg.EndTime != "18:00" {
		t.Errorf("default schedule = %s-%s, want 09:00-18:00", cfg.StartTime, cfg.EndTime)
	}
	if cfg.MetadataDir != ".gitpulse" || cfg.MetadataFile != "activity.log" {
		t.Errorf("default metadata = %s/%s, want .gitpulse/activity.log", cfg.MetadataDir, cfg.MetadataFile)
	}
}

func TestSaveAndLoadRoundTrip(t *testing.T) {
	m := testManager(t)

	cfg, err := m.Load()
	if err != nil {
		t.Fatal(err)
	}
	cfg.Enabled = true
	cfg.RepositoryPath = "/tmp/repo"
	cfg.CommitsPerDay = 7
	cfg.StartTime = "08:30"
	cfg.EndTime = "20:45"
	cfg.Timezone = "Europe/Berlin"

	if err := m.Save(cfg); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	if !m.Exists() {
		t.Fatal("config file should exist after Save")
	}

	got, err := m.Load()
	if err != nil {
		t.Fatalf("reload failed: %v", err)
	}

	if !got.Enabled || got.RepositoryPath != "/tmp/repo" || got.CommitsPerDay != 7 {
		t.Errorf("round trip mismatch: %+v", got)
	}
	if got.StartTime != "08:30" || got.EndTime != "20:45" || got.Timezone != "Europe/Berlin" {
		t.Errorf("schedule round trip mismatch: %+v", got)
	}
}

func TestSavedFileIsHumanReadable(t *testing.T) {
	m := testManager(t)
	cfg, _ := m.Load()
	cfg.CommitsPerDay = 3
	if err := m.Save(cfg); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(m.Path())
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)
	for _, key := range []string{"repository_path", "commits_per_day", "commit_interval_minutes", "start_time", "end_time", "timezone", "dry_run", "log_level", "enabled", "remote_branch"} {
		if !strings.Contains(content, key) {
			t.Errorf("saved YAML is missing key %q:\n%s", key, content)
		}
	}
}

func TestSetKnownKeys(t *testing.T) {
	m := testManager(t)

	cases := []struct {
		key, value string
		assert     func(Config) bool
	}{
		{KeyEnabled, "true", func(c Config) bool { return c.Enabled }},
		{KeyRepositoryPath, "/x/y", func(c Config) bool { return c.RepositoryPath == "/x/y" }},
		{KeyRemoteBranch, "dev", func(c Config) bool { return c.RemoteBranch == "dev" }},
		{KeyCommitsPerDay, "9", func(c Config) bool { return c.CommitsPerDay == 9 }},
		{KeyCommitIntervalMinutes, "30", func(c Config) bool { return c.CommitIntervalMinutes == 30 }},
		{KeyStartTime, "07:00", func(c Config) bool { return c.StartTime == "07:00" }},
		{KeyTimezone, "UTC", func(c Config) bool { return c.Timezone == "UTC" }},
		{KeyDryRun, "true", func(c Config) bool { return c.DryRun }},
		{KeyLogLevel, "debug", func(c Config) bool { return c.LogLevel == "debug" }},
	}

	for _, tc := range cases {
		cfg, err := m.Set(tc.key, tc.value)
		if err != nil {
			t.Errorf("Set(%q) failed: %v", tc.key, err)
			continue
		}
		if !tc.assert(cfg) {
			t.Errorf("Set(%q, %q) did not apply", tc.key, tc.value)
		}
		// Each Set persists; the manager must still load.
		if _, err := m.Load(); err != nil {
			t.Errorf("reload after Set(%q) failed: %v", tc.key, err)
		}
	}
}

func TestSetUnknownKey(t *testing.T) {
	m := testManager(t)
	if _, err := m.Set("not_a_real_key", "x"); err == nil {
		t.Error("Set with unknown key should error")
	}
}

func TestInvalidYAMLFailsGracefully(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	if err := utils.EnsureDir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("enabled: [broken"), 0o644); err != nil {
		t.Fatal(err)
	}

	m := NewManager(path)
	if _, err := m.Load(); err == nil {
		t.Error("Load of malformed YAML should return an error")
	}
}
