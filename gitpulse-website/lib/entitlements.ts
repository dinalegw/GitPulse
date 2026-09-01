// Monetization architecture.
//
// GitPulse is split into a permanently-free, fully-open-source CLI plus a
// hosted platform. The hosted platform itself is split into plan tiers
// (Free / Pro / Team / Enterprise) but the boundary is enforced through
// ENTITLEMENTS, not through scattered `if (plan === 'pro')` checks.
//
// How a feature becomes paid:
//   1. The feature is added to the FeatureId enum (or string union).
//   2. Each plan declares the set of FeatureIds it unlocks.
//   3. Authorization helpers in the API look up the user's entitlements
//      via the entitlement store and gate the route handler.
//
// No code anywhere compares a plan name to a literal string. Plans are
// data; entitlements are data; the source of truth for both lives in
// one place (this file + the entitlement store).

export const PLAN_IDS = ['free', 'pro', 'team', 'enterprise'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

// Feature catalogue. Adding a new feature means:
//   - Adding its id here.
//   - Adding it to the relevant plan in PLAN_FEATURES.
//   - Calling hasFeature(user, 'feature_id') in the API that gates it.
export const FEATURE_IDS = [
  // CLI is always free; the website mirrors it.
  'cli.use',
  'playground.run',
  'playground.save_session',
  // Hosted platform.
  'platform.connect_github',
  'platform.connect_github_private_repos',
  'platform.repository_select',
  'platform.scheduled_runs',
  'platform.history.retention_30d',
  'platform.history.retention_1y',
  'platform.analytics.basic',
  'platform.analytics.advanced',
  'platform.team.repositories',
  'platform.organization.sso',
  'platform.audit.export',
  // Anti-abuse limits are also entitlements so they can be relaxed per-plan.
  'playground.concurrency.1',
  'playground.concurrency.3',
  'playground.concurrency.10',
  'platform.run_rate_limit.basic',
  'platform.run_rate_limit.elevated',
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export const PLAN_FEATURES: Record<PlanId, ReadonlyArray<FeatureId>> = {
  free: [
    'cli.use',
    'playground.run',
    'playground.concurrency.1',
    'platform.connect_github',
    'platform.repository_select',
    'platform.run_rate_limit.basic',
  ],
  pro: [
    'cli.use',
    'playground.run',
    'playground.save_session',
    'playground.concurrency.3',
    'platform.connect_github',
    'platform.connect_github_private_repos',
    'platform.repository_select',
    'platform.scheduled_runs',
    'platform.history.retention_30d',
    'platform.analytics.basic',
    'platform.run_rate_limit.basic',
  ],
  team: [
    'cli.use',
    'playground.run',
    'playground.save_session',
    'playground.concurrency.10',
    'platform.connect_github',
    'platform.connect_github_private_repos',
    'platform.repository_select',
    'platform.scheduled_runs',
    'platform.history.retention_1y',
    'platform.analytics.basic',
    'platform.analytics.advanced',
    'platform.team.repositories',
    'platform.run_rate_limit.elevated',
  ],
  enterprise: [
    'cli.use',
    'playground.run',
    'playground.save_session',
    'playground.concurrency.10',
    'platform.connect_github',
    'platform.connect_github_private_repos',
    'platform.repository_select',
    'platform.scheduled_runs',
    'platform.history.retention_1y',
    'platform.analytics.basic',
    'platform.analytics.advanced',
    'platform.team.repositories',
    'platform.organization.sso',
    'platform.audit.export',
    'platform.run_rate_limit.elevated',
  ],
};

export interface Entitlements {
  planId: PlanId;
  features: ReadonlySet<FeatureId>;
}

export function entitlementsFor(planId: PlanId): Entitlements {
  return {
    planId,
    features: new Set(PLAN_FEATURES[planId]),
  };
}

// hasFeature is the ONLY way the rest of the codebase should test whether
// a feature is available. The caller passes the user's entitlements and
// the feature id; the helper returns boolean.
//
// This indirection is what makes the monetization architecture stable:
// changing which features a plan offers is a data change, not a code
// change. Every call site just asks "does the user have this feature?".
export function hasFeature(entitlements: Entitlements | null, feature: FeatureId): boolean {
  if (!entitlements) return false;
  return entitlements.features.has(feature);
}

// requiresFeature is a thin wrapper around hasFeature that throws the
// canonical error if the user is missing the entitlement. Use it at the
// top of privileged API routes.
export function requiresFeature(entitlements: Entitlements | null, feature: FeatureId): void {
  if (!hasFeature(entitlements, feature)) {
    const err = new Error(`This action requires the "${feature}" feature.`);
    (err as Error & { code?: string }).code = 'entitlement_missing';
    (err as Error & { feature?: string }).feature = feature;
    throw err;
  }
}

// isPlanId guards against string typos at the API boundary.
export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}