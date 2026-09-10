import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Interactive terminal input is not enabled in the current playground.',
      code: 'INTERACTIVE_DISABLED',
    },
    { status: 410 }
  );
}
