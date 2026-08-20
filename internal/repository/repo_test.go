package repository

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gitpulse/gitpulse/internal/git"
)

func TestResolveRepositoryPath(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("cannot get home dir: %v", err)
	}

	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
		isCmd   bool
	}{
		{"empty", "", "", false, false},
		{"whitespace", "   ", "", false, false},
		{"current dir", ".", mustAbs(t, "."), false, false},
		{"current dir with trailing slash", "./", mustAbs(t, "."), false, false},
		{"relative parent", "..", filepath.Dir(mustAbs(t, ".")), false, false},
		{"absolute path", "/tmp", "/tmp", false, false},
		{"absolute with trailing slash", "/tmp/", "/tmp", false, false},
		{"tilde", "~", home, false, false},
		{"tilde path", "~/repo", filepath.Join(home, "repo"), false, false},
		{"relative path", "repo", mustAbs(t, "repo"), false, false},
		{"redundant components", "./GitPulse/../GitPulse", mustAbs(t, "GitPulse"), false, false},
		{"shell command pwd", "pwd", "", true, true},
		{"shell command ls", "ls", "", true, true},
		{"shell command cd repo", "cd repo", "", true, true},
		{"shell command git status", "git status", "", true, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ResolveRepositoryPath(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("ResolveRepositoryPath(%q) expected error, got %q", tt.input, got)
				}
				if tt.isCmd {
					if _, ok := err.(*PathError); !ok {
						t.Fatalf("expected *PathError for command-like input, got %T", err)
					}
				}
				return
			}
			if err != nil {
				t.Fatalf("ResolveRepositoryPath(%q) unexpected error: %v", tt.input, err)
			}
			if got != tt.want {
				t.Errorf("ResolveRepositoryPath(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestResolveRepositoryPathSpaces(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("cannot get home dir: %v", err)
	}
	dir := filepath.Join(home, "My Projects", "GitPulse")
	got, err := ResolveRepositoryPath(dir)
	if err != nil {
		t.Fatalf("ResolveRepositoryPath(%q) unexpected error: %v", dir, err)
	}
	if got != dir {
		t.Errorf("ResolveRepositoryPath(%q) = %q, want %q", dir, got, dir)
	}
}

func TestValidateRepository(t *testing.T) {
	skipIfNoGit(t)

	t.Run("valid repository", func(t *testing.T) {
		dir := initTestRepo(t)
		ctx := context.Background()
		info, err := ValidateRepository(ctx, dir, git.NewRealRunner(nil))
		if err != nil {
			t.Fatalf("ValidateRepository unexpected error: %v", err)
		}
		if info.Path != dir {
			t.Errorf("Path = %q, want %q", info.Path, dir)
		}
		if info.IsBare {
			t.Error("IsBare = true for normal repo, want false")
		}
		if info.Branch != "main" {
			t.Errorf("Branch = %q, want main", info.Branch)
		}
		if info.Readme != "README.md" {
			t.Errorf("Readme = %q, want README.md", info.Readme)
		}
	})

	t.Run("bare repository", func(t *testing.T) {
		dir := t.TempDir()
		bare := filepath.Join(dir, "repo.git")
		cmd := exec.Command("git", "init", "-q", "--bare", bare)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git init bare failed: %v\n%s", err, out)
		}
		ctx := context.Background()
		_, err := ValidateRepository(ctx, bare, git.NewRealRunner(nil))
		if err == nil {
			t.Fatal("expected error for bare repository")
		}
		if !strings.Contains(err.Error(), "bare") {
			t.Errorf("error should mention bare repository, got: %v", err)
		}
	})

	t.Run("nonexistent path", func(t *testing.T) {
		ctx := context.Background()
		_, err := ValidateRepository(ctx, filepath.Join(t.TempDir(), "nope"), git.NewRealRunner(nil))
		if err == nil {
			t.Fatal("expected error for nonexistent path")
		}
		if _, ok := err.(*PathError); !ok {
			t.Fatalf("expected *PathError, got %T", err)
		}
	})

	t.Run("file instead of directory", func(t *testing.T) {
		file := filepath.Join(t.TempDir(), "file.txt")
		if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
			t.Fatalf("write file: %v", err)
		}
		ctx := context.Background()
		_, err := ValidateRepository(ctx, file, git.NewRealRunner(nil))
		if err == nil {
			t.Fatal("expected error for file path")
		}
		if _, ok := err.(*PathError); !ok {
			t.Fatalf("expected *PathError, got %T", err)
		}
	})

	t.Run("non git directory", func(t *testing.T) {
		ctx := context.Background()
		_, err := ValidateRepository(ctx, t.TempDir(), git.NewRealRunner(nil))
		if err == nil {
			t.Fatal("expected error for non-git directory")
		}
		if _, ok := err.(*PathError); !ok {
			t.Fatalf("expected *PathError, got %T", err)
		}
	})

	t.Run("dirty repository", func(t *testing.T) {
		dir := initTestRepo(t)
		if err := os.WriteFile(filepath.Join(dir, "file.txt"), []byte("modified"), 0o644); err != nil {
			t.Fatalf("write file: %v", err)
		}
		ctx := context.Background()
		info, err := ValidateRepository(ctx, dir, git.NewRealRunner(nil))
		if err != nil {
			t.Fatalf("ValidateRepository unexpected error: %v", err)
		}
		if info.IsClean {
			t.Error("IsClean = true for dirty repo, want false")
		}
	})

	t.Run("missing readme", func(t *testing.T) {
		dir := initTestRepo(t)
		readme := filepath.Join(dir, "README.md")
		os.Remove(readme)
		ctx := context.Background()
		info, err := ValidateRepository(ctx, dir, git.NewRealRunner(nil))
		if err != nil {
			t.Fatalf("ValidateRepository unexpected error: %v", err)
		}
		if info.Readme != "" {
			t.Errorf("Readme = %q for missing README, want empty", info.Readme)
		}
	})

	t.Run("detached head", func(t *testing.T) {
		dir := initTestRepo(t)
		runGit(t, dir, "checkout", "--detach", "HEAD")
		ctx := context.Background()
		_, err := ValidateRepository(ctx, dir, git.NewRealRunner(nil))
		if err == nil {
			t.Fatal("expected error for detached HEAD")
		}
	})
}

func TestIsCommandLike(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"pwd", true},
		{"ls", true},
		{"cd GitPulse", true},
		{"git status", true},
		{"./run.sh", false},
		{"/usr/bin/git", false},
		{"myrepo", false},
		{"", false},
		{"   ", false},
	}
	for _, tt := range tests {
		got := IsCommandLike(tt.input)
		if got != tt.want {
			t.Errorf("IsCommandLike(%q) = %v, want %v", tt.input, got, tt.want)
		}
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

func skipIfNoGit(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
}

func initTestRepo(t *testing.T) string {
	t.Helper()
	skipIfNoGit(t)

	dir := t.TempDir()
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, out)
		}
	}

	run("init", "-q", "-b", "main")
	run("config", "user.email", "test@example.com")
	run("config", "user.name", "GitPulse Test")
	writeTestFile(t, filepath.Join(dir, "README.md"), "# Test")
	writeTestFile(t, filepath.Join(dir, "file.txt"), "hello")
	run("add", ".")
	run("commit", "-q", "-m", "initial")

	return dir
}

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, out)
	}
}
