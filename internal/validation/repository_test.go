package validation

import (
	"context"
	"fmt"
	"testing"

	"github.com/dinalegw/GitPulse/internal/config"
	"github.com/dinalegw/GitPulse/internal/git"
)

type repositoryFakeRunner struct {
	results map[string]string
	errors  map[string]error
}

func (f *repositoryFakeRunner) Run(_ context.Context, _ string, args ...string) (string, error) {
	key := "git " + joinArgs(args)
	if err, ok := f.errors[key]; ok {
		return "", err
	}
	if out, ok := f.results[key]; ok {
		return out, nil
	}
	return "", fmt.Errorf("unexpected call: %s", key)
}

func joinArgs(args []string) string {
	out := ""
	for i, arg := range args {
		if i > 0 {
			out += " "
		}
		out += arg
	}
	return out
}

func safeRepositoryRunner() *repositoryFakeRunner {
	run := &repositoryFakeRunner{
		results: make(map[string]string),
		errors:  make(map[string]error),
	}
	run.results["git rev-parse --is-inside-work-tree"] = "true"
	run.results["git rev-parse --is-bare-repository"] = "false"
	run.results["git rev-parse --abbrev-ref HEAD"] = "main"
	run.results["git status --porcelain --untracked-files=no"] = ""
	return run
}

func safetyConfig() config.Config {
	return config.Config{
		RepositoryPath: "/repo",
		RemoteBranch:   "main",
		MetadataDir:    ".gitpulse",
		MetadataFile:   "activity.log",
	}
}

func TestValidateRepositoryForMutationAllowsSafeWorkingTree(t *testing.T) {
	run := safeRepositoryRunner()
	client := git.New("/repo", run)
	if err := ValidateRepositoryForMutation(context.Background(), client, safetyConfig()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateRepositoryForMutationRejectsBareRepository(t *testing.T) {
	run := safeRepositoryRunner()
	run.results["git rev-parse --is-bare-repository"] = "true"
	client := git.New("/repo", run)
	if err := ValidateRepositoryForMutation(context.Background(), client, safetyConfig()); err == nil {
		t.Fatal("expected bare repository to be rejected")
	}
}

func TestValidateRepositoryForMutationRejectsDirtyRepository(t *testing.T) {
	run := safeRepositoryRunner()
	run.results["git status --porcelain --untracked-files=no"] = " M README.md"
	client := git.New("/repo", run)
	if err := ValidateRepositoryForMutation(context.Background(), client, safetyConfig()); err == nil {
		t.Fatal("expected dirty repository to be rejected")
	}
}

func TestValidateRepositoryForMutationRejectsDetachedHead(t *testing.T) {
	run := safeRepositoryRunner()
	run.results["git rev-parse --abbrev-ref HEAD"] = "HEAD"
	client := git.New("/repo", run)
	if err := ValidateRepositoryForMutation(context.Background(), client, safetyConfig()); err == nil {
		t.Fatal("expected detached HEAD to be rejected")
	}
}

func TestValidateRepositoryForMutationRejectsUnexpectedBranch(t *testing.T) {
	run := safeRepositoryRunner()
	run.results["git rev-parse --abbrev-ref HEAD"] = "feature/test"
	client := git.New("/repo", run)
	if err := ValidateRepositoryForMutation(context.Background(), client, safetyConfig()); err == nil {
		t.Fatal("expected unexpected branch to be rejected")
	}
}

func TestValidateRepositoryForMutationRejectsMetadataTraversal(t *testing.T) {
	run := safeRepositoryRunner()
	client := git.New("/repo", run)
	cfg := safetyConfig()
	cfg.MetadataDir = "foo/../../outside"
	if err := ValidateRepositoryForMutation(context.Background(), client, cfg); err == nil {
		t.Fatal("expected metadata traversal to be rejected")
	}
}
