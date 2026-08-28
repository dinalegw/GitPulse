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

	"github.com/dinalegw/GitPulse/internal/config"
	"github.com/dinalegw/GitPulse/internal/git"
	"github.com/dinalegw/GitPulse/internal/logger"
	"github.com/dinalegw/GitPulse/internal/utils"
	"github.com/dinalegw/GitPulse/internal/validation"
)

type Metadata struct {
	dir  string
	file string
	rel  string
	log  *logger.Logger
}

func NewMetadata(repoDir, relDir, relFile string, log *logger.Logger) *Metadata {
	return &Metadata{
		dir:  filepath.Join(repoDir, relDir),
		file: filepath.Join(repoDir, relDir, relFile),
		rel:  filepath.ToSlash(filepath.Join(relDir, relFile)),
		log:  log,
	}
}

func (m *Metadata) RelPath() string { return m.rel }

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

type Cycle struct {
	cfg    config.Config
	client *git.Client
	meta   *Metadata
	log    *logger.Logger
	dryRun bool
}

func NewCycle(cfg config.Config, client *git.Client, log *logger.Logger, dryRun bool) (*Cycle, error) {
	if problems := validation.Validate(cfg); len(problems) > 0 {
		return nil, fmt.Errorf("configuration is not valid: %w", problems)
	}
	if log == nil {
		log = logger.NewDiscard()
	}
	if client == nil {
		return nil, fmt.Errorf("git client is required")
	}
	meta := NewMetadata(cfg.RepositoryPath, cfg.MetadataDir, cfg.MetadataFile, log)
	return &Cycle{cfg: cfg, client: client, meta: meta, log: log, dryRun: dryRun}, nil
}

type Result struct {
	Expected int
	Created  int
	Skipped  int
	Pushed   bool
	DryRun   bool
	Duration time.Duration
	FirstSeq int
}

func (c *Cycle) Run(ctx context.Context) (Result, error) {
	return c.RunN(ctx, c.cfg.CommitsPerDay)
}

func (c *Cycle) RunN(ctx context.Context, n int) (Result, error) {
	start := time.Now()

	if err := c.validateRepository(ctx); err != nil {
		return Result{}, err
	}

	if n > c.cfg.MaxCommitsPerCycle {
		n = c.cfg.MaxCommitsPerCycle
	}
	if n < 1 {
		n = 1
	}

	res := Result{Expected: n, DryRun: c.dryRun}

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
		if err := ctx.Err(); err != nil {
			res.Duration = time.Since(start)
			return res, err
		}

		if !c.dryRun {
			if err := validation.ValidateRepositoryForMutation(ctx, c.client, c.cfg); err != nil {
				res.Duration = time.Since(start)
				return res, err
			}
		}

		seq := startSeq + i + 1
		created, err := c.commitOnce(ctx, time.Now().In(loc), seq)
		if err != nil {
			res.Duration = time.Since(start)
			return res, err
		}
		if created {
			res.Created++
		} else {
			res.Skipped++
		}
	}

	if res.Created > 0 && !c.dryRun {
		pushed, err := c.push(ctx)
		if err != nil {
			res.Duration = time.Since(start)
			return res, err
		}
		res.Pushed = pushed
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

func (c *Cycle) validateRepository(ctx context.Context) error {
	if c.dryRun {
		inside, err := c.client.Detect(ctx)
		if err != nil {
			return fmt.Errorf("cannot inspect repository %q: %w", c.cfg.RepositoryPath, err)
		}
		if !inside {
			return fmt.Errorf("%q is not a git working tree; run 'git init' there first", c.cfg.RepositoryPath)
		}
		return nil
	}
	return validation.ValidateRepositoryForMutation(ctx, c.client, c.cfg)
}

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

func (c *Cycle) push(ctx context.Context) (bool, error) {
	if c.cfg.PushRemote == "" || c.cfg.RemoteBranch == "" {
		c.log.Warn("skipping push: push_remote and remote_branch are not configured")
		return false, nil
	}

	hasRemote, err := c.client.HasRemote(ctx, c.cfg.PushRemote)
	if err != nil {
		return false, err
	}
	if !hasRemote {
		return false, fmt.Errorf("cannot push: remote %q is not configured; run 'gitpulse init' in your target repository or configure push_remote", c.cfg.PushRemote)
	}

	name, email, err := c.client.UserIdentity(ctx)
	if err != nil {
		return false, err
	}
	if strings.TrimSpace(email) == "" {
		return false, fmt.Errorf("cannot push GitPulse commits: Git user.email is not configured; set it with 'git config --global user.email <your-github-email>' (use a GitHub noreply address if preferred). GitHub can only attribute commits when the author email is associated with the account")
	}
	if strings.TrimSpace(name) == "" {
		return false, fmt.Errorf("cannot create GitPulse commits: Git user.name is not configured; set it with 'git config --global user.name <your-name>'")
	}

	url, err := c.client.RemoteURL(ctx, c.cfg.PushRemote)
	if err != nil {
		return false, err
	}
	c.log.WithFields(map[string]any{
		logger.FieldRemote: c.cfg.PushRemote,
		logger.FieldBranch: c.cfg.RemoteBranch,
	}).Info("checking push access")

	if err := c.client.PushDryRun(ctx, c.cfg.PushRemote, c.cfg.RemoteBranch); err != nil {
		return false, fmt.Errorf("GitPulse cannot push to %s/%s (%s): %w. If this is the upstream GitPulse repository, fork it or configure push_remote to a repository you own", c.cfg.PushRemote, c.cfg.RemoteBranch, url, err)
	}

	if err := c.client.PushHead(ctx, c.cfg.PushRemote, c.cfg.RemoteBranch); err != nil {
		return false, fmt.Errorf("GitPulse created the commit as %s <%s>, but the push failed for %s/%s: %w", name, email, c.cfg.PushRemote, c.cfg.RemoteBranch, err)
	}
	c.log.WithField(logger.FieldPushed, true).Info("push completed")
	return true, nil
}
