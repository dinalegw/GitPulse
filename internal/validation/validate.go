// Package validation checks that a GitPulse configuration is internally
// consistent and usable before any commit work is executed.
//
// Validation is intentionally separate from the git package so that
// configuration problems can be reported even when a repository cannot be
// reached.
package validation

import (
	"fmt"
	"slices"
	"strings"

	"github.com/dinalegw/GitPulse/internal/config"
	"github.com/dinalegw/GitPulse/internal/utils"
)

// Problem describes a single configuration error with an explanation of why
// it happened and how to fix it.
type Problem struct {
	Key     string
	Message string
	Fix     string
}

// Error implements the error interface and renders all problems on separate
// lines.
func (p Problem) Error() string {
	return p.Message
}

// Problems is a collection of configuration problems.
type Problems []Problem

// Error implements the error interface by joining every problem's message.
func (ps Problems) Error() string {
	var b strings.Builder
	for i, p := range ps {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString(p.Message)
		if p.Fix != "" {
			b.WriteString(" Fix: ")
			b.WriteString(p.Fix)
		}
	}
	return b.String()
}

// HasFatal reports whether any problem has a non-empty Fix recommendation,
// i.e. whether at least one problem requires user action. All problems are
// treated as fatal for execution purposes.
func (ps Problems) HasFatal() bool { return len(ps) > 0 }

// MaxCommitsPerDay is the upper bound enforced on commits_per_day.
const MaxCommitsPerDay = 100

// Validate performs structural and semantic checks on cfg and returns the
// list of problems found. An empty result means the configuration is valid.
func Validate(cfg config.Config) Problems {
	var problems Problems

	problems = append(problems, validateRepositoryPath(cfg)...)
	problems = append(problems, validateRemoteBranch(cfg)...)
	problems = append(problems, validateCommitsPerDay(cfg)...)
	problems = append(problems, validateInterval(cfg)...)
	problems = append(problems, validateScheduleWindow(cfg)...)
	problems = append(problems, validateTimezone(cfg)...)
	problems = append(problems, validateLogLevel(cfg)...)
	problems = append(problems, validateMetadata(cfg)...)
	problems = append(problems, validateMessageTemplate(cfg)...)
	problems = append(problems, validateMaxCommits(cfg)...)

	return problems
}

// IsValid reports whether cfg passes Validate without any problems.
func IsValid(cfg config.Config) bool {
	return len(Validate(cfg)) == 0
}

func validateRepositoryPath(cfg config.Config) Problems {
	path, err := utils.ExpandPath(cfg.RepositoryPath)
	if err != nil {
		return Problems{{Key: config.KeyRepositoryPath, Message: fmt.Sprintf("repository_path is required: %s.", err), Fix: "run 'gitpulse init' to configure a repository"}}
	}
	if !utils.DirExists(path) {
		return Problems{{Key: config.KeyRepositoryPath, Message: fmt.Sprintf("repository_path %q does not exist.", cfg.RepositoryPath), Fix: "set repository_path to an existing directory with 'gitpulse config set repository_path /path/to/repo'"}}
	}
	return nil
}

func validateRemoteBranch(cfg config.Config) Problems {
	if strings.TrimSpace(cfg.RemoteBranch) == "" {
		return Problems{{Key: config.KeyRemoteBranch, Message: "remote_branch must not be empty.", Fix: "set remote_branch with 'gitpulse config set remote_branch main'"}}
	}
	return nil
}

func validateCommitsPerDay(cfg config.Config) Problems {
	if cfg.CommitsPerDay < 1 {
		return Problems{{Key: config.KeyCommitsPerDay, Message: fmt.Sprintf("commits_per_day must be at least 1, got %d.", cfg.CommitsPerDay), Fix: "set commits_per_day to a value between 1 and 100"}}
	}
	if cfg.CommitsPerDay > MaxCommitsPerDay {
		return Problems{{Key: config.KeyCommitsPerDay, Message: fmt.Sprintf("commits_per_day must be at most %d, got %d.", MaxCommitsPerDay, cfg.CommitsPerDay), Fix: fmt.Sprintf("set commits_per_day to a value between 1 and %d", MaxCommitsPerDay)}}
	}
	return nil
}

func validateInterval(cfg config.Config) Problems {
	if cfg.CommitIntervalMinutes < 0 {
		return Problems{{Key: config.KeyCommitIntervalMinutes, Message: fmt.Sprintf("commit_interval_minutes must be zero or positive, got %d.", cfg.CommitIntervalMinutes), Fix: "set commit_interval_minutes to 0 for automatic spacing, or a value in minutes"}}
	}
	if cfg.CommitIntervalMinutes > 1440 {
		return Problems{{Key: config.KeyCommitIntervalMinutes, Message: fmt.Sprintf("commit_interval_minutes must be at most 1440 (one day), got %d.", cfg.CommitIntervalMinutes), Fix: "reduce commit_interval_minutes"}}
	}
	if cfg.MinimumCommitIntervalMin > 0 && cfg.CommitIntervalMinutes > 0 && cfg.CommitIntervalMinutes < cfg.MinimumCommitIntervalMin {
		return Problems{{Key: config.KeyCommitIntervalMinutes, Message: fmt.Sprintf("commit_interval_minutes (%d) is below the configured minimum (%d).", cfg.CommitIntervalMinutes, cfg.MinimumCommitIntervalMin), Fix: fmt.Sprintf("increase commit_interval_minutes to at least %d, or lower minimum_commit_interval_minutes", cfg.MinimumCommitIntervalMin)}}
	}
	return nil
}

