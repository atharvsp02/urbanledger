# UrbanLedger

UrbanLedger is a local-first accounting application connecting contacts, products, purchases,
sales, bills, invoices, payments, journals, budgets and financial reports.

## Current status

The backend foundation is implemented. It includes pinned local Supabase services, Prisma
migrations, validated environment boundaries, idempotent showcase data, password authentication,
server-enforced Admin, Accountant and Contact access, and explicit Contact portal ownership.
Accounting transaction commands and reports are the next implementation slice.

## Development

Use Node.js 22.13 or newer within the 22.x release line and pnpm 11.24.0. Docker must be installed
and running.

```bash
pnpm install --frozen-lockfile
pnpm local:start
pnpm dev
```

`pnpm local:start` creates the private `.env.local`, applies migrations and safely reapplies the
seed. The seed Login IDs are `uladmin`, `ulacct`, `ulcust` and `ulvend`. Their private passwords
are stored only in the matching `URBANLEDGER_SEED_*_PASSWORD` entries in `.env.local`.

Open http://127.0.0.1:3000. Captured Auth email is available at http://127.0.0.1:54324. Use
`pnpm local:status` to inspect safe service endpoints and `pnpm local:stop` to stop services
without deleting data. Reset local data only with:

```bash
pnpm local:reset -- --confirm urbanledger
```

Run `pnpm check` and `pnpm build` before committing. Install the pinned browser once with
`pnpm exec playwright install chromium`, then run the authentication suite with
`pnpm test:e2e`. `pnpm start` serves a production build. Do not run development and production
builds against the same build directory simultaneously.

The starter's ESLint 9 emits an upstream deprecation warning. Some bundled lint plugins do not
declare ESLint 10 support yet, so the linting stack remains pinned.

## Local-first architecture

Development, acceptance and presentation run locally. No Vercel deployment, Supabase cloud
project or external email service is required or configured.

- Next.js, React and TypeScript provide the application and server-side boundaries.
- Local Supabase CLI and Docker provide PostgreSQL, password Auth, private Storage and captured
  email.
- Prisma is the only business-data path and runs on the server with a restricted database role.
- Login uses Login ID and password. Public signup creates Accountant access only.
- Supabase verifies identity. Current database grants and explicit Contact links determine access.
- Browser Supabase access is limited to Auth. Privileged keys remain server-only.
- Initial package, browser and container downloads must be prepared before offline verification.

A future hosted deployment can supply reviewed environment values to the same business code. It
still requires separate approval, fresh secrets and a controlled data, Auth and object migration.
No automatic local-to-hosted synchronization is promised.

## Repository layout

```text
.
  prisma/         schema, migrations and idempotent seed
  scripts/        guarded local setup and reset commands
  src/app/        routes, server actions and HTTP boundaries
  src/lib/        shared validation and typed contracts
  src/server/     database, authentication and authorization boundaries
  supabase/       local service configuration
  tests/e2e/      critical browser workflows
```

`docs/` and `inspiration/` are local, Git-ignored references. Never import from or modify the
reference repositories as application runtime code.

## Product and security boundaries

The baseline roles are Admin, Accountant and Contact. Contact is the restricted customer/vendor
portal role. Roles, totals, account identifiers and ownership claims from clients are untrusted.

All financial documents will use one transactional posting engine with exact decimal arithmetic.
Reports will derive from persisted posted journal items. Posted history will be corrected through
linked reversals, never silent edits or deletion.

The payment flow will accept an amount and show success only after the database transaction
commits. It will update the existing invoice, allocate the payment, post ledger effects and create
a numbered receipt without creating another invoice. Simulation disclosure belongs only in the
payment flow, payment history and receipt.

## Contributing

Keep changes scoped and comments minimal. Stage explicit paths, run configured checks, review the
staged diff and use a one-line Conventional Commit without AI attribution.
