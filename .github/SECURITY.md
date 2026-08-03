# Security Policy

## Reporting a Vulnerability

Please **do not open a public issue** for security problems.

Report privately via GitHub **Private Vulnerability Reporting**:
open the [**Security** tab](https://github.com/konradthiemann/Pokekon/security)
→ **Report a vulnerability**. This opens a private advisory visible only to the
maintainer.

Include, where possible:

- affected area (web app, API, auth, battle-log parser, deck/log import, …),
- steps to reproduce or a proof of concept,
- impact and any suggested remediation.

This is a solo-maintained project, so responses are best-effort. Please allow a
reasonable window to fix before any public disclosure.

## Supported Versions

Only the latest `main` (and what is currently deployed from it) is supported.
There are no long-term support branches.

## Secret Handling & Rotation

Secrets are **server-side only** and are never committed to the repository:

- API secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, email and
  OAuth provider credentials) live as **Railway environment variables**.
- The deploy pipeline uses a `RAILWAY_TOKEN` stored as a GitHub Actions secret.
- `.env`, `.env.local`, and `.env.*.local` are git-ignored. Committed
  `.env.example` / `.env.development` files contain only placeholders and public
  URLs (no credentials).
- User-supplied LLM API keys (bring-your-own-key) are **encrypted at rest**
  before being stored.

If a secret is ever exposed, **rotate it first** (Railway variables and the
relevant provider console), then invalidate the old value. Rewriting git history
is only a secondary, defense-in-depth step — rotation is the real fix.
