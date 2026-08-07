// Package scheduler computes and executes GitPulse's daily commit schedule.
//
// Version 1.0 ships a daily scheduler: it spreads a configured number of
// commit events evenly across a daily time window (or at a fixed interval),
// all in a user-configurable timezone. The scheduler is exposed through the
// Scheduler interface so future versions can swap in platform schedulers or
// hosted workers without touching the rest of the codebase.
package scheduler

import (
	"context"
	"fmt"
	"time"

	"github.com/gitpulse/gitpulse/internal/config"
	"github.com/gitpulse/gitpulse/internal/logger"
	"github.com/gitpulse/gitpulse/internal/utils"
)

// Job is a unit of scheduled work. The scheduler calls it at each scheduled
// time and continues running even when a job returns an error.
type Job func(ctx context.Context) error

// Scheduler plans commit events and runs them on a schedule.
type Scheduler interface {
	// EventsForDay returns the commit times scheduled for the given day in
	// the configuration's timezone.
	EventsForDay(day time.Time, cfg config.Config) ([]time.Time, error)

	// NextRun returns the next commit event time strictly after now, or the
	// first event of tomorrow if today's window has already ended.
	NextRun(now time.Time, cfg config.Config) (time.Time, error)

	// RunLoop executes job at every scheduled event until ctx is cancelled.
	RunLoop(ctx context.Context, cfg config.Config, job Job) error
}

// Clock abstracts time so tests can control scheduling deterministically.
type Clock interface {
	Now() time.Time
	Sleep(ctx context.Context, d time.Duration) error
}

// RealClock implements Clock using the system time.
type RealClock struct{}

// Now returns the current time.
func (RealClock) Now() time.Time { return time.Now() }

// Sleep blocks until d elapses or ctx is cancelled.
func (RealClock) Sleep(ctx context.Context, d time.Duration) error {
	select {
	case <-time.After(d):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// DailyScheduler implements Scheduler for a repeating daily window.
type DailyScheduler struct {
	clock Clock
	log   *logger.Logger
}

// NewDailyScheduler creates a DailyScheduler using the system clock.
func NewDailyScheduler(log *logger.Logger) *DailyScheduler {
	if log == nil {
		log = logger.NewDiscard()
	}
	return &DailyScheduler{clock: RealClock{}, log: log}
}

// NewDailySchedulerWithClock creates a DailyScheduler using an injected clock
// (primarily for tests).
func NewDailySchedulerWithClock(clock Clock, log *logger.Logger) *DailyScheduler {
	return &DailyScheduler{clock: clock, log: log}
}

// EventsForDay returns the commit times scheduled for day in the configured
// timezone.
//
// When commit_interval_minutes is greater than zero it defines the spacing
// between events, otherwise the events are spread evenly across the window.
// In both cases the number of events never exceeds commits_per_day.
//
// Only schedule-relevant fields are validated here; repository validation is
// the responsibility of the validation package before a run starts.
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

// NextRun returns the next event after now. If today's window has no
// remaining events, the first event of tomorrow is returned.
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

	// Today's window is done; the next run is the first event of tomorrow.
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

// RunLoop executes job at each scheduled event until ctx is cancelled. A job
// error is logged and the loop continues with the next event; it never stops
// the daemon.
func (s *DailyScheduler) RunLoop(ctx context.Context, cfg config.Config, job Job) error {
	s.log.Info("schedule loop started; press Ctrl+C to stop")

	for {
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
			return nil // ctx cancelled
		}

		if err := job(ctx); err != nil {
			s.log.Error("scheduled job failed: %v", err)
		}

		// Prevent a tight loop if the clock jumps backwards.
		if next.Before(s.clock.Now()) || next.Equal(s.clock.Now()) {
			if err := s.clock.Sleep(ctx, time.Second); err != nil {
				return nil
			}
		}
	}
}
