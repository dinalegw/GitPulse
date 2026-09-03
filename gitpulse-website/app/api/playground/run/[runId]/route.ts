import { NextRequest, NextResponse } from 'next/server';
import { loadRun } from '@/lib/run-store';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await loadRun(runId);
  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }
  return NextResponse.json({
    runId: run.runId,
    state: run.state,
    stateHistory: run.stateHistory,
    exitCode: run.exitCode,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    command: run.command,
    args: run.args,
  });
}