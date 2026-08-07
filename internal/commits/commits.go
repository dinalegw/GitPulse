// Package commits implements GitPulse's commit strategy.
//
// GitPulse never modifies application source files. Automated changes are
// isolated inside a dedicated metadata directory (default .gitpulse/) owned
// by GitPulse. Each commit appends a single line to a metadata file, stages
// only that directory, and creates a conventional commit.
package commits

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gitpulse/gitpulse/internal/config"
	"github.com/gitpulse/gitpulse/internal/git"
	"github.com/gitpulse/gitpulse/internal/logger"
	"github.com/gitpulse/gitpulse/internal/utils"
	"github.com/gitpulse/gitpulse/internal/validation"
)

// Metadata owns the GitPulse metadata file that backs every automated commit.
type Metadata struct {
	dir  string
	file string
	rel  string
	log  *logger.Logger
}

// NewMetadata creates a Metadata operating on relDir/relFile inside repoDir.
func NewMetadata(repoDir, relDir, relFile string, log *logger.Logger) *Metadata {
	return &Metadata{
		dir:  filepath.Join(repoDir, relDir),
		file: filepath.Join(repoDir, relDir, relFile),
		rel:  filepath.ToSlash(filepath.Join(relDir, relFile)),
		log:  log,
	}
}

// RelPath returns the slash separated path of the metadata file relative to
// the repository root.
func (m *Metadata) RelPath() string { return m.rel }

// Count returns the number of pulse lines already recorded in the metadata
// file. A missing file is treated as zero; nothing is created on disk.
func (m *Metadata) Count() (int, error) {
	data, err := os.ReadFile(m.file)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, fmt.Errorf("cannot read metadata file %q: %w", m.file, err)
	}
	count := 0
	for _, line := range strings.Split(string(data), "\n") {
		if strings.TrimSpace(line) != "" {
			count++
		}
	}
	return count, nil
}

// Append writes one pulse line to the metadata file atomically.
func (m *Metadata) Append(when time.Time, seq int) error {
	line := fmt.Sprintf("%s pulse #%d\n", when.Format(time.RFC3339), seq)
	if err := os.MkdirAll(m.dir, 0o755); err != nil {
		return fmt.Errorf("cannot create metadata directory %q: %w", m.dir, err)
	}
	f, err := os.OpenFile(m.file, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("cannot open metadata file %q: %w", m.file, err)
	}
	defer f.Close()
	if _, err := f.WriteString(line); err != nil {
		return fmt.Errorf("cannot append to metadata file %q: %w", m.file, err)
	}
	return nil
}

// Cycle executes one commit cycle: creating a configured number of commits,
// staging only the metadata directory, and pushing once at the end.
type Cycle struct {
	cfg    config.Config
	client *git.Client
	meta   *Metadata
	log    *logger.Logger
	dryRun bool
}

// NewCycle builds a Cycle from the given configuration and git client. The
// configuration is validated before the cycle is returned.
func NewCycle(cfg config.Config, client *git.Client, log *logger.Logger, dryRun bool) (*Cycle, error) {
	if problems := validation.Validate(cfg); len(problems) > 0 {
		return nil, fmt.Errorf("configuration is not valid: %w", problems)
	}
	if log == nil {
		log = logger.NewDiscard()
	}
	meta := NewMetadata(cfg.RepositoryPath, cfg.MetadataDir, cfg.MetadataFile, log)
	return &Cycle{cfg: cfg, client: client, meta: meta, log: log, dryRun: dryRun}, nil
}

// Result summarizes one commit cycle.
type Result struct {
	Expected int
	Created  int
	Skipped  int
	Pushed   bool
	DryRun   bool
	Duration time.Duration
	FirstSeq int
}

// Run executes a full cycle creating cfg.CommitsPerDay commits.
func (c *Cycle) Run(ctx context.Context) (Result, error) {
	return c.RunN(ctx, c.cfg.CommitsPerDay)
}

