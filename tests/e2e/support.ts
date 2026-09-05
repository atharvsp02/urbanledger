import { createClient } from '@supabase/supabase-js'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import pg from 'pg'

export const seededIds = {
	business: '10000000-0000-4000-8000-000000000001',
	customer: '20000000-0000-4000-8000-000000000001',
	secondCustomer: '20000000-0000-4000-8000-000000000003',
	category: '30000000-0000-4000-8000-000000000001',
	chair: '31000000-0000-4000-8000-000000000001'
}

export function requiredEnvironment(name: string) {
	const value = process.env[name]

	if (!value) {
		throw new Error(`${name} is required. Start and seed the local environment first.`)
	}

	return value
}

export async function assertLocalServicesReady(request: APIRequestContext) {
	const response = await request.get('/api/readiness')
	expect(response.status(), await response.text()).toBe(200)
}

export async function login(page: Page, loginId: string, passwordEnvironmentName: string) {
	await page.goto('/login')
	await page.getByLabel('Login ID').fill(loginId)
	await page.getByLabel('Password').fill(requiredEnvironment(passwordEnvironmentName))
	await page.getByRole('button', { name: 'Sign in' }).click()
	await page.waitForURL(/\/(dashboard|portal|access-denied)$/)
}

export async function withDatabase<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
	const client = new pg.Client({ connectionString: requiredEnvironment('DATABASE_URL') })
	await client.connect()

	try {
		return await run(client)
	} finally {
		await client.end()
	}
}

export function adminSupabase() {
	return createClient(
		requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
		requiredEnvironment('SUPABASE_SECRET_KEY'),
		{ auth: { autoRefreshToken: false, persistSession: false } }
	)
}

export async function deleteContactByName(name: string) {
	await withDatabase(async (client) => {
		await client.query(
			`DELETE FROM app.file_assets WHERE id IN (
				SELECT "imageAssetId" FROM app.contacts WHERE name = $1 AND "imageAssetId" IS NOT NULL
			)`,
			[name]
		)
		await client.query('DELETE FROM app.contacts WHERE name = $1', [name])
	})
}

export async function deleteProductByName(name: string) {
	await withDatabase((client) => client.query('DELETE FROM app.products WHERE name = $1', [name]))
}

export async function deleteCategoryByName(name: string) {
	await withDatabase((client) =>
		client.query('DELETE FROM app.product_categories WHERE name = $1', [name])
	)
}

export async function resetContactPortalAccess(contactId: string) {
	const emails = await withDatabase(async (client) => {
		const rows = await client.query<{ normalizedEmail: string }>(
			`SELECT au."normalizedEmail" FROM app.portal_access pa
			 JOIN app.application_users au ON au.id = pa."userId"
			 WHERE pa."contactId" = $1`,
			[contactId]
		)
		await client.query(
			`DELETE FROM app.application_users WHERE id IN (
				SELECT "userId" FROM app.portal_access WHERE "contactId" = $1
			)`,
			[contactId]
		)
		return rows.rows.map((row) => row.normalizedEmail)
	})

	if (emails.length === 0) return

	const admin = adminSupabase()
	const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 })

	for (const user of data?.users ?? []) {
		if (user.email && emails.includes(user.email.toLowerCase())) {
			await admin.auth.admin.deleteUser(user.id)
		}
	}
}

export async function deletePortalIdentity(loginId: string) {
	const normalized = loginId.toLowerCase()

	await withDatabase(async (client) => {
		await client.query(
			`DELETE FROM app.portal_access WHERE "userId" IN (
				SELECT id FROM app.application_users WHERE "normalizedLoginId" = $1
			)`,
			[normalized]
		)
		await client.query('DELETE FROM app.application_users WHERE "normalizedLoginId" = $1', [
			normalized
		])
		await client.query('DELETE FROM app.provisioning_operations WHERE "normalizedLoginId" = $1', [
			normalized
		])
	})

	const admin = adminSupabase()

	for (let page = 1; ; page += 1) {
		const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })

		if (error) throw error

		const user = data.users.find((candidate) =>
			candidate.email?.toLowerCase().startsWith(`${normalized}@`)
		)

		if (user) {
			await admin.auth.admin.deleteUser(user.id)
			return
		}

		if (data.users.length < 100) return
	}
}

// A server action reached directly, without the page that renders it: the
// hidden React fields carry the action identity, and everything else is
// ordinary form data.
export async function readServerActionFields(page: Page, pageUrl: string) {
	await page.goto(pageUrl)
	const actionFields: Record<string, string> = {}

	for (const name of ['$ACTION_REF_1', '$ACTION_1:0', '$ACTION_1:1', '$ACTION_KEY']) {
		const locator = page.locator(`input[name="${name}"]`).first()

		if ((await locator.count()) > 0) {
			actionFields[name] = await locator.inputValue()
		}
	}

	return actionFields
}

const PNG_PIXEL =
	'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR4nGP8//8/AzbAxIADjEqQTQIAdBEDA/8YfP4AAAAASUVORK5CYII='

export function pngFixture() {
	return { name: 'contact.png', mimeType: 'image/png', buffer: Buffer.from(PNG_PIXEL, 'base64') }
}

export function textFixture() {
	return {
		name: 'not-an-image.png',
		mimeType: 'image/png',
		buffer: Buffer.from('this is not an image', 'utf8')
	}
}
