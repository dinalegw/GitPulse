package cmd

import "testing"

func TestIsGitPulseUpstreamIsOnlyARepositoryClassifier(t *testing.T) {
	// This classifier is deliberately not an authorization decision. The
	// interactive flow relies on Git's non-mutating push preflight because the
	// repository owner may legitimately use this exact remote URL.
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

func TestAcceptsGitIdentity(t *testing.T) {
	for _, answer := range []string{"", "y", "Y", "yes", " Yes "} {
		if !acceptsGitIdentity(answer) {
			t.Errorf("acceptsGitIdentity(%q) = false, want true", answer)
		}
	}
	for _, answer := range []string{"n", "no", "change it"} {
		if acceptsGitIdentity(answer) {
			t.Errorf("acceptsGitIdentity(%q) = true, want false", answer)
		}
	}
}

func TestPartialGitIdentityPreservesTheConfiguredHalf(t *testing.T) {
	tests := []struct {
		name, email         string
		wantName, wantEmail string
	}{
		{"", "owner@example.com", fallbackGitName, "owner@example.com"},
		{"Owner", "", "Owner", fallbackGitEmail},
		{"Owner", "owner@example.com", "Owner", "owner@example.com"},
		{"", "", fallbackGitName, fallbackGitEmail},
	}
	for _, test := range tests {
		name, email := partialGitIdentity(test.name, test.email)
		if name != test.wantName || email != test.wantEmail {
			t.Errorf("partialGitIdentity(%q, %q) = (%q, %q), want (%q, %q)", test.name, test.email, name, email, test.wantName, test.wantEmail)
		}
	}
}
