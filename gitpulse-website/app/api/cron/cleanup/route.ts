// Orphan sandbox cleanup endpoint. Called by Vercel Cron or by an external
// scheduler on a 1-minute cadence.
//
// Authentication: requires CRON_SECRET in the Authorization header. If the
// secret is not configured, the endpoint returns 503 so it cannot be
// invoked accidentally in development.

import { NextRequest, NextResponse } from 'next/server';
import { cleanupStuckRuns } from '@/lib/run-store';
import { appendAuditEvent } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 503 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Anything still non-terminal after 5 minutes is an orphan.
  const cleaned = await cleanupStuckRuns(5 * 60 * 1000);
  await appendAuditEvent({
    type: 'playground_orphan_cleanup',
    runsCleaned: cleaned,
  });
  return NextResponse.json({ ok: true, runsCleaned: cleaned });
}