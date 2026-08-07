package logger

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

func TestNewInvalidLevel(t *testing.T) {
	if _, err := New("banana", "text", "", &bytes.Buffer{}); err == nil {
		t.Error("New with invalid level should error")
	}
}

func TestNewValidLevels(t *testing.T) {
	for _, level := range []string{"trace", "debug", "info", "warn", "warning", "error", "fatal", "panic", ""} {
		if _, err := New(level, "text", "", &bytes.Buffer{}); err != nil {
			t.Errorf("New(%q) failed: %v", level, err)
		}
	}
}

func TestLevelFiltering(t *testing.T) {
	var buf bytes.Buffer
	l, err := New("warn", "text", "", &buf)
	if err != nil {
		t.Fatal(err)
	}
	l.Info("should not appear")
	l.Warn("appears")
	l.Error("also appears")

	out := buf.String()
	if strings.Contains(out, "should not appear") {
		t.Error("info message was logged at warn level")
	}
	if !strings.Contains(out, "appears") || !strings.Contains(out, "also appears") {
		t.Errorf("warn/error messages missing: %q", out)
	}
}

func TestJSONFormat(t *testing.T) {
	var buf bytes.Buffer
	l, err := New("info", "json", "", &buf)
	if err != nil {
		t.Fatal(err)
	}
	l.Info("hello")

	out := buf.String()
	if !strings.HasPrefix(strings.TrimSpace(out), "{") {
		t.Errorf("expected JSON output, got: %q", out)
	}
	if !strings.Contains(out, `"level":"info"`) || !strings.Contains(out, `"msg":"hello"`) {
		t.Errorf("JSON output missing fields: %q", out)
	}
}

func TestWithField(t *testing.T) {
	var buf bytes.Buffer
	l, err := New("debug", "json", "", &buf)
	if err != nil {
		t.Fatal(err)
	}
	l.WithField("key", "value").Debug("msg")

	out := buf.String()
	if !strings.Contains(out, `"key":"value"`) {
		t.Errorf("field not included: %q", out)
	}
}

func TestLogFileWritten(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/logs/gitpulse.log"
	l, err := New("info", "text", path, &bytes.Buffer{})
	if err != nil {
		t.Fatalf("New with log path failed: %v", err)
	}
	l.Info("to file")
	l.Close()

	data, err := readFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "to file") {
		t.Errorf("log file missing entry: %q", data)
	}
}

func readFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}
