import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parse } from 'dotenv'
import pg from 'pg'

const environmentPath = '.env.local'
const existing = existsSync(environmentPath) ? parse(readFileSync(environmentPath)) : {}
const statusResult = spawnSync('pnpm', ['exec', 'supabase', 'status', '--output', 'json'], {
	encoding: 'utf8'
})

if (statusResult.status !== 0) {
	console.error('Local Supabase is unavailable. Run pnpm local:start after Docker is running.')
	process.exit(statusResult.status ?? 1)
}

const status = JSON.parse(statusResult.stdout)
const directUrl = new URL(status.DB_URL)
directUrl.searchParams.set('schema', 'app')

const runtimePassword =
	existing.URBANLEDGER_RUNTIME_DATABASE_PASSWORD ?? randomBytes(24).toString('base64url')
const runtimeUrl = new URL(status.DB_URL)
runtimeUrl.username = 'urbanledger_app'
runtimeUrl.password = runtimePassword
runtimeUrl.search = ''

const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY
const secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY

if (!publishableKey || !secretKey) {
	console.error('Local Supabase did not provide the required Auth keys.')
	process.exit(1)
}

function localSeedPassword(current) {
	return current || `UrbanLedger_${randomBytes(18).toString('base64url')}`
}

const values = {
	URBANLEDGER_ENV: 'local',
	APP_URL: 'http://127.0.0.1:3000',
	DATABASE_URL: runtimeUrl.toString(),
	DIRECT_URL: directUrl.toString(),
	NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
	NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
	SUPABASE_SECRET_KEY: secretKey,
	SUPABASE_STORAGE_BUCKET: 'contact-images',
	URBANLEDGER_RUNTIME_DATABASE_PASSWORD: runtimePassword,
	URBANLEDGER_SEED_ADMIN_PASSWORD: localSeedPassword(existing.URBANLEDGER_SEED_ADMIN_PASSWORD),
	URBANLEDGER_SEED_ACCOUNTANT_PASSWORD: localSeedPassword(
		existing.URBANLEDGER_SEED_ACCOUNTANT_PASSWORD
	),
	URBANLEDGER_SEED_CUSTOMER_PASSWORD: localSeedPassword(
		existing.URBANLEDGER_SEED_CUSTOMER_PASSWORD
	),
	URBANLEDGER_SEED_VENDOR_PASSWORD: localSeedPassword(existing.URBANLEDGER_SEED_VENDOR_PASSWORD)
}

const serialized = `${Object.entries(values)
	.map(([key, value]) => `${key}=${value}`)
	.join('\n')}\n`

writeFileSync(environmentPath, serialized, { mode: 0o600 })
chmodSync(environmentPath, 0o600)

const client = new pg.Client({ connectionString: status.DB_URL })
await client.connect()
await client.query("SELECT set_config('urbanledger.runtime_password', $1, false)", [
	runtimePassword
])
const role = await client.query(`
	SELECT rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolcanlogin
	FROM pg_roles
	WHERE rolname = 'urbanledger_app'
`)

if (role.rowCount === 0) {
	await client.query(`
		DO $role$
		BEGIN
			EXECUTE format(
				'CREATE ROLE urbanledger_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
				current_setting('urbanledger.runtime_password')
			);
		END
		$role$;
	`)
} else {
	const attributes = role.rows[0]

	if (
		attributes.rolsuper ||
		attributes.rolcreatedb ||
		attributes.rolcreaterole ||
		attributes.rolinherit ||
		!attributes.rolcanlogin
	) {
		throw new Error('The existing UrbanLedger runtime database role has unsafe attributes.')
	}

	await client.query(`
		DO $role$
		BEGIN
			EXECUTE format(
				'ALTER ROLE urbanledger_app PASSWORD %L',
				current_setting('urbanledger.runtime_password')
			);
		END
		$role$;
	`)
}
await client.query('GRANT CONNECT ON DATABASE postgres TO urbanledger_app')
await client.end()

const migration = spawnSync('pnpm', ['db:deploy'], {
	stdio: 'inherit',
	env: { ...process.env, ...values }
})

if (migration.error) {
	throw migration.error
}

if (migration.status !== 0) {
	process.exit(migration.status ?? 1)
}

const generation = spawnSync('pnpm', ['db:generate'], { stdio: 'inherit' })

if (generation.error) {
	throw generation.error
}

process.exit(generation.status ?? 0)