// RunN executes a cycle creating up to n commits, capped by the configured
// max_commits_per_cycle. RunN is used both for the one-shot run command and
// for individual scheduled commit events.
func (c *Cycle) RunN(ctx context.Context, n int) (Result, error) {
	start := time.Now()

	repo, err := c.client.Detect(ctx)
	if err != nil {
		return Result{}, fmt.Errorf("cannot inspect repository %q: %w", c.cfg.RepositoryPath, err)
	}
	if !repo {
		return Result{}, fmt.Errorf("%q is not a git working tree; run 'git init' there first", c.cfg.RepositoryPath)
	}

	if n > c.cfg.MaxCommitsPerCycle {
		n = c.cfg.MaxCommitsPerCycle
	}
	if n < 1 {
		n = 1
	}

	res := Result{
		Expected: n,
		DryRun:   c.dryRun,
	}

	startSeq, err := c.meta.Count()
	if err != nil {
		return Result{}, err
	}
	res.FirstSeq = startSeq + 1

	loc, err := utils.LoadLocation(c.cfg.Timezone)
	if err != nil {
		return Result{}, err
	}

	for i := 0; i < n; i++ {
		seq := startSeq + i + 1
		created, err := c.commitOnce(ctx, time.Now().In(loc), seq)
		if err != nil {
			return res, err
		}
		if created {
			res.Created++
		} else {
			res.Skipped++
		}
	}

	if res.Created > 0 && !c.dryRun {
		if err := c.push(ctx); err != nil {
			res.Duration = time.Since(start)
			return res, err
		}
		res.Pushed = true
	}

	res.Duration = time.Since(start)
	c.log.WithFields(map[string]any{
		logger.FieldCount:    res.Created,
		logger.FieldDryRun:   res.DryRun,
		logger.FieldDuration: res.Duration.Round(time.Millisecond).String(),
		logger.FieldPushed:   res.Pushed,
	}).Info("commit cycle finished")
	return res, nil
}

// commitOnce performs a single metadata commit. It returns true when a commit
// was actually created.
func (c *Cycle) commitOnce(ctx context.Context, when time.Time, seq int) (bool, error) {
	message := fmt.Sprintf(c.cfg.CommitMessageTemplate, seq)

	if c.dryRun {
		c.log.Info("dry-run: would append %q to %s", when.Format(time.RFC3339), c.meta.RelPath())
		c.log.Info("dry-run: would stage %s", c.meta.RelPath())
		c.log.Info("dry-run: would commit %q", message)
		return true, nil
	}

	if err := c.meta.Append(when, seq); err != nil {
		return false, err
	}

	if err := c.client.Add(ctx, c.cfg.MetadataDir); err != nil {
		return false, err
	}

	created, err := c.client.Commit(ctx, message)
	if err != nil {
		return false, err
	}

	c.log.WithField(logger.FieldCommitIndex, seq).Info("created commit")
	return created, nil
}

// push pushes the current branch to the configured remote once per cycle.
// A missing push_remote/remote_branch or an unconfigured remote is a soft
// skip (warned, not fatal): local-only repositories remain fully usable.
// Real push failures (network, auth, rejected refs) return an error.
func (c *Cycle) push(ctx context.Context) error {
	if c.cfg.PushRemote == "" || c.cfg.RemoteBranch == "" {
		c.log.Warn("skipping push: push_remote and remote_branch are not configured")
		return nil
	}

	hasRemote, err := c.client.HasRemote(ctx, c.cfg.PushRemote)
	if err != nil {
		return err
	}
	if !hasRemote {
		c.log.Warn("skipping push: remote %q is not configured in the repository; add it with 'git remote add %s <url>'", c.cfg.PushRemote, c.cfg.PushRemote)
		return nil
	}

	if c.log != nil {
		c.log.WithFields(map[string]any{
			logger.FieldRemote: c.cfg.PushRemote,
			logger.FieldBranch: c.cfg.RemoteBranch,
		}).Info("pushing commits")
	}
	if err := c.client.Push(ctx, c.cfg.PushRemote, c.cfg.RemoteBranch); err != nil {
		return err
	}
	if c.log != nil {
		c.log.WithField(logger.FieldPushed, true).Info("push completed")
	}
	return nil
}
