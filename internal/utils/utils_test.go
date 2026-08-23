package utils

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestParseClockValid(t *testing.T) {
	tests := []struct {
		in   string
		hour int
		min  int
	}{
		{"00:00", 0, 0},
		{"09:05", 9, 5},
		{"12:30", 12, 30},
		{"23:59", 23, 59},
	}
	for _, tt := range tests {
		h, m, err := ParseClock(tt.in)
		if err != nil {
			t.Errorf("ParseClock(%q) unexpected error: %v", tt.in, err)
			continue
		}
		if h != tt.hour || m != tt.min {
			t.Errorf("ParseClock(%q) = (%d, %d), want (%d, %d)", tt.in, h, m, tt.hour, tt.min)
		}
	}
}

func TestParseClockInvalid(t *testing.T) {
	invalid := []string{"", "9", "9:00:00", "24:00", "12:60", "abc", "12:3", "1:2", "12 30"}
	for _, in := range invalid {
		if _, _, err := ParseClock(in); err == nil {
			t.Errorf("ParseClock(%q) expected error, got none", in)
		}
	}
}

func TestExpandPath(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("cannot get home dir: %v", err)
	}

	tests := []struct {
		in   string
		want string
	}{
		{"~", home},
		{"~/x", filepath.Join(home, "x")},
		{".", mustAbs(t, ".")},
		{"/abs/path", mustAbs(t, "/abs/path")},
	}
	for _, tt := range tests {
		got, err := ExpandPath(tt.in)
		if err != nil {
			t.Errorf("ExpandPath(%q) unexpected error: %v", tt.in, err)
			continue
		}
		if got != tt.want {
			t.Errorf("ExpandPath(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}

	if _, err := ExpandPath(""); err == nil {
		t.Error("ExpandPath(\"\") expected error, got none")
	}
}

func mustAbs(t *testing.T, p string) string {
	t.Helper()
	abs, err := filepath.Abs(p)
	if err != nil {
		t.Fatalf("cannot abs %q: %v", p, err)
	}
	return filepath.Clean(abs)
}

func TestLoadLocation(t *testing.T) {
	loc, err := LoadLocation("Local")
	if err != nil || loc != time.Local {
		t.Errorf("LoadLocation(Local) = %v, %v", loc, err)
	}

	if _, err := LoadLocation("Europe/Paris"); err != nil {
		t.Errorf("LoadLocation(Europe/Paris) unexpected error: %v", err)
	}

	if _, err := LoadLocation("Mars/Olympus"); err == nil {
		t.Error("LoadLocation(Mars/Olympus) expected error, got none")
	}
}

func TestEnsureDirAndFileHelpers(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "a", "b")

	if err := EnsureDir(target, 0o755); err != nil {
		t.Fatalf("EnsureDir failed: %v", err)
	}
	if !DirExists(target) {
		t.Errorf("DirExists(%q) = false, want true", target)
	}

	file := filepath.Join(target, "f.txt")
	if FileExists(file) {
		t.Error("FileExists on missing file = true, want false")
	}
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}
	if !FileExists(file) {
		t.Error("FileExists on present file = false, want true")
	}
	if DirExists(file) {
		t.Error("DirExists on a file = true, want false")
	}
}

func TestAppPaths(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	dir, err := AppDir()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(dir, home) || !strings.HasSuffix(dir, AppDirName) {
		t.Errorf("AppDir() = %q, want it to be inside home and end with %q", dir, AppDirName)
	}

	cfg, err := DefaultConfigPath()
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(cfg) != ConfigFileName {
		t.Errorf("DefaultConfigPath() base = %q, want %q", filepath.Base(cfg), ConfigFileName)
	}
}

func TestClockString(t *testing.T) {
	if got := ClockString(9, 5); got != "09:05" {
		t.Errorf("ClockString(9,5) = %q, want 09:05", got)
	}
}
