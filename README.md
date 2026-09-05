# UrbanLedger

An accounting application connecting contacts, products, purchases, sales, bills, invoices,
payments, journals, budgets and financial reports.

This repository is the application root. Build and run the project directly here; do not create
a second project root inside it or turn an inspiration project into the application.

## Current status

Only the project setup is implemented: Next.js 16.3.4, React 19.2.8, TypeScript, Tailwind,
linting, formatting, a starter page and an application-only health endpoint. Authentication,
database integration and all accounting features are still planned, not built.

## Development

Use Node.js 22.13 or newer within the 22.x release line and pnpm 11.24.0.
The package manager and dependency versions are pinned in the repository.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. The starter needs no environment variables or external services.
Run `pnpm check` for lint, type and formatting checks, then `pnpm build` separately for a
production build. `pnpm start` serves that build. Do not run development and production builds
against the same build directory simultaneously.

The starter's ESLint 9 emits an upstream deprecation warning. Some bundled lint plugins do not
declare ESLint 10 support yet; review the compatible linting stack before production release.

## Local-first architecture

Development and the hackathon presentation will run entirely locally. No Vercel deployment,
Supabase cloud project or external email service is required or configured.

- Next.js, React and TypeScript for the application, including server-side handlers.
- Tailwind with shared UI components and semantic design tokens.
- Local Supabase CLI/Docker services for PostgreSQL, password authentication and private Storage.
- Prisma for server-side business data access, with persistent local database/image volumes.
- Login ID/password, Accountant signup, authorized user creation and local password recovery.
- A captured local email inbox for confirmation and reset links; no real outbound email.
- Local Next.js for frontend and backend, including a local production-build presentation.

Only the frontend/framework tooling is initialized. Prisma, local services, account workflows
and data preparation have not been implemented. Initial package/container downloads will be
prepared before verifying the complete application without external network access.

A later hosted deployment will use the same business code with reviewed environment settings,
new secrets, callbacks, email configuration and either fresh data or a controlled migration of
database records, Auth identities and image objects. Browser-public endpoint changes require a
rebuild. This is a portability requirement, not an automatic deployment or data-sync switch;
hosting requires a separate instruction.

## Repository layout

Current:

```text
.
  README.md       project entry point
  .gitignore      local-reference, secret and generated-file exclusions
  package.json    dependencies and development/check/build commands
  pnpm-lock.yaml  reproducible dependency resolution
  src/app/        starter page, layout, styles, icon, 404 and health route
  docs/          local specifications and implementation plans, Git-ignored
  inspiration/   local reference projects, Git-ignored
```

Application directories to introduce when their implementations exist:

```text
src/components/   shared UI and accounting screens
src/lib/          contracts and shared helpers
src/server/       authorization, business commands and report queries
prisma/           schema and reviewed migrations
supabase/         local service configuration
public/           approved public assets
scripts/          setup and verification commands
```

Package/tooling configuration belongs at this repository root. Add tests and CI with their
actual consumers, not placeholder workflows that assume secrets or infrastructure exist.

## Product boundaries

The baseline roles are Admin, Invoicing User / Accountant, and User / Contact. User is the
restricted customer/vendor role, not Accountant. Signup creates Accountant only; Admin controls
privileged user creation. Accountant can manage customer/vendor details. The System actor means
automation, not another login role. Enforce permissions and Contact ownership on the server.

Required business workflows come before optional enhancements. All financial documents share
one transactional posting engine; reports derive from persisted posted journal items. A
simulated portal payment must be clearly labeled and still produce correct internal accounting
records when successful.

Contact profile-image capability is required. Furniture product photography is optional; the
complete accounting workflow must work with accessible placeholders.

Prepare private local access for Admin, Accountant, Customer and Vendor with realistic synthetic
records. The product dashboard must have no Demo/Sandbox banner, mode badge or credential panel.
The payment flow accepts an amount and shows success only after commit, with a numbered receipt,
updated existing invoice and local invoice/receipt PDF downloads. Payment simulation is disclosed
in the relevant payment flow and receipt, not as a global dashboard label. These remain planned.

## Local references and documentation

The current ignore policy intentionally excludes `docs/` and `inspiration/` from Git. They are
not part of a fresh clone, a build dependency, or runtime configuration. Local planning lives
under `docs/specs/` and `docs/plans/`; do not force-add it without an explicit change to that
policy.

Reuse selected reference code through reviewed adaptations. Do not import modules directly
from `inspiration/`, modify its repositories as part of application work, or copy old branding,
environment files, identities, credentials or unrelated business rules.

## Contributing

Keep code comments to the absolute minimum. Prefer clear names and structure; comment only
when a necessary reason, invariant or gotcha cannot be expressed in code. Avoid narration,
redundant docstrings and decorative comment headers. Preserve required license notices and
tooling directives.

Keep changes scoped, verify them using the configured tooling,
and commit completed work in logical parts with one-line Conventional Commit messages.
Do not include AI attribution or private session artifacts in Git history.
