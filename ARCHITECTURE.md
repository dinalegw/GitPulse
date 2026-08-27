# GitPulse Website Architecture

## Overview
A Next.js 15 (App Router) + TypeScript + Tailwind CSS website for the GitPulse CLI tool, deployed on Vercel with a live playground powered by E2B sandbox.

---

## Request Flow Diagrams

### (a) Marketing/Docs Pages (Static/ISR)
```
Browser → Vercel Edge/CDN → Next.js App Router (app/page.tsx, app/docs/[...slug]/page.tsx)
                                              ↓
                                        lib/commands.ts (static data)
                                              ↓
                                        components/* (shared UI)
                                              ↓
                                        Response: HTML (cached/ISR)
```
- **No serverless functions** for these pages — fully static or ISR
- `lib/commands.ts` is the single source of truth for all CLI command metadata

### (b) Live Playground Terminal
```
Browser (xterm.js) 
    │
    ├── SSE (output) ←── /api/playground/run?cmd=init&args=... (Edge Function, maxDuration: 60s)
    │       │
    │       ▼
    │   E2B Sandbox API (https://api.e2b.dev)
    │       │
    │       ├── Creates sandbox from pre-baked template (gitpulse + git pre-installed)
    │       ├── git init scratch repo + local bare repo as "origin"
    │       ├── Executes allow-listed gitpulse subcommand
    │       ├── Streams stdout/stderr via E2B SDK → SSE to browser
    │       └── Accepts stdin via POST /api/playground/input (session-scoped)
    │
    └── POST /api/playground/input (keystrokes/lines) → E2B sandbox stdin
```

### (c) Analyze Public Repo Dashboard — **DEFERRED (not in MVP)**
*GitPulse itself makes no GitHub API calls; website stays consistent by not adding any either.*

---

## Third-Party Services & Costs (Low Volume)

| Service | Purpose | Free Tier | Est. Cost at 1k sessions/mo |
|---------|---------|-----------|----------------------------|
| **E2B** | MicroVM sandboxes for playground | 100 sandbox-hours/mo free | ~$0 (well under free tier) |
| **Vercel** | Hosting + Serverless/Edge Functions | Hobby: generous; Pro: $20/mo | $0 (Hobby) or $20 (Pro) |
| **Vercel KV / Upstash Redis** | Rate limiting (optional) | 10k requests/day free | $0 |
| **Vercel Analytics** | Page views | Included | $0 |

> **Note on Vercel Hobby plan:** 10s max function duration. Playground API sets `maxDuration: 60` in `vercel.json` (requires Pro). On Hobby, sandbox boot + first command must complete <10s — acceptable for `run --dry-run`, `status`, `validate`, `doctor`, `logs`, `version`, `config show`. The interactive wizard needs ~30-60s; recommend Pro for full demo or document the limitation.

---

## Security Model for Playground

### Command Allow-List (strict, no wildcards)
```typescript
const ALLOWED_COMMANDS = {
  init: ['--repo', '--branch', '--commits', '--enabled', '--dry-run', '--no-detect'],
  run: ['--dry-run', '--count', '--once'],  // NO --schedule/--daemon
  status: [],
  logs: ['-n', '--lines', '--tail'],
  validate: [],
  version: [],
  doctor: [],
  'config': ['show', 'path', 'set'],  // set requires key+value validation
} as const;
```

### Sandbox Isolation
- **No network egress** except: `go.dev` (module proxy), `github.com` (if user adds real remote — blocked by sandbox firewall default-deny)
- **Ephemeral filesystem**: Each session gets fresh sandbox; destroyed after 60s idle or explicit end
- **No visitor-supplied flags** outside allow-list per command
- **Per-IP rate limit**: 5 sessions/minute, 20 sessions/hour (Vercel KV counter)
- **Sandbox timeout**: 60s hard limit (configurable via env `PLAYGROUND_MAX_SECONDS`)

### Input Validation
- `config set <key> <value>`: key must be in `config.AllowedKeys`, value type-checked
- `run --count`: integer 1-100
- `init --repo`: must be relative path inside sandbox workspace
- All other flags: validated against Cobra's flag definitions (no arbitrary passthrough)

---

## Tech Stack Summary

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15 (App Router) | Vercel-native, RSC, streaming, edge functions |
| Language | TypeScript | Type-safe command metadata, API routes |
| Styling | Tailwind CSS v4 | Utility-first, dark theme tokens, no CSS-in-JS |
| Terminal | xterm.js + @xterm/addon-fit + @xterm/addon-web-links | Browser terminal, SSE-fed, accessible fallback |
| Sandbox | E2B (or equivalent) | Serverless microVMs, SSE/WS streaming, pre-baked templates |
| Rate Limit | Vercel KV (Upstash Redis) | Edge-compatible, no infra |
| Analytics | Vercel Analytics | Zero-config, privacy-friendly |
| Icons | lucide-react | Consistent, tree-shakable |
| Fonts | Geist Mono (monospace), Geist Sans (UI) | Vercel's design system, matches poster |

---

## Environment Variables

```bash
# Required
E2B_API_KEY=                 # From https://e2b.dev/dashboard
E2B_TEMPLATE_ID=             # Pre-baked template with gitpulse + git installed

# Optional
PLAYGROUND_MAX_SECONDS=60    # Sandbox session TTL
RATE_LIMIT_PER_MINUTE=5      # Per-IP session starts
RATE_LIMIT_PER_HOUR=20       # Per-IP session starts
```

---

## Repository Structure

