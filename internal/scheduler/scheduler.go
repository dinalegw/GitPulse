// Package scheduler computes and executes GitPulse's daily commit schedule.
package scheduler

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/gitpulse/gitpulse/internal/config"
	"github.com/gitpulse/gitpulse/internal/logger"
	"github.com/gitpulse/gitpulse/internal/utils"
)

// Job is a unit of scheduled work. The scheduler calls it at each scheduled
// time and continues running when a recoverable job error is returned.
type Job func(ctx context.Context) error

// Scheduler plans commit events and runs them on a schedule.
type Scheduler interface {
	EventsForDay(day time.Time, cfg config.Config) ([]time.Time, error)
	NextRun(now time.Time, cfg config.Config) (time.Time, error)
	RunLoop(ctx context.Context, cfg config.Config, job Job) error
}

// Clock abstracts time so tests can control scheduling deterministically.
type Clock interface {
	Now() time.Time
	Sleep(ctx context.Context, d time.Duration) error
}

// RealClock implements Clock using the system time.
type RealClock struct{}

func (RealClock) Now() time.Time { return time.Now() }

func (RealClock) Sleep(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			return nil
		}
	}
	select {
	case <-time.After(d):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// DailyScheduler implements a repeating daily window. Its lifecycle state is
// protected so the same scheduler instance cannot run two loops concurrently.
type DailyScheduler struct {
	clock Clock
	log   *logger.Logger

	mu      sync.Mutex
	running bool
}

func NewDailyScheduler(log *logger.Logger) *DailyScheduler {
	if log == nil {
		log = logger.NewDiscard()
	}
	return &DailyScheduler{clock: RealClock{}, log: log}
}

func NewDailySchedulerWithClock(clock Clock, log *logger.Logger) *DailyScheduler {
	if clock == nil {
		clock = RealClock{}
	}
	if log == nil {
		log = logger.NewDiscard()
	}
	return &DailyScheduler{clock: clock, log: log}
}

func (s *DailyScheduler) EventsForDay(day time.Time, cfg config.Config) ([]time.Time, error) {
	loc, err := utils.LoadLocation(cfg.Timezone)
	if err != nil {
		return nil, err
	}

	dayStart := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, loc)
	startH, startM, err := utils.ParseClock(cfg.StartTime)
	if err != nil {
		return nil, err
	}
	endH, endM, err := utils.ParseClock(cfg.EndTime)
	if err != nil {
		return nil, err
	}

	start := dayStart.Add(time.Duration(startH)*time.Hour + time.Duration(startM)*time.Minute)
	end := dayStart.Add(time.Duration(endH)*time.Hour + time.Duration(endM)*time.Minute)
	window := end.Sub(start)

	count := cfg.CommitsPerDay
	if count < 1 {
		count = 1
	}

	var events []time.Time
	switch {
	case cfg.CommitIntervalMinutes > 0:
		step := time.Duration(cfg.CommitIntervalMinutes) * time.Minute
		for t := start; t.Before(end); t = t.Add(step) {
			events = append(events, t)
			if len(events) >= count {
				break
			}
		}
	default:
		for i := 0; i < count; i++ {
			if count == 1 {
				events = append(events, start)
				break
			}
			offset := time.Duration(i) * window / time.Duration(count-1)
			events = append(events, start.Add(offset))
		}
	}

	return events, nil
}

func (s *DailyScheduler) NextRun(now time.Time, cfg config.Config) (time.Time, error) {
	events, err := s.EventsForDay(now, cfg)
	if err != nil {
		return time.Time{}, err
	}

	for _, e := range events {
		if e.After(now) {
			return e, nil
		}
	}

	tomorrow := now.AddDate(0, 0, 1)
	events, err = s.EventsForDay(tomorrow, cfg)
	if err != nil {
		return time.Time{}, err
	}
	if len(events) == 0 {
		return time.Time{}, fmt.Errorf("cannot compute next run: schedule window is empty")
	}
	return events[0], nil
}

// RunLoop owns its running flag under mu. Job failures are recoverable and are
// logged without terminating the scheduler; context cancellation is a clean
// shutdown and any other scheduler error is returned to the caller.
func (s *DailyScheduler) RunLoop(ctx context.Context, cfg config.Config, job Job) error {
	if job == nil {
		return fmt.Errorf("scheduled job must not be nil")
	}

	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("scheduler is already running")
	}
	s.running = true
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		s.running = false
		s.mu.Unlock()
	}()

	s.log.Info("schedule loop started; press Ctrl+C to stop")

	for {
		if err := ctx.Err(); err != nil {
			return nil
		}

		now := s.clock.Now()
		next, err := s.NextRun(now, cfg)
		if err != nil {
			s.log.Error("cannot compute next run: %v", err)
			return err
		}

		wait := next.Sub(now)
		s.log.WithFields(map[string]any{
			logger.FieldNextRun:   next.Format(time.RFC3339),
			logger.FieldRemaining: wait.Round(time.Second).String(),
		}).Info("next scheduled run")

		if err := s.clock.Sleep(ctx, wait); err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return nil
			}
			return fmt.Errorf("scheduler sleep failed: %w", err)
		}

		if err := ctx.Err(); err != nil {
			return nil
		}
		if err := job(ctx); err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) || ctx.Err() != nil {
				return nil
			}
			s.log.Error("scheduled job failed: %v", err)
		}

		clockNow := s.clock.Now()
		if !next.After(clockNow) {
			if err := s.clock.Sleep(ctx, time.Second); err != nil {
				if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
					return nil
				}
				return fmt.Errorf("scheduler backoff failed: %w", err)
			}
		}
	}
}
