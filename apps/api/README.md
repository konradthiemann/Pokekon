# @pokekon/api

Hono HTTP server with Better Auth (email/password + Google OAuth) on Postgres via Drizzle ORM.
Deployed on Railway; see `railway.json` (repo root and here).

## Setup

```bash
npm install            # from the repo root
cp apps/api/.env.example apps/api/.env   # fill in values
npm run dev:api        # from the repo root, or: npm run dev -w @pokekon/api
```

`/health` works without a database. `/api/auth/*` requires `DATABASE_URL`.

## Environment variables

| Variable               | Required               | Description                               |
| ---------------------- | ---------------------- | ----------------------------------------- |
| `PORT`                 | no (default `8080`)    | HTTP port                                 |
| `DATABASE_URL`         | for auth + migrations  | Postgres connection string                |
| `BETTER_AUTH_SECRET`   | in production          | Auth signing secret                       |
| `BETTER_AUTH_URL`      | recommended in prod    | Public base URL of this API               |
| `WEB_ORIGIN`           | no (default `:5173`)   | CORS origin for the web app (credentials) |
| `GOOGLE_CLIENT_ID`     | no                     | Google OAuth — provider enabled only when |
| `GOOGLE_CLIENT_SECRET` | no                     | both values are set                       |

## Scripts

| Script        | Purpose                                  |
| ------------- | ---------------------------------------- |
| `dev`         | `tsx watch src/index.ts`                 |
| `build`       | `tsc` → `dist/`                          |
| `start`       | `node dist/index.js`                     |
| `lint`        | ESLint (flat config)                     |
| `typecheck`   | `tsc --noEmit`                           |
| `test`        | Vitest (runs without a database)         |
| `db:generate` | Generate SQL migrations from the schema  |
| `db:migrate`  | Apply migrations (needs `DATABASE_URL`)  |

## Migrations

```bash
npm run db:generate -w @pokekon/api                          # offline, writes apps/api/drizzle/
DATABASE_URL=postgres://… npm run db:migrate -w @pokekon/api # applies to the database
```

The auth schema in `src/db/schema.ts` is the canonical Better Auth core schema
(generated with `@better-auth/cli generate`). Re-run that CLI after changing the
auth config, then `db:generate` + `db:migrate`.
