# GitHub Push Setup

GitPulse pushes through the Git remote configured in the repository. It does not receive or manage a user's GitHub password, personal access token, or SSH key.

## Use GitPulse with your own repository

Install GitPulse, then enter the repository you want GitPulse to automate:

```sh
gitpulse init
gitpulse validate
gitpulse doctor
gitpulse run --dry-run
gitpulse run
```

`gitpulse init` detects the current repository and uses its current branch, or its tracked upstream branch when available. It does not assume every repository uses `main`.

## If you cloned the GitPulse source repository

Cloning the public GitPulse repository gives you a read/write working copy, but it does not grant permission to push to the original repository. Fork GitPulse first and configure your fork as the writable push remote, or configure `push_remote` to a repository you own.

```sh
git remote -v
git remote set-url origin <your-repository-url>
gitpulse init
```

Do not put a GitHub token or password in the GitPulse configuration file.

## Push preflight

Before a real automated cycle creates commits for a configured push destination, GitPulse checks the remote, Git author identity, push URL, and whether Git accepts a dry-run push of `HEAD` to the configured remote branch. If preflight fails, GitPulse stops before creating the automated commits for that cycle.

Push access is determined by that Git preflight, not by guessing from a remote URL. Therefore, the GitPulse repository owner can use the official repository directly, while someone who cloned it without write access is still stopped safely before any local commit is created.

The actual push uses `HEAD:<remote-branch>`, so the local branch name does not have to match the remote branch name.

## Git author identity and GitHub contribution attribution

A successful Git push and a GitHub contribution are not the same thing. GitHub associates commits with accounts using the commit author email. Configure Git with an email associated with your GitHub account, or use your GitHub-provided noreply address:

```sh
git config --global user.name "Your Name"
git config --global user.email "your-email-or-github-noreply-address"
```

GitPulse reads the identity Git resolves for the selected repository: repository-local configuration first, then the normal Git global/system configuration. It displays the detected identity and asks for confirmation; it does not ask for a GitHub password, token, or SSH key.

If one value is missing, GitPulse first offers the selected repository's latest commit author as a recovery candidate. When there is no usable commit history, it can save a confirmed repository-only fallback so Git itself can continue. A fallback email such as `gitpulse@localhost` can create and push commits, but GitHub cannot attribute it to an account. Set a real GitHub-linked email when contribution attribution matters.

## Server-side restrictions

GitHub can reject a push because of permissions, authentication, branch protection, required reviews, signed-commit rules, organization policy, or repository rules. GitPulse does not bypass these controls. It reports the failure and leaves recovery to the user.
