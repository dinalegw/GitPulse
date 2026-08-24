// Package config handles loading, saving, and validating GitPulse
// configuration.
//
// Configuration is stored as a human readable YAML file whose default
// location is ~/.gitpulse/config.yaml. A custom location can be supplied
// through the --config flag on every command.
package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/dinalegw/GitPulse/internal/utils"
	"github.com/spf13/viper"
	"gopkg.in/yaml.v3"
)

// Field names used for the config set command and by validation errors.
const (
	KeyEnabled                  = "enabled"
	KeyRepositoryPath           = "repository_path"
	KeyRemoteBranch             = "remote_branch"
	KeyCommitsPerDay            = "commits_per_day"
	KeyCommitIntervalMinutes    = "commit_interval_minutes"
	KeyStartTime                = "start_time"
	KeyEndTime                  = "end_time"
	KeyTimezone                 = "timezone"
	KeyDryRun                   = "dry_run"
	KeyLogLevel                 = "log_level"
	KeyMetadataDir              = "metadata_dir"
	KeyMetadataFile             = "metadata_file"
	KeyPushRemote               = "push_remote"
	KeyCommitMessageTemplate    = "commit_message_template"
	KeyMaxCommitsPerCycle       = "max_commits_per_cycle"
	KeyMinimumCommitIntervalMin = "minimum_commit_interval_minutes"
)

// Allowed log levels accepted by the configuration.
var AllowedLogLevels = []string{"trace", "debug", "info", "warn", "warning", "error", "fatal", "panic"}

// Defaults holds the default values applied to every configuration option.
var Defaults = map[string]any{
	KeyEnabled:                  false,
	KeyRepositoryPath:           "",
	KeyRemoteBranch:             "main",
	KeyCommitsPerDay:            4,
	KeyCommitIntervalMinutes:    0,
	KeyStartTime:                "09:00",
	KeyEndTime:                  "18:00",
	KeyTimezone:                 "Local",
	KeyDryRun:                   false,
	KeyLogLevel:                 "info",
	KeyMetadataDir:              ".gitpulse",
	KeyMetadataFile:             "activity.log",
	KeyPushRemote:               "origin",
	KeyCommitMessageTemplate:    "chore: GitPulse automated pulse #%d",
	KeyMaxCommitsPerCycle:       100,
	KeyMinimumCommitIntervalMin: 1,
}

// Config is the effective GitPulse configuration after defaults have been
// applied and the user's configuration file has been merged.
type Config struct {
	Enabled                  bool   `mapstructure:"enabled" yaml:"enabled"`
	RepositoryPath           string `mapstructure:"repository_path" yaml:"repository_path"`
	RemoteBranch             string `mapstructure:"remote_branch" yaml:"remote_branch"`
	CommitsPerDay            int    `mapstructure:"commits_per_day" yaml:"commits_per_day"`
	CommitIntervalMinutes    int    `mapstructure:"commit_interval_minutes" yaml:"commit_interval_minutes"`
	StartTime                string `mapstructure:"start_time" yaml:"start_time"`
	EndTime                  string `mapstructure:"end_time" yaml:"end_time"`
	Timezone                 string `mapstructure:"timezone" yaml:"timezone"`
	DryRun                   bool   `mapstructure:"dry_run" yaml:"dry_run"`
	LogLevel                 string `mapstructure:"log_level" yaml:"log_level"`
	MetadataDir              string `mapstructure:"metadata_dir" yaml:"metadata_dir"`
	MetadataFile             string `mapstructure:"metadata_file" yaml:"metadata_file"`
	PushRemote               string `mapstructure:"push_remote" yaml:"push_remote"`
	CommitMessageTemplate    string `mapstructure:"commit_message_template" yaml:"commit_message_template"`
	MaxCommitsPerCycle       int    `mapstructure:"max_commits_per_cycle" yaml:"max_commits_per_cycle"`
	MinimumCommitIntervalMin int    `mapstructure:"minimum_commit_interval_minutes" yaml:"minimum_commit_interval_minutes"`
}

// Manager loads and stores GitPulse configuration in a YAML file.
type Manager struct {
	path string
	v    *viper.Viper
}

