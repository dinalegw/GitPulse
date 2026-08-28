# GitHub Push Setup

GitPulse pushes through the Git remote configured in the repository. It does not receive or manage a user's GitHub password, personal access token, or SSH key.

## Use GitPulse with your own repository

Install the GitPulse CLI, then enter the repository you want GitPulse to automate:

```sh
gitpulse init
```

When the current directory is a Git repository, `init` detects it automatically. It uses the current branch, or its tracked upstream branch when one exists, instead of assuming that every repository uses `main`.

Then verify the setup:

```sh
gitpulse validate
gitpulse doctor
gitpulse run --dry-run
```

Finally run a real cycle:

```sh
gitpulse run
```

## If you cloned the GitPulse source repository

Cloning GitPulse gives you a read/write working copy only if your GitHub credentials have permission to push to that repository. A normal GitHub user does not have permission to push directly to `dinalegw/GitPulse`.

For development, fork the repository first and configure your fork as the push remote, or point `push_remote` at a repository you own:

```sh
git remote -v
git remote set-url origin <your-repository-url>
gitpulse init
```

Do not put a GitHub token or password in the GitPulse configuration file.

## What GitPulse verifies before pushing

Before a real automated cycle pushes, GitPulse checks:

1. the configured push remote exists;
2. Git has a configured author name and email;
3. the push URL is available;
4. `git push --dry-run` accepts the current `HEAD` for the target remote branch;
5. the actual push uses `HEAD:<remote-branch>`, so the local branch name does not have to match the remote branch name.

A failed preflight does not silently claim that the commit was pushed. GitPulse reports the remote/branch and gives guidance for common permission and configuration problems.

## GitHub contribution attribution

A successful Git push and a GitHub contribution are related but not identical. GitHub associates a commit with an account using the commit author's email. Configure Git with an email associated with your GitHub account, or use your GitHub-provided noreply address:

```sh
git config --global user.name "Your Name"
git config --global user.email "your-email-or-github-noreply-address"
```

GitPulse verifies that an email is configured, but it cannot prove from native Git alone that GitHub has associated that email with the intended account.

## Protected branches and other server-side rules

A repository may reject a push because of branch protection, required reviews, signed-commit rules, organization policy, or insufficient permissions. GitPulse does not bypass these rules. The preflight surfaces the server's Git error before the automated push whenever Git can detect the restriction during `--dry-run`.
