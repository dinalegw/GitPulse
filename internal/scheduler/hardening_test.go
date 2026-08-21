package scheduler

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/gitpulse/gitpulse/internal/logger"
)

func TestRunLoopRejectsConcurrentSecondLoop(t *testing.T) {
	clock := newFakeClock(at(8, 59, 50))
	s := NewDailySchedulerWithClock(clock, logger.NewDiscard())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	started := make(chan struct{})
	firstDone := make(chan error, 1)
	go func() {
		firstDone <- s.RunLoop(ctx, testConfig(), func(context.Context) error {
			select {
			case <-started:
			default:
				close(started)
			}
			return nil
		})
	}()

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("first scheduler loop did not start")
	}

	secondErr := s.RunLoop(ctx, testConfig(), func(context.Context) error { return nil })
	if secondErr == nil || !strings.Contains(secondErr.Error(), "already running") {
		t.Fatalf("second RunLoop error = %v, want already-running error", secondErr)
	}

	cancel()
	if err := <-firstDone; err != nil {
		t.Fatalf("first RunLoop returned error: %v", err)
	}
}

func TestRunLoopCancellationDuringSleepIsClean(t *testing.T) {
	clock := newFakeClock(at(12, 0, 0))
	s := NewDailySchedulerWithClock(clock, logger.NewDiscard())
	cfg := testConfig()
	cfg.CommitsPerDay = 1

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	jobRan := make(chan struct{}, 1)
	go func() {
		done <- s.RunLoop(ctx, cfg, func(context.Context) error {
			jobRan <- struct{}{}
			return nil
		})
	}()

	time.Sleep(10 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("RunLoop returned error: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("RunLoop did not terminate after cancellation")
	}

	select {
	case <-jobRan:
		t.Fatal("job ran after cancellation")
	default:
	}
}
