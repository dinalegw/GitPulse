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

The actual push uses `HEAD:<remote-branch>`, so the local branch name does not have to match the remote branch name.

## GitHub contribution attribution

A successful Git push and a GitHub contribution are not the same thing. GitHub associates commits with accounts using the commit author email. Configure Git with an email associated with your GitHub account, or use your GitHub-provided noreply address:

```sh
git config --global user.name "Your Name"
git config --global user.email "your-email-or-github-noreply-address"
```

GitPulse checks that a name and email exist, but it cannot prove from native Git alone that the email is associated with a particular GitHub account.

## Server-side restrictions

GitHub can reject a push because of permissions, authentication, branch protection, required reviews, signed-commit rules, organization policy, or repository rules. GitPulse does not bypass these controls. It reports the failure and leaves recovery to the user.
