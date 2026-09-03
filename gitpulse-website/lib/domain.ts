// Domain model for the GitPulse hosted platform.
//
// These types describe the *shape* of the entities that will live in the
// production database once the platform ships. They are TypeScript
// interfaces, not runtime classes — the implementation that hydrates
// them from the database lives in `lib/db/` (out of scope today; the
// real backing store will be Postgres via Vercel Postgres or a managed
// instance, with KV caching in front for hot reads).
//
// What is *deliberately* omitted:
//   - Passwords. GitPulse never stores passwords.
//   - Raw OAuth tokens. GitPulse persists only identity + scopes. The
//     short-lived bearer token is used per-request and dropped.
//   - Personal access tokens. The platform uses OAuth, never PATs.
//   - Repository contents. Only metadata about repositories is stored.

import type { PlanId } from './entitlements';

export interface EntityMeta {
  id: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface User extends EntityMeta {
  githubUserId: number;
  githubLogin: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string;
  planId: PlanId;
  // The OAuth scopes the user actually granted during the most recent
  // authorization. Tracked so the UI can warn when scopes are revoked.
  grantedScopes: string[];
}

export interface GitHubInstallation extends EntityMeta {
  installationId: number;
  accountLogin: string;
  accountType: 'User' | 'Organization';
  // A user can be a member of multiple installations; we materialize
  // membership at the user level for fast authorization checks.
}

export interface Workspace extends EntityMeta {
  ownerUserId: string;
  name: string;
  installations: string[]; // installation IDs
  members: WorkspaceMember[];
}

export interface WorkspaceMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
}

export interface Subscription extends EntityMeta {
  workspaceId: string;
  planId: PlanId;
  // The active billing provider ID is intentionally absent in this
  // header. Real Stripe IDs (or whatever provider the platform adopts)
  // belong in a separate `BillingProvider` entity that this domain
  // model references by id, not by embedding.
  billingProviderRef?: string;
  currentPeriodEndsAt?: string;
  cancelAt?: string;
}

export interface EntitlementSnapshot extends EntityMeta {
  userId: string;
  workspaceId?: string;
  planId: PlanId;
  // Snapshots are computed and cached; they exist so that authorization
  // checks do not need to walk the subscription chain on every request.
  features: string[];
  expiresAt: string;
}

export interface Repository extends EntityMeta {
  workspaceId: string;
  installationId: number;
  githubRepoId: number;
  fullName: string; // owner/name
  defaultBranch: string;
  visibility: 'public' | 'private' | 'internal';
}

export interface Run extends EntityMeta {
  workspaceId: string;
  repositoryId: string;
  triggeredBy: 'user' | 'schedule' | 'api';
  scheduleSpec?: string; // e.g. cron expression
  state: RunState;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  errorMessage?: string;
  commitSha?: string;
}

export const RUN_STATES = [
  'QUEUED',
  'STARTING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
  'CANCELLED',
  'CLEANUP',
  'CLEANUP_FAILED',
  'DISPOSED',
] as const;
export type RunState = (typeof RUN_STATES)[number];

export interface RunStep extends EntityMeta {
  runId: string;
  sequence: number;
  name: 'validate' | 'preflight_push' | 'commit' | 'push';
  state: RunState;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
}

export interface SandboxSession extends EntityMeta {
  runId: string;
  // The provider (E2B) sandbox id is intentionally NOT stored here.
  // The platform's privacy model is that sandbox ids live in a
  // short-lived cache with TTL and never reach durable storage.
  ipHash: string;
  command: string;
  args: string[];
  durationMs: number;
  outcome: 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
}

export interface AuditEvent extends EntityMeta {
  actorUserId?: string;
  actorLogin?: string;
  type: string;
  ip?: string;
  userAgent?: string;
  // Free-form metadata bag, but every value MUST be redactable. Callers
  // should pre-filter through lib/audit-log.ts#redact before persisting.
  metadata?: Record<string, string | number | boolean | null>;
}

export interface UsageRecord extends EntityMeta {
  userId: string;
  workspaceId?: string;
  resource: 'playground_run' | 'scheduled_run' | 'github_api_call';
  quantity: number;
  periodStart: string;
  periodEnd: string;
}

// Retention policy: how long each entity is kept by default. The actual
// retention is configurable per workspace through the Team / Enterprise
// plans, but the defaults here reflect the privacy-by-design baseline.
export const DEFAULT_RETENTION: Record<string, string> = {
  AuditEvent: '90d',
  SandboxSession: '24h',
  Run: '30d',
  UsageRecord: '90d',
  EntitlementSnapshot: '24h',
};