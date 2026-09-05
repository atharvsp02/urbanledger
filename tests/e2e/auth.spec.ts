import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import pg from 'pg'

const seededContactId = '20000000-0000-4000-8000-000000000001'

function requiredEnvironment(name: string) {
	const value = process.env[name]

	if (!value) {
		throw new Error(`${name} is required. Start and seed the local environment first.`)
	}

	return value
}

async function assertLocalServicesReady(request: APIRequestContext) {
	const response = await request.get('/api/readiness')
	expect(response.status(), await response.text()).toBe(200)
}

async function login(page: Page, loginId: string, passwordEnvironmentName: string) {
	await page.goto('/login')
	await page.getByLabel('Login ID').fill(loginId)
	await page.getByLabel('Password').fill(requiredEnvironment(passwordEnvironmentName))
	await page.getByRole('button', { name: 'Sign in' }).click()
}

async function deleteSignupFixture(email: string, loginId: string, operationKey: string) {
	const database = new pg.Client({ connectionString: requiredEnvironment('DATABASE_URL') })
	await database.connect()

	try {
		await database.query('BEGIN')
		await database.query(
			`DELETE FROM app.staff_grants
			 WHERE "userId" IN (
				SELECT id FROM app.application_users
				WHERE "normalizedEmail" = $1 OR "normalizedLoginId" = $2
			 )`,
			[email, loginId]
		)
		await database.query(
			`DELETE FROM app.application_users
			 WHERE "normalizedEmail" = $1 OR "normalizedLoginId" = $2`,
			[email, loginId]
		)
		await database.query('DELETE FROM app.provisioning_operations WHERE "operationKey" = $1', [
			operationKey
		])
		await database.query('COMMIT')
	} catch (error) {
		await database.query('ROLLBACK')
		throw error
	} finally {
		await database.end()
	}

	const admin = createClient(
		requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
		requiredEnvironment('SUPABASE_SECRET_KEY'),
		{ auth: { autoRefreshToken: false, persistSession: false } }
	)

	for (let page = 1; ; page += 1) {
		const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })

		if (error) {
			throw error
		}

		const user = data.users.find(
			(candidate) =>
				candidate.email?.toLowerCase() === email &&
				candidate.user_metadata.provisioningOperationKey === operationKey
		)

		if (user) {
			const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)

			if (deleteError) {
				throw deleteError
			}

			return
		}

		if (data.users.length < 100) {
			return
		}
	}
}

test.describe('authentication and access control', () => {
	test.describe.configure({ mode: 'serial' })

	test.beforeAll(async ({ request }) => {
		await assertLocalServicesReady(request)
	})

	test('requires authentication for staff routes', async ({ page }) => {
		await page.goto('/dashboard')
		await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/)
		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

		const session = await page.request.get('/api/auth/session')
		expect(session.status()).toBe(401)
	})

	test('rejects invalid credentials without revealing the account', async ({ page }) => {
		await page.goto('/login')
		await page.getByLabel('Login ID').fill('unknown')
		await page.getByLabel('Password').fill('Incorrect#1')
		await page.getByRole('button', { name: 'Sign in' }).click()

		await expect(page.getByText('Incorrect Login ID or password.', { exact: true })).toBeVisible()
	})

	test('signs an Admin in and out', async ({ page }) => {
		await login(page, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')
		await expect(page).toHaveURL('/dashboard')
		await expect(page.getByRole('heading', { name: 'Welcome, Riya Sharma' })).toBeVisible()

		const session = await page.request.get('/api/auth/session')
		expect(session.status()).toBe(200)
		expect(await session.json()).toMatchObject({
			ok: true,
			data: { role: 'ADMIN', contactId: null, displayName: 'Riya Sharma' }
		})

		await page.getByRole('button', { name: 'Sign out' }).click()
		await expect(page).toHaveURL('/login')
		await page.goto('/dashboard')
		await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/)
	})

	test('enforces explicit Contact portal ownership', async ({ page }) => {
		await login(page, 'ulcust', 'URBANLEDGER_SEED_CUSTOMER_PASSWORD')
		await expect(page).toHaveURL('/portal')
		await expect(page.getByRole('heading', { name: 'Welcome, Aarav Mehta' })).toBeVisible()

		const session = await page.request.get('/api/auth/session')
		expect(await session.json()).toMatchObject({
			ok: true,
			data: { role: 'CONTACT', contactId: seededContactId, displayName: 'Aarav Mehta' }
		})

		await page.goto('/dashboard')
		await expect(page).toHaveURL('/portal')
	})

	test('keeps Accountant access out of the Contact portal', async ({ page }) => {
		await login(page, 'ulacct', 'URBANLEDGER_SEED_ACCOUNTANT_PASSWORD')
		await expect(page).toHaveURL('/dashboard')
		await page.goto('/portal')
		await expect(page).toHaveURL('/dashboard')
	})

	test('validates public Accountant signup on the server', async ({ page }) => {
		await page.goto('/signup')
		await page.getByLabel('Name').fill('Test Accountant')
		await page.getByLabel('Login ID').fill('testacct')
		await page.getByLabel('Email').fill('invalid-password@urbanledger.test')
		await page.getByLabel('Password', { exact: true }).fill('lowercase!')
		await page.getByLabel('Confirm password').fill('lowercase!')
		await page.getByRole('button', { name: 'Sign up' }).click()

		await expect(page.getByText('Password must contain an uppercase letter.')).toBeVisible()
	})

	test('creates public signup as Accountant only', async ({ page }) => {
		const suffix = randomUUID().replaceAll('-', '').slice(0, 8)
		const loginId = `acct${suffix}`
		const email = `${suffix}@signup.urbanledger.test`
		let operationKey = ''

		try {
			await page.goto('/signup')
			operationKey = await page.locator('input[name="operationKey"]').inputValue()
			await page.getByLabel('Name').fill('Signup Accountant')
			await page.getByLabel('Login ID').fill(loginId)
			await page.getByLabel('Email').fill(email)
			await page.getByLabel('Password', { exact: true }).fill('Signup#123')
			await page.getByLabel('Confirm password').fill('Signup#123')
			await page.getByRole('button', { name: 'Sign up' }).click()

			await expect(page.getByRole('status')).toContainText(`Account created for ${loginId}`)

			const database = new pg.Client({ connectionString: requiredEnvironment('DATABASE_URL') })
			await database.connect()

			try {
				const access = await database.query(
					`SELECT sg.role, pa.id AS "portalAccessId"
					 FROM app.application_users au
					 LEFT JOIN app.staff_grants sg ON sg."userId" = au.id AND sg."revokedAt" IS NULL
					 LEFT JOIN app.portal_access pa ON pa."userId" = au.id AND pa.status = 'ACTIVE'
					 WHERE au."normalizedLoginId" = $1`,
					[loginId]
				)

				expect(access.rows).toEqual([{ role: 'ACCOUNTANT', portalAccessId: null }])
			} finally {
				await database.end()
			}
		} finally {
			if (operationKey) {
				await deleteSignupFixture(email, loginId, operationKey)
			}
		}
	})
})