func validateScheduleWindow(cfg config.Config) Problems {
	startH, startM, err := utils.ParseClock(cfg.StartTime)
	if err != nil {
		return Problems{{Key: config.KeyStartTime, Message: fmt.Sprintf("start_time is invalid: %s.", err), Fix: "use the HH:MM format, for example 09:00"}}
	}
	endH, endM, err := utils.ParseClock(cfg.EndTime)
	if err != nil {
		return Problems{{Key: config.KeyEndTime, Message: fmt.Sprintf("end_time is invalid: %s.", err), Fix: "use the HH:MM format, for example 18:00"}}
	}
	startMin := startH*60 + startM
	endMin := endH*60 + endM
	if endMin <= startMin {
		return Problems{{Key: config.KeyEndTime, Message: fmt.Sprintf("end_time (%s) must be later than start_time (%s).", cfg.EndTime, cfg.StartTime), Fix: "make end_time later than start_time"}}
	}

	if cfg.CommitIntervalMinutes > 0 {
		if cfg.CommitIntervalMinutes > (endMin - startMin) {
			return Problems{{Key: config.KeyCommitIntervalMinutes, Message: fmt.Sprintf("commit_interval_minutes (%d) is larger than the schedule window (%d minutes).", cfg.CommitIntervalMinutes, endMin-startMin), Fix: "reduce commit_interval_minutes or widen the start_time/end_time window"}}
		}
	}
	return nil
}

func validateTimezone(cfg config.Config) Problems {
	if strings.TrimSpace(cfg.Timezone) == "" {
		return Problems{{Key: config.KeyTimezone, Message: "timezone must not be empty.", Fix: "set timezone to an IANA name such as Europe/Paris, or 'Local'"}}
	}
	if _, err := utils.LoadLocation(cfg.Timezone); err != nil {
		return Problems{{Key: config.KeyTimezone, Message: err.Error(), Fix: "set timezone to a valid IANA name such as America/New_York, or 'Local'"}}
	}
	return nil
}

func validateLogLevel(cfg config.Config) Problems {
	level := strings.ToLower(strings.TrimSpace(cfg.LogLevel))
	if !slices.Contains(config.AllowedLogLevels, level) {
		return Problems{{Key: config.KeyLogLevel, Message: fmt.Sprintf("log_level %q is not supported.", cfg.LogLevel), Fix: fmt.Sprintf("use one of: %s", strings.Join(config.AllowedLogLevels, ", "))}}
	}
	return nil
}

func validateMetadata(cfg config.Config) Problems {
	if strings.TrimSpace(cfg.MetadataDir) == "" {
		return Problems{{Key: config.KeyMetadataDir, Message: "metadata_dir must not be empty.", Fix: "set metadata_dir to a relative directory such as .gitpulse"}}
	}
	if strings.TrimSpace(cfg.MetadataFile) == "" {
		return Problems{{Key: config.KeyMetadataFile, Message: "metadata_file must not be empty.", Fix: "set metadata_file to a file name such as activity.log"}}
	}
	if cfg.MetadataDir == ".." || strings.HasPrefix(cfg.MetadataDir, "../") || strings.HasPrefix(cfg.MetadataDir, `..\`) {
		return Problems{{Key: config.KeyMetadataDir, Message: "metadata_dir must stay inside the repository.", Fix: "use a relative path such as .gitpulse"}}
	}
	if strings.HasPrefix(cfg.MetadataDir, "/") || strings.HasPrefix(cfg.MetadataDir, "\\") {
		return Problems{{Key: config.KeyMetadataDir, Message: "metadata_dir must be a relative path inside the repository.", Fix: "use a relative path such as .gitpulse"}}
	}
	return nil
}

func validateMessageTemplate(cfg config.Config) Problems {
	if !strings.Contains(cfg.CommitMessageTemplate, "%d") {
		return Problems{{Key: config.KeyCommitMessageTemplate, Message: "commit_message_template must contain a %d placeholder for the commit number.", Fix: "use the default 'chore: GitPulse automated pulse #%d'"}}
	}
	return nil
}

func validateMaxCommits(cfg config.Config) Problems {
	if cfg.MaxCommitsPerCycle < 1 {
		return Problems{{Key: config.KeyMaxCommitsPerCycle, Message: fmt.Sprintf("max_commits_per_cycle must be at least 1, got %d.", cfg.MaxCommitsPerCycle), Fix: "set max_commits_per_cycle to a value of at least 1"}}
	}
	return nil
}
