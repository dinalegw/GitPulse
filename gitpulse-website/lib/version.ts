// Version utility - reads from VERSION file at build time
// This allows the website to display the same version as the CLI

export function getVersion(): string {
  // In production, this will be replaced at build time via next.config.js
  // For development, we read from the environment or fallback
  return process.env.NEXT_PUBLIC_GITPULSE_VERSION || '1.0.0';
}

// Static version for use at build time (populated by build script)
export const VERSION = getVersion();