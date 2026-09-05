# Development fixtures

Temporary in-process data for master-data screens, used only until the shared
database and master-data contracts are published. Nothing here is persisted:
records reset when the server restarts.

Remove this directory and repoint `src/app/(workspace)/**` at the published
services when those contracts land.
