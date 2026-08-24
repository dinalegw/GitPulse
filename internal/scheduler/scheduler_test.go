package scheduler

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/dinalegw/GitPulse/internal/config"
	"github.com/dinalegw/GitPulse/internal/logger"
)

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func newFakeClock(at time.Time) *fakeClock {
	return &fakeClock{now: at}
}

func (f *fakeClock) Now() time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.now
}

func (f *fakeClock) Sleep(ctx context.Context, d time.Duration) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(5 * time.Millisecond):
		f.mu.Lock()
		f.now = f.now.Add(d)
		f.mu.Unlock()
		return nil
	}
}

func (f *fakeClock) advance(d time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.now = f.now.Add(d)
}

func testConfig() config.Config {
	return config.Config{
		Enabled:               true,
		RepositoryPath:        "/repo",
		RemoteBranch:          "main",
		CommitsPerDay:         4,
		CommitIntervalMinutes: 0,
		StartTime:             "09:00",
		EndTime:               "18:00",
		Timezone:              "Local",
		LogLevel:              "info",
		MetadataDir:           ".gitpulse",
		MetadataFile:          "activity.log",
		PushRemote:            "origin",
		CommitMessageTemplate: "chore: GitPulse automated pulse #%d",
		MaxCommitsPerCycle:    100,
	}
}

func at(hour, min, sec int) time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), hour, min, sec, 0, time.Local)
}

func TestEventsForDaySpreadsEvenly(t *testing.T) {
	clock := newFakeClock(at(12, 0, 0))
	s := NewDailySchedulerWithClock(clock, logger.NewDiscard())

	events, err := s.EventsForDay(clock.Now(), testConfig())
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 4 {
		t.Fatalf("events = %d, want 4", len(events))
	}
	want := []string{"09:00", "12:00", "15:00", "18:00"}
	for i, e := range events {
		if e.Format("15:04") != want[i] {
			t.Errorf("event %d = %s, want %s", i, e.Format("15:04"), want[i])
		}
	}
}

func TestEventsForDayUsesInterval(t *testing.T) {
	cfg := testConfig()
	cfg.CommitsPerDay = 10
	cfg.CommitIntervalMinutes = 120

	clock := newFakeClock(at(12, 0, 0))
	s := NewDailySchedulerWithClock(clock, logger.NewDiscard())

	events, err := s.EventsForDay(clock.Now(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"09:00", "11:00", "13:00", "15:00", "17:00"}
	if len(events) != len(want) {
		t.Fatalf("events = %v, want %v", events, want)
	}
	for i, e := range events {
		if e.Format("15:04") != want[i] {
			t.Errorf("event %d = %s, want %s", i, e.Format("15:04"), want[i])
		}
	}
}

func TestEventsForDaySingleCommit(t *testing.T) {
	cfg := testConfig()
	cfg.CommitsPerDay = 1

	clock := newFakeClock(at(12, 0, 0))
	s := NewDailySchedulerWithClock(clock, logger.NewDiscard())

	events, _ := s.EventsForDay(clock.Now(), cfg)
	if len(events) != 1 || events[0].Format("15:04") != "09:00" {
		t.Errorf("single event = %v, want [09:00]", events)
	}
}

func TestEventsForDayInvalidConfig(t *testing.T) {
	cfg := testConfig()
	cfg.Timezone = "Mars/Olympus"

	clock := newFakeClock(at(12, 0, 0))
	s := NewDailySchedulerWithClock(clock, logger.NewDiscard())
	if _, err := s.EventsForDay(clock.Now(), cfg); err == nil {
		t.Error("expected error for invalid timezone")
	}
}

func TestEventsForDayClampsCommits(t *testing.T) {
	cfg := testConfig()
	cfg.CommitsPerDay = 0

	clock := newFakeClock(at(12, 0, 0))
	s := NewDailySchedulerWithClock(clock, logger.NewDiscard())
	events, err := s.EventsForDay(clock.Now(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 1 {
		t.Errorf("events = %d, want 1 (clamped)", len(events))
	}
}

func TestNextRunInsideWindow(t *testing.T) {
	cfg := testConfig()
	clock := newFakeClock(at(12, 0, 0))
	s := NewDailySchedulerWithClock(clock, logger.NewDiscard())

	next, err := s.NextRun(clock.Now(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if next.Format("15:04") != "15:00" {
		t.Errorf("NextRun at 12:00 = %s, want 15:00", next)
	}
}

func TestNextRunBeforeWindowStartsAtStart(t *testing.T) {
	cfg := testConfig()
	clock := newFakeClock(at(7, 0, 0))
	s := NewDailySchedulerWithClock(clock, logger.NewDiscard())

	next, err := s.NextRun(clock.Now(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if next.Format("15:04") != "09:00" {
		t.Errorf("NextRun at 07:00 = %s, want 09:00", next)
	}
}

func TestNextRunAfterWindowRollsToTomorrow(t *testing.T) {
	cfg := testConfig()
	clock := newFakeClock(at(19, 0, 0))
	s := NewDailySchedulerWithClock(clock, logger.NewDiscard())

	next, err := s.NextRun(clock.Now(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if next.Day() != clock.Now().Day()+1 {
		t.Errorf("NextRun should be tomorrow, got %v", next)
	}
	if next.Format("15:04") != "09:00" {
		t.Errorf("NextRun = %s, want 09:00", next)
	}
}

func TestRunLoopExecutesAtScheduledTimes(t *testing.T) {
	cfg := testConfig()
	cfg.CommitsPerDay = 2

	clock := newFakeClock(at(8, 59, 50))
	s := NewDailySchedulerWithClock(clock, logger.NewDiscard())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var mu sync.Mutex
	ran := []string{}
	job := func(ctx context.Context) error {
		mu.Lock()
		ran = append(ran, clock.Now().Format("15:04:05"))
		mu.Unlock()
		return nil
	}

	done := make(chan error, 1)
	go func() {
		done <- s.RunLoop(ctx, cfg, job)
	}()

	for {
		mu.Lock()
		if len(ran) > 0 {
			mu.Unlock()
			break
		}
		mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	cancel()

	if err := <-done; err != nil {
		t.Fatalf("RunLoop returned error: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(ran) == 0 {
		t.Fatal("RunLoop never ran the job")
	}
	if ran[0] != "09:00:00" {
		t.Errorf("first job ran at %s, want 09:00:00", ran[0])
	}
}

func TestRunLoopJobErrorsDoNotStopLoop(t *testing.T) {
	cfg := testConfig()
	cfg.CommitsPerDay = 1

	clock := newFakeClock(at(8, 59, 55))
	s := NewDailySchedulerWithClock(clock, logger.NewDiscard())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	jobCalled := make(chan struct{}, 1)
	job := func(ctx context.Context) error {
		jobCalled <- struct{}{}
		return errJobFailed
	}

	done := make(chan error, 1)
	go func() { done <- s.RunLoop(ctx, cfg, job) }()

	select {
	case <-jobCalled:
	case <-time.After(time.Second):
		t.Fatal("job was never called")
	}
	cancel()

	if err := <-done; err != nil {
		t.Fatalf("RunLoop returned error: %v", err)
	}
}

var errJobFailed = &jobError{}

type jobError struct{}

func (e *jobError) Error() string { return "job failed" }
