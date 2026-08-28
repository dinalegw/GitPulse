# GitPulse Website

The official website for [GitPulse](https://github.com/dinalegw/GitPulse) — a local-only CLI tool for automating scheduled Git commits.

## Features

- **Landing Page** — Marketing page with terminal demo, command grid, responsible use callout
- **Documentation** — Auto-generated from `lib/commands.ts` (single source of truth)
- **Live Playground** — Run real GitPulse binary in E2B sandbox with xterm.js terminal
- **Responsible Use** — Prominent disclaimer matching the CLI's own philosophy

## Tech Stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS v4 with custom design tokens
- **Terminal:** xterm.js + @xterm/addon-fit + @xterm/addon-web-links
- **Sandbox:** E2B (microVM sandboxes)
- **Rate Limiting:** Vercel KV (Upstash Redis)
- **Deployment:** Vercel (serverless/edge functions)
- **Fonts:** Geist Mono / Geist Sans (Vercel's design system)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- E2B API key (for playground)

### Installation

```bash
cd gitpulse-website
pnpm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the required values:

```bash
cp .env.example .env.local
```

Required:
- `E2B_API_KEY` — Get from [E2B Dashboard](https://e2b.dev/dashboard)

Optional:
- `E2B_TEMPLATE_ID` — Pre-baked template with GitPulse pre-installed
- `PLAYGROUND_MAX_SECONDS` — Sandbox timeout (default: 60)
- `RATE_LIMIT_PER_MINUTE` — Per-IP rate limit (default: 5)
- `RATE_LIMIT_PER_HOUR` — Per-IP hourly rate limit (default: 20)
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — Vercel KV for rate limiting

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
pnpm build
pnpm start
```

## Project Structure

```
gitpulse-website/
├── app/
│   ├── page.tsx                      # Landing page
│   ├── layout.tsx                    # Root layout + metadata
│   ├── globals.css                   # Tailwind + custom tokens
│   ├── docs/
│   │   └── [...slug]/page.tsx        # Dynamic docs pages
│   ├── playground/
│   │   └── page.tsx                  # Live terminal playground
│   ├── api/
│   │   └── playground/
│   │       ├── run/route.ts          # SSE endpoint - starts sandbox
│   │       └── input/route.ts        # POST stdin to sandbox
│   └── favicon.ico
├── components/
│   ├── Terminal.tsx                  # xterm.js wrapper (shared)
│   ├── CommandGrid.tsx               # Landing command cards
│   ├── CopyInstallCommand.tsx        # Copy-to-clipboard button
│   ├── ResponsibleUseCallout.tsx     # Required disclaimer
│   ├── StepDiagram.tsx               # Lifecycle diagram
│   ├── TrustBadges.tsx               # Trust badges + platform icons
│   ├── DocsPage.tsx                  # Docs page component
│   └── ui/                           # Primitive components (Button, Card, Select)
├── lib/
│   ├── commands.ts                   # Single source of truth for CLI metadata
│   ├── sandbox.ts                    # E2B client wrapper
│   ├── rate-limit.ts                 # Vercel KV rate limiter
│   └── utils.ts                      # Shared helpers
├── public/                           # Static assets (OG image, favicon)
├── vercel.json                       # Function config (maxDuration)
├── .env.example                      # Documented env vars
├── next.config.ts
├── tailwind.config.ts                # Custom design tokens
├── tsconfig.json
└── package.json
```

## Design System

Colors and tokens match the reference poster:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg-primary` | `#0a0e14` | Page background |
| `--color-bg-card` | `#111827` | Card backgrounds |
| `--color-border-subtle` | `#1f2937` | Borders, dividers |
| `--color-accent-primary` | `#22c55e` | "Pulse" wordmark, CTAs, checkmarks |
| `--color-accent-secondary` | `#a855f7` | Secondary icons (purple/violet) |
| `--color-text-primary` | `#f9fafb` | Primary text |
| `--color-text-muted` | `#9ca3af` | Secondary text |

## Playground Architecture

The playground runs the **real GitPulse binary** in an E2B microVM:

1. Sandbox created from template (or installs GitPulse on boot)
2. Scratch git repo initialized with a local bare repo as "origin"
3. Command executed via E2B PTY API (bidirectional terminal)
4. Output streamed via SSE to xterm.js in browser
5. Sandbox destroyed after 60s idle

**Security:**
- Command allow-list (no arbitrary flags)
- Per-IP rate limiting
- No network egress except module proxies
- Ephemeral filesystem per session

## Adding New CLI Commands

All CLI metadata lives in `lib/commands.ts`. To add a command:

1. Add entry to `COMMANDS` array
2. Add to `PLAYGROUND_COMMANDS` if it should appear in playground
3. Add to `DOCS_ONLY` if docs-only (e.g., `run --schedule`)
4. Run `pnpm build` — docs pages generate automatically

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel
3. Add environment variables from `.env.example`
4. Deploy

**Note:** Vercel Hobby plan has 10s function timeout. Playground API sets `maxDuration: 60` which requires Vercel Pro. On Hobby, sandbox boot + command must complete <10s — acceptable for dry-run commands, but interactive wizard needs Pro.

## License

MIT — same as GitPulse CLI.

## Responsible Use

This website includes a prominent **Responsible Use** callout (not buried in footer), matching the CLI's own disclaimer:

> GitPulse automates Git operations you configure. It is **not** a tool for deceiving GitHub or fabricating the appearance of development activity. You are responsible for ensuring that automated commits accurately reflect meaningful repository activity.