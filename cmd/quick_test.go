package cmd

import "testing"

func TestIsGitPulseUpstream(t *testing.T) {
	for _, remote := range []string{
		"https://github.com/dinalegw/GitPulse.git",
		"https://github.com/dinalegw/GitPulse/",
		"git@github.com:dinalegw/GitPulse.git",
		"ssh://git@github.com/dinalegw/GitPulse.git",
	} {
		if !isGitPulseUpstream(remote) {
			t.Errorf("isGitPulseUpstream(%q) = false, want true", remote)
		}
	}

	for _, remote := range []string{
		"https://github.com/example/GitPulse.git",
		"https://github.com/dinalegw/another-repository.git",
		"https://gitlab.com/dinalegw/GitPulse.git",
	} {
		if isGitPulseUpstream(remote) {
			t.Errorf("isGitPulseUpstream(%q) = true, want false", remote)
		}
	}
}
