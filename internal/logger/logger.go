// Package logger builds the structured logger used by GitPulse.
//
// It wraps logrus and provides a leveled, structured logger that writes to a
// log file and standard output simultaneously.
package logger

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/sirupsen/logrus"
)

// Field names used across GitPulse log messages so output stays consistent.
const (
	FieldCommand     = "command"
	FieldRepo        = "repo"
	FieldBranch      = "branch"
	FieldRemote      = "remote"
	FieldCommit      = "commit"
	FieldCount       = "count"
	FieldDryRun      = "dry_run"
	FieldDuration    = "duration"
	FieldConfig      = "config"
	FieldCommitIndex = "commit_index"
	FieldPushed      = "pushed"
	FieldRemaining   = "remaining"
	FieldNextRun     = "next_run"
)

// Logger is a thin, safe wrapper around logrus that centralizes formatting
// and output. The zero value is not usable; use New.
type Logger struct {
	mu    sync.Mutex
	entry *logrus.Entry
	file  *os.File
}

// New creates a Logger writing to out at the given log level and format.
// level accepts trace, debug, info, warn, error, fatal, and panic
// (case-insensitive). format accepts "text" (default) or "json".
//
// When logPath is non-empty, log lines are also appended to that file. A file
// that cannot be opened is logged as a warning but is not fatal.
func New(level, format, logPath string, out io.Writer) (*Logger, error) {
	parsed, err := parseLevel(level)
	if err != nil {
		return nil, err
	}

	var outputs []io.Writer
	if out != nil {
		outputs = append(outputs, out)
	}

	var file *os.File
	if logPath != "" {
		if dir := filepath.Dir(logPath); dir != "." && dir != "" {
			if err := os.MkdirAll(dir, 0o700); err != nil {
				return nil, fmt.Errorf("cannot create log directory %q: %w", dir, err)
			}
		}
		f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			return nil, fmt.Errorf("cannot open log file %q: %w", logPath, err)
		}
		file = f
		outputs = append(outputs, f)
	}

	if len(outputs) == 0 {
		outputs = append(outputs, io.Discard)
	}

	logrus.SetLevel(parsed)
	if strings.EqualFold(format, "json") {
		logrus.SetFormatter(&logrus.JSONFormatter{})
	} else {
		logrus.SetFormatter(&logrus.TextFormatter{})
	}
	logrus.SetOutput(io.MultiWriter(outputs...))

	return &Logger{entry: logrus.NewEntry(logrus.StandardLogger()), file: file}, nil
}

// NewDiscard returns a Logger that writes nothing. Useful in tests.
func NewDiscard() *Logger {
	l, _ := New("panic", "text", "", io.Discard)
	return l
}

// Close closes the underlying log file, if any.
func (l *Logger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file != nil {
		err := l.file.Close()
		l.file = nil
		return err
	}
	return nil
}

// WithField returns a child Logger that includes the given key/value pair in
// every subsequent message.
func (l *Logger) WithField(key string, value any) *Logger {
	return &Logger{entry: l.entry.WithField(key, value), file: l.file}
}

// WithFields returns a child Logger that includes the given key/value pairs
// in every subsequent message.
func (l *Logger) WithFields(fields map[string]any) *Logger {
	return &Logger{entry: l.entry.WithFields(fields), file: l.file}
}

// Trace logs a message at trace level.
func (l *Logger) Trace(format string, args ...any) { l.entry.Tracef(format, args...) }

// Debug logs a message at debug level.
func (l *Logger) Debug(format string, args ...any) { l.entry.Debugf(format, args...) }

// Info logs a message at info level.
func (l *Logger) Info(format string, args ...any) { l.entry.Infof(format, args...) }

// Warn logs a message at warn level.
func (l *Logger) Warn(format string, args ...any) { l.entry.Warnf(format, args...) }

// Error logs a message at error level.
func (l *Logger) Error(format string, args ...any) { l.entry.Errorf(format, args...) }

// parseLevel converts a string into a logrus.Level, tolerating "warning".
func parseLevel(level string) (logrus.Level, error) {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "trace":
		return logrus.TraceLevel, nil
	case "debug":
		return logrus.DebugLevel, nil
	case "info", "":
		return logrus.InfoLevel, nil
	case "warn", "warning":
		return logrus.WarnLevel, nil
	case "error":
		return logrus.ErrorLevel, nil
	case "fatal":
		return logrus.FatalLevel, nil
	case "panic":
		return logrus.PanicLevel, nil
	default:
		return logrus.InfoLevel, fmt.Errorf("unsupported log level %q (use trace, debug, info, warn, error, fatal, or panic)", level)
	}
}