```
gitpulse-website/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── docs/
│   │   └── [...slug]/
│   │       └── page.tsx            # Docs pages (dynamic from lib/commands.ts)
│   ├── playground/
│   │   └── page.tsx                # Live terminal page
│   ├── api/
│   │   └── playground/
│   │       ├── run/
│   │       │   └── route.ts        # SSE endpoint - starts sandbox, streams output
│   │       └── input/
│   │           └── route.ts        # POST stdin to running sandbox
│   ├── layout.tsx                  # Root layout (fonts, globals)
│   ├── globals.css                 # Tailwind + custom tokens
│   └── favicon.ico
├── components/
│   ├── Terminal.tsx                # xterm.js wrapper (shared landing + playground)
│   ├── CommandGrid.tsx             # Landing "Powerful Commands" grid
│   ├── CopyInstallCommand.tsx      # Copy-to-clipboard button
│   ├── ResponsibleUseCallout.tsx   # Required callout component
│   ├── StepDiagram.tsx             # "One Command. Full Lifecycle." diagram
│   ├── TrustBadges.tsx             # Safe/Local/Fast badges
│   └── ui/                         # shadcn-style primitives (Button, Card, etc.)
├── lib/
│   ├── commands.ts                 # Single source of truth for all CLI metadata
│   ├── sandbox.ts                  # E2B client wrapper + session management
│   ├── rate-limit.ts               # Vercel KV rate limiter
│   └── utils.ts                    # Shared helpers
├── public/
│   └── og-image.png                # OpenGraph image (1200x630)
├── vercel.json                     # Function config (maxDuration, etc.)
├── .env.example                    # Documented env vars
├── next.config.ts
├── tailwind.config.ts              # Custom tokens (dark theme, accent colors)
├── tsconfig.json
├── package.json
└── README.md
```

---

## Data Flow: `lib/commands.ts` as Single Source

```typescript
// lib/commands.ts
export const COMMANDS: CommandMeta[] = [
  {
    name: 'init',
    description: 'Initialize GitPulse configuration in a repository',
    flags: [
      { name: '--repo', description: 'Repository path', type: 'string' },
      { name: '--branch', description: 'Remote branch name', type: 'string' },
      { name: '--commits', description: 'Commits per day', type: 'number' },
      { name: '--enabled', description: 'Enable automation', type: 'boolean' },
      { name: '--dry-run', description: 'Simulate without writes', type: 'boolean' },
      { name: '--no-detect', description: 'Skip auto-detection', type: 'boolean' },
    ],
    playground: { allowed: true, defaultArgs: [] },
    sampleOutput: '$ gitpulse init\n✓ Configuration created at ~/.gitpulse/config.yaml\n✓ Repository: /home/user/project\n✓ Branch: main\n✓ Commits/day: 4',
  },
  // ... all 8 commands + quick wizard + run --schedule (docs-only)
];
```

**Usage:**
- Landing page: `CommandGrid` maps over `COMMANDS`
- Docs: `app/docs/[...slug]/page.tsx` finds command by slug, renders detail
- Playground: dropdown options from `COMMANDS.filter(c => c.playground.allowed)`
- All copy derived from AUDIT.md — no hand-written duplication

---

## Visual Design Tokens (from reference poster)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0a0e14` | Page background |
| `--bg-card` | `#111827` | Card backgrounds |
| `--border-subtle` | `#1f2937` | Card borders, dividers |
| `--accent-primary` | `#22c55e` | "Pulse" wordmark, primary CTAs, checkmarks |
| `--accent-secondary` | `#a855f7` | Secondary icons (purple/violet) |
| `--text-primary` | `#f9fafb` | Primary text |
| `--text-muted` | `#9ca3af` | Secondary text, placeholders |
| `--font-mono` | `'Geist Mono', 'JetBrains Mono', monospace` | Terminal, code |
| `--font-sans` | `'Geist Sans', 'Inter', sans-serif` | UI text |
| `--radius-card` | `0.75rem` (12px) | Card corners |
| `--radius-terminal` | `0.5rem` (8px) | Terminal chrome |

**Terminal Window Chrome** (reused on landing + playground):
- Rounded card with `--bg-card` background, `--border-subtle` border
- Three traffic-light dots (red `#ef4444`, yellow `#fbbf24`, green `#22c55e`) top-left
- Command name centered in title bar
- xterm.js canvas fills interior

---

## MVP Scope Confirmation

### IN MVP
- ✅ Landing page with Responsible Use callout (prominent, not footer-only)
- ✅ Docs pages (1 per subcommand + quick wizard + run --schedule docs-only)
- ✅ Playground with xterm.js + SSE + E2B sandbox
- ✅ Default demo = interactive quick-setup wizard (`gitpulse` no args)
- ✅ Allow-listed read-only/dry-run commands in dropdown
- ✅ Scratch repo + local bare repo as origin (no real GitHub)
- ✅ Visible "disposable sandbox" notice
- ✅ Rate limiting, error states, accessibility fallback

### DEFERRED (Post-MVP)
- ❌ `run --schedule` live demo (foreground loop, needs minutes/hours)
- ❌ Custom pre-baked E2B template (start with plain + install-on-boot)
- ❌ Usage analytics dashboard
- ❌ User accounts / saved history (intentionally no per-user data)
- ❌ "Analyze a public repo" dashboard (GitPulse makes no GitHub API calls)

---

## Approval Checklist

- [ ] E2B as sandbox provider (or alternative?) 
- [ ] Vercel Pro for 60s function duration (or accept Hobby 10s limit for MVP)?
- [ ] Architecture matches your expectations?
- [ ] Any security concerns with the sandbox model?

**Once approved, I'll proceed to Phase 2 (Project Scaffold) → Phase 3 (MVP Pages) → Phase 4 (NFRs) → Phase 5 (Summary).**