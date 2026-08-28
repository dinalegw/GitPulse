// Single source of truth for all GitPulse CLI command metadata
// Derived from AUDIT.md — update here, not in individual pages

export interface CommandFlag {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  default?: string | number | boolean;
}

export interface CommandMeta {
  name: string;
  description: string;
  longDescription?: string;
  flags: CommandFlag[];
  playground: {
    allowed: boolean;
    defaultArgs?: string[];
    requiresInteractive?: boolean;  // for quick wizard
  };
  sampleOutput: string;
  category: 'core' | 'config' | 'run' | 'inspect' | 'health';
}

export const COMMANDS: CommandMeta[] = [
  {
    name: 'init',
    description: 'Initialize GitPulse configuration in a repository',
    longDescription: 'Creates a new GitPulse configuration file at ~/.gitpulse/config.yaml with sensible defaults. Can auto-detect the current Git repository and prompt for settings.',
    flags: [
      { name: '--repo', description: 'Repository path (default: current directory)', type: 'string' },
      { name: '--branch', description: 'Remote branch name (default: main)', type: 'string' },
      { name: '--commits', description: 'Commits per day (default: 4)', type: 'number' },
      { name: '--enabled', description: 'Enable automation immediately (default: false)', type: 'boolean' },
      { name: '--dry-run', description: 'Simulate initialization without writing config', type: 'boolean' },
      { name: '--no-detect', description: 'Skip auto-detection of Git repository', type: 'boolean' },
    ],
    playground: { allowed: true, defaultArgs: ['--dry-run'] },
    sampleOutput: `$ gitpulse init --dry-run
✓ Configuration would be created at ~/.gitpulse/config.yaml
✓ Repository: /home/user/project
✓ Branch: main
✓ Commits/day: 4
✓ Schedule: 09:00-18:00 Local
✓ Dry-run: true`,
    category: 'core',
  },
  {
    name: 'config',
    description: 'Show or update the GitPulse configuration',
    longDescription: 'Inspect or modify the GitPulse configuration. Without a subcommand, prints the effective configuration (defaults merged with file values). Configuration is stored as human-readable YAML.',
    flags: [
      { name: 'show', description: 'Print the effective configuration (default)', type: 'string' },
      { name: 'path', description: 'Print the configuration file path', type: 'string' },
      { name: 'set <key> <value>', description: 'Set a single configuration value', type: 'string' },
    ],
    playground: { allowed: true, defaultArgs: ['show'] },
    sampleOutput: `$ gitpulse config show
# GitPulse configuration
# File: /home/user/.gitpulse/config.yaml
# Source: defaults only (no file yet)

enabled: false
repository_path: ""
remote_branch: "main"
commits_per_day: 4
commit_interval_minutes: 0
start_time: "09:00"
end_time: "18:00"
timezone: "Local"
dry_run: false
log_level: "info"
metadata_dir: ".gitpulse"
metadata_file: "activity.log"
push_remote: "origin"
commit_message_template: "chore: GitPulse automated pulse #%d"
max_commits_per_cycle: 100
minimum_commit_interval_minutes: 1`,
    category: 'config',
  },
  {
    name: 'run',
    description: 'Create and push GitPulse commits',
    longDescription: 'Creates GitPulse commits and pushes them to the configured remote. Without flags, runs one commit cycle immediately. With --schedule/--daemon, stays in foreground and executes on the configured daily schedule.',
    flags: [
      { name: '--schedule', description: 'Run continuously on the configured daily schedule (alias: --daemon)', type: 'boolean' },
      { name: '--daemon', description: 'Alias for --schedule', type: 'boolean' },
      { name: '--once', description: 'Run a single cycle and exit (default behavior)', type: 'boolean' },
      { name: '--dry-run', description: 'Simulate the cycle without creating commits', type: 'boolean' },
      { name: '--no-dry-run', description: 'Force real commits even if dry_run is enabled in config', type: 'boolean' },
      { name: '--count', description: 'Number of commits to create in a single cycle (default: commits_per_day)', type: 'number' },
    ],
    playground: { allowed: true, defaultArgs: ['--dry-run', '--count', '2'] },
    sampleOutput: `$ gitpulse run --dry-run --count 2
GitPulse run (dry-run: true)
  Repository: /home/user/project
  Commits:    2

Created  2 commit(s)
Skipped  0 (nothing to commit)
Pushed   skipped (dry-run)
Duration 145.23ms`,
    category: 'run',
  },
  {
    name: 'status',
    description: 'Show repository, configuration, and schedule status',
    longDescription: 'Displays the current state of the repository, effective configuration, and upcoming scheduled runs. Read-only command — never modifies anything.',
    flags: [],
    playground: { allowed: true, defaultArgs: [] },
    sampleOutput: `$ gitpulse status
GitPulse Status
================

Configuration
  Enabled:           false
  Repository:        /home/user/project
  Branch:            main
  Commits per day:   4
  Schedule window:   09:00 - 18:00 (Local)
  Interval:          Auto-spaced
  Dry-run:           false

Repository
  Path:              /home/user/project
  Current branch:    main
  Working tree:      Clean
  Remote origin:     ✓ configured
  Remote branch:     main (exists)

Schedule
  Next run:          Tomorrow 09:00:00 (in 14h 23m)
  Today's events:    09:00, 12:00, 15:00, 18:00`,
    category: 'inspect',
  },
  {
    name: 'logs',
    description: 'Show recent GitPulse log entries',
    longDescription: 'Displays recent log entries from the GitPulse log file. Useful for debugging and audit trails.',
    flags: [
      { name: '-n, --lines', description: 'Number of lines to show (default: 50)', type: 'number' },
      { name: '--tail', description: 'Follow log output (like tail -f)', type: 'boolean' },
    ],
    playground: { allowed: true, defaultArgs: ['-n', '20'] },
    sampleOutput: `$ gitpulse logs -n 20
2026-08-27 10:15:23 INFO  Starting GitPulse run (dry-run: true)
2026-08-27 10:15:23 INFO  Repository: /home/user/project
2026-08-27 10:15:23 INFO  Creating commit 1 of 2
2026-08-27 10:15:23 INFO  Metadata written to .gitpulse/activity.log
2026-08-27 10:15:23 INFO  Staged .gitpulse/
2026-08-27 10:15:23 INFO  Committed: "chore: GitPulse automated pulse #1"
2026-08-27 10:15:23 INFO  Creating commit 2 of 2
2026-08-27 10:15:23 INFO  Metadata written to .gitpulse/activity.log
2026-08-27 10:15:23 INFO  Staged .gitpulse/
2026-08-27 10:15:23 INFO  Committed: "chore: GitPulse automated pulse #2"
2026-08-27 10:15:23 INFO  Push skipped (dry-run mode)
2026-08-27 10:15:23 INFO  Run complete: 2 created, 0 skipped`,
    category: 'inspect',
  },
  {
    name: 'validate',
    description: 'Validate the GitPulse configuration',
    longDescription: 'Checks the configuration for structural and semantic correctness. Reports all problems with fix recommendations. Run before `gitpulse run` to catch issues early.',
    flags: [],
    playground: { allowed: true, defaultArgs: [] },
    sampleOutput: `$ gitpulse validate
✓ Configuration is valid
  Repository path:     /home/user/project
  Remote branch:       main
  Commits per day:     4 (1-100 ✓)
  Schedule window:     09:00-18:00 (valid ✓)
  Timezone:            Local (valid ✓)
  Message template:    Contains %d ✓
  Metadata paths:      Safe ✓`,
    category: 'health',
  },
  {
    name: 'doctor',
    description: 'Diagnose the GitPulse installation',
    longDescription: 'Runs a series of health checks against the environment, configuration, and configured repository. Exit code is 1 when any check fails.',
    flags: [],
    playground: { allowed: true, defaultArgs: [] },
    sampleOutput: `$ gitpulse doctor
GitPulse doctor — 1.0.0

  [OK]   git is installed
         git version 2.45.1

  [OK]   configuration file exists
         /home/user/.gitpulse/config.yaml

  [OK]   configuration is valid

  [OK]   repository is a git working tree
         /home/user/project

  [OK]   remote branch exists on remote
         origin/main

  [OK]   log file is writable
         /home/user/.gitpulse/gitpulse.log

All checks passed.`,
    category: 'health',
  },
  {
    name: 'version',
    description: 'Print the GitPulse version',
    longDescription: 'Outputs the version number and build information.',
    flags: [],
    playground: { allowed: true, defaultArgs: [] },
    sampleOutput: `$ gitpulse version
GitPulse version 1.0.0
Built with Go 1.26.3
Commit: abc1234
Date: 2026-08-27`,
    category: 'health',
  },
];

