// Server-side authorization helper.
//
// Every privileged API route should call `requireAuthorization` (or
// `getAuthorization`) at the top. The helper:
//
//   1. Reads the session cookie.
//   2. Loads the session from the server-side store.
//   3. Confirms the GitHub installation is still reachable for the user.
//   4. Verifies the requested feature is in the user's entitlement set.
//
// Calling the helper at the top of every handler is the canonical way to
// enforce the " authenticated + authorized + selected + action " chain.
// Hidden UI buttons are not a security control — this server-side check
// is.

import { readSessionCookie } from './github-oauth';
import { loadSession } from './session-store';
import {
  entitlementsFor,
  hasFeature,
  isPlanId,
  requiresFeature,
  type Entitlements,
  type FeatureId,
  type PlanId,
} from './entitlements';

export interface AuthorizationContext {
  authenticated: boolean;
  userId?: string;
  githubLogin?: string;
  installationIds: number[];
  planId: PlanId;
  entitlements: Entitlements;
}

export const ANONYMOUS_CONTEXT: AuthorizationContext = {
  authenticated: false,
  installationIds: [],
  planId: 'free',
  entitlements: entitlementsFor('free'),
};

// getAuthorization returns the current requester's authorization context
// without throwing. Use it when the route must adapt to anonymous users
// (e.g. the playground can be used without sign-in).
export async function getAuthorization(): Promise<AuthorizationContext> {
  const sessionId = await readSessionCookie();
  if (!sessionId) return ANONYMOUS_CONTEXT;
  const session = await loadSession(sessionId);
  if (!session) return ANONYMOUS_CONTEXT;
  const planId: PlanId = isPlanId(process.env.DEFAULT_PLAN_ID) ? process.env.DEFAULT_PLAN_ID : 'free';
  return {
    authenticated: true,
    userId: String(session.user.id),
    githubLogin: session.user.login,
    installationIds: session.installationIds,
    planId,
    entitlements: entitlementsFor(planId),
  };
}

// requireAuthentication throws if the requester is not signed in.
export async function requireAuthentication(): Promise<AuthorizationContext> {
  const ctx = await getAuthorization();
  if (!ctx.authenticated) {
    const err = new Error('Sign in with GitHub to continue.');
    (err as Error & { code?: string }).code = 'unauthorized';
    throw err;
  }
  return ctx;
}

// requireFeature combines authentication + entitlement enforcement. Use
// it at the top of any privileged handler.
export async function requireFeature(feature: FeatureId): Promise<AuthorizationContext> {
  const ctx = await requireAuthentication();
  requiresFeature(ctx.entitlements, feature);
  return ctx;
}

// requireInstallationAccess verifies the user has at least one GitHub
// installation linked and that a specific repository belongs to one of
// those installations. This prevents a malicious browser from
// referencing a repository_id they do not actually own.
export async function requireInstallationAccess(installationId: number): Promise<AuthorizationContext> {
  const ctx = await requireAuthentication();
  if (!ctx.installationIds.includes(installationId)) {
    const err = new Error('GitHub installation not accessible from this session.');
    (err as Error & { code?: string }).code = 'installation_forbidden';
    throw err;
  }
  return ctx;
}

export function hasFeatureInContext(ctx: AuthorizationContext, feature: FeatureId): boolean {
  return hasFeature(ctx.entitlements, feature);
}