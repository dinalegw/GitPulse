package cmd

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dinalegw/GitPulse/internal/config"
)

// execute runs the root command with the given args, returning stdout.
func execute(t *testing.T, args ...string) (string, error) {
	t.Helper()
	var out, errBuf bytes.Buffer
	root := NewRootCmd()
	root.SetArgs(args)
	root.SetOut(&out)
	root.SetErr(&errBuf)
	err := root.Execute()
	return out.String(), err
}

func TestRootCommandListsSubcommands(t *testing.T) {
	out, err := execute(t, "help")
	if err != nil {
		t.Fatalf("root help failed: %v", err)
	}
	for _, name := range []string{"init", "config", "run", "status", "logs", "validate", "version", "doctor"} {
		if !strings.Contains(out, name) {
			t.Errorf("root help missing command %q", name)
		}
	}
}

func TestVersionCommand(t *testing.T) {
	out, err := execute(t, "version")
	if err != nil {
		t.Fatalf("version failed: %v", err)
	}
	if !strings.Contains(out, "GitPulse v1.0.0") {
		t.Errorf("version output = %q", out)
	}
}

func TestInitCreatesConfiguration(t *testing.T) {
	repo := t.TempDir()
	cfgPath := filepath.Join(t.TempDir(), "config.yaml")

	out, err := execute(t, "init", "--config", cfgPath, "--repo", repo, "--branch", "main", "--commits", "5", "--enabled")
	if err != nil {
		t.Fatalf("init failed: %v", err)
	}
	if !strings.Contains(out, "GitPulse initialized") {
		t.Errorf("init output = %q", out)
	}

	m := config.NewManager(cfgPath)
	if !m.Exists() {
		t.Fatal("init did not create the configuration file")
	}
	cfg, err := m.Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.RepositoryPath != repo || cfg.CommitsPerDay != 5 || !cfg.Enabled {
		t.Errorf("init config = %+v", cfg)
	}
}

func TestInitRefusesToOverwrite(t *testing.T) {
	cfgPath := filepath.Join(t.TempDir(), "config.yaml")
	m := config.NewManager(cfgPath)
	if err := m.Save(config.Config{CommitsPerDay: 2}); err != nil {
		t.Fatal(err)
	}

	if _, err := execute(t, "init", "--config", cfgPath); err == nil {
		t.Error("init should refuse to overwrite an existing configuration")
	}
}

func TestConfigSetUpdatesFile(t *testing.T) {
	cfgPath := filepath.Join(t.TempDir(), "config.yaml")
	m := config.NewManager(cfgPath)
	if err := m.Save(config.Config{CommitsPerDay: 2}); err != nil {
		t.Fatal(err)
	}

	if _, err := execute(t, "config", "set", "--config", cfgPath, "commits_per_day", "7"); err != nil {
		t.Fatalf("config set failed: %v", err)
	}

	cfg, err := m.Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CommitsPerDay != 7 {
		t.Errorf("commits_per_day = %d, want 7", cfg.CommitsPerDay)
	}
}

func TestRunScheduleRequiresEnabled(t *testing.T) {
	cfgPath := filepath.Join(t.TempDir(), "config.yaml")
	repo := t.TempDir()
	m := config.NewManager(cfgPath)
	if err := m.Save(config.Config{Enabled: false, RepositoryPath: repo}); err != nil {
		t.Fatal(err)
	}

	_, err := execute(t, "run", "--schedule", "--config", cfgPath)
	if err == nil {
		t.Fatal("run --schedule should fail when enabled=false")
	}
	if !strings.Contains(err.Error(), "enabled") {
		t.Errorf("error should mention enabled, got: %v", err)
	}
}
