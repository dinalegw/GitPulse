package cmd

import (
	"context"
	"os/signal"
	"syscall"
)

func signalContext(parent context.Context) context.Context {
	ctx, _ := signal.NotifyContext(parent, syscall.SIGINT, syscall.SIGTERM)
	return ctx
}