// Special entries for docs-only features (not in playground dropdown)
export const DOCS_ONLY: CommandMeta[] = [
  {
    name: 'quick-wizard',
    description: 'Interactive quick-setup wizard (run `gitpulse` with no arguments)',
    longDescription: 'Running `gitpulse` with zero arguments launches an interactive wizard that walks through repository path, commit count, interval, and message. This is the flagship demo for the playground.',
    flags: [],
    playground: { allowed: true, defaultArgs: [], requiresInteractive: true },
    sampleOutput: `Welcome to GitPulse Interactive Mode
=====================================
Developed by BLACKSAUCE
Version: 1.0.0

Current directory: /home/user/project

Detected Git repository in current directory:
/home/user/project

Use this repository? [Y/n] y

Pulling latest changes from origin/main...
Repository is up to date with origin/main.

Number of commits: 3
Minutes between commits: 5
Commit message: Update project status

Starting: 3 commit(s) to /home/user/project
Interval: 5 minutes between commits
Message:  Update project status

[10:15:23] Creating commit 1 of 3...
[10:15:23] Created commit #1 (pushed: true)
[10:15:23] Waiting 5 minutes...
[10:20:23] Creating commit 2 of 3...
[10:20:23] Created commit #2 (pushed: true)
[10:20:23] Waiting 5 minutes...
[10:25:23] Creating commit 3 of 3...
[10:25:23] Created commit #3 (pushed: true)

=====================================
Done!
Total commits created: 3
Total commits skipped: 0
Pushed:                true
Duration:              10m0.123s
Finished at:           2026-08-27 10:25:23 MST
=====================================`,
    category: 'core',
  },
  {
    name: 'run-schedule',
    description: 'Scheduled mode: `gitpulse run --schedule` (alias `--daemon`)',
    longDescription: 'Runs continuously in the foreground, firing one commit at each configured daily time until interrupted. Not meaningfully demoable in a short sandbox session — shown as docs-only with real sample output.',
    flags: [
      { name: '--schedule', description: 'Run continuously on the configured daily schedule', type: 'boolean' },
      { name: '--daemon', description: 'Alias for --schedule', type: 'boolean' },
      { name: '--dry-run', description: 'Simulate scheduled runs without creating commits', type: 'boolean' },
    ],
    playground: { allowed: false },
    sampleOutput: `$ gitpulse run --schedule --dry-run
schedule loop started; press Ctrl+C to stop
next scheduled run  next_run=2026-08-27T10:00:00Z remaining=5m30s
Scheduled commit created: seq=1 pushed=false
next scheduled run  next_run=2026-08-27T13:00:00Z remaining=2h59m
Scheduled commit created: seq=2 pushed=false
^C
Interrupted.`,
    category: 'run',
  },
];

// All commands for docs generation
export const ALL_COMMANDS = [...COMMANDS, ...DOCS_ONLY];

// Helper to find command by name
export function getCommand(name: string): CommandMeta | undefined {
  return ALL_COMMANDS.find((c) => c.name === name);
}

// Playground-allowed commands (for dropdown)
// Includes both real subcommands and special interactive/docs-only entries
// (e.g. the quick-setup wizard) that are flagged playground.allowed.
export const PLAYGROUND_COMMANDS = [
  ...COMMANDS.filter((c) => c.playground.allowed),
  ...DOCS_ONLY.filter((c) => c.playground.allowed),
];

// Config keys for validation (from internal/config/config.go)
export const CONFIG_KEYS = [
  'enabled',
  'repository_path',
  'remote_branch',
  'commits_per_day',
  'commit_interval_minutes',
  'start_time',
  'end_time',
  'timezone',
  'dry_run',
  'log_level',
  'metadata_dir',
  'metadata_file',
  'push_remote',
  'commit_message_template',
  'max_commits_per_cycle',
  'minimum_commit_interval_minutes',
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];