// NewManager creates a Manager for the configuration file at path. The file
// does not need to exist yet.
func NewManager(path string) *Manager {
	v := viper.New()
	v.SetConfigType("yaml")
	v.SetConfigFile(path)
	return &Manager{path: path, v: v}
}

// Path returns the configuration file path the manager operates on.
func (m *Manager) Path() string {
	return m.path
}

// Load reads the configuration file, applying defaults for any missing keys,
// and returns the effective Config. A missing configuration file is not an
// error; it yields a Config with only defaults applied.
func (m *Manager) Load() (Config, error) {
	var cfg Config
	bindDefaults(m.v)

	if utils.FileExists(m.path) {
		if err := m.v.ReadInConfig(); err != nil {
			return cfg, fmt.Errorf("cannot read configuration file %q: %w (run 'gitpulse validate' for details)", m.path, err)
		}
	}

	if err := m.v.Unmarshal(&cfg); err != nil {
		return cfg, fmt.Errorf("cannot parse configuration file %q: %w", m.path, err)
	}
	return cfg, nil
}

// Save writes cfg to the manager's configuration file in human readable YAML
// format, creating parent directories as needed.
func (m *Manager) Save(cfg Config) error {
	dir := filepath.Dir(m.path)
	if err := utils.EnsureDir(dir, 0o700); err != nil {
		return err
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("cannot encode configuration: %w", err)
	}

	if err := os.WriteFile(m.path, data, 0o600); err != nil {
		return fmt.Errorf("cannot write configuration file %q: %w", m.path, err)
	}
	return nil
}

// Set updates a single configuration key, persists the change, and returns
// the resulting effective Config. Unknown keys are rejected before any write
// happens.
func (m *Manager) Set(key string, value any) (Config, error) {
	cfg, err := m.Load()
	if err != nil {
		return cfg, err
	}

	applied, ok := applyValue(cfg, key, value)
	if !ok {
		return cfg, fmt.Errorf("unknown configuration key %q", key)
	}

	if err := m.Save(applied); err != nil {
		return cfg, err
	}
	return applied, nil
}

// Exists reports whether the configuration file exists on disk.
func (m *Manager) Exists() bool {
	return utils.FileExists(m.path)
}

// applyValue sets key on cfg after converting value to the target type.
// It returns false when key is not a recognized configuration key.
func applyValue(cfg Config, key string, value any) (Config, bool) {
	switch key {
	case KeyEnabled:
		cfg.Enabled = toBool(value)
	case KeyRepositoryPath:
		cfg.RepositoryPath = toString(value)
	case KeyRemoteBranch:
		cfg.RemoteBranch = toString(value)
	case KeyCommitsPerDay:
		cfg.CommitsPerDay = toInt(value)
	case KeyCommitIntervalMinutes:
		cfg.CommitIntervalMinutes = toInt(value)
	case KeyStartTime:
		cfg.StartTime = toString(value)
	case KeyEndTime:
		cfg.EndTime = toString(value)
	case KeyTimezone:
		cfg.Timezone = toString(value)
	case KeyDryRun:
		cfg.DryRun = toBool(value)
	case KeyLogLevel:
		cfg.LogLevel = toString(value)
	case KeyMetadataDir:
		cfg.MetadataDir = toString(value)
	case KeyMetadataFile:
		cfg.MetadataFile = toString(value)
	case KeyPushRemote:
		cfg.PushRemote = toString(value)
	case KeyCommitMessageTemplate:
		cfg.CommitMessageTemplate = toString(value)
	case KeyMaxCommitsPerCycle:
		cfg.MaxCommitsPerCycle = toInt(value)
	case KeyMinimumCommitIntervalMin:
		cfg.MinimumCommitIntervalMin = toInt(value)
	default:
		return cfg, false
	}
	return cfg, true
}

// bindDefaults registers every default value with the viper instance.
func bindDefaults(v *viper.Viper) {
	for key, value := range Defaults {
		v.SetDefault(key, value)
	}
}

func toBool(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	default:
		return fmt.Sprintf("%v", v) == "true"
	}
}

func toString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	default:
		return fmt.Sprintf("%v", v)
	}
}

func toInt(value any) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case string:
		var n int
		fmt.Sscanf(v, "%d", &n)
		return n
	default:
		return 0
	}
}
