// This file is overwritten by scripts/playground/create-runtime-snapshot.mjs
// during Vercel builds. Keep the checked-in fallback null so local/CI builds
// do not require Vercel credentials.
export const PLAYGROUND_RUNTIME = {
  schemaVersion: 1,
  snapshotId: null as string | null,
  sourceCommit: null as string | null,
  binarySha256: null as string | null,
  region: 'iad1',
} as const;
