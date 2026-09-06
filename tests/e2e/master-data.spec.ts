import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
	assertLocalServicesReady,
	deleteCategoryByName,
	deleteContactByName,
	deletePortalIdentity,
	deleteProductByName,
	resetContactPortalAccess,
	login,
	pngFixture,
	seededIds,
	readServerActionFields,
	textFixture,
	withDatabase
} from './support'

const suffix = randomUUID().slice(0, 8)
const contactName = `Playwright Contact ${suffix}`
const productName = `Playwright Product ${suffix}`
const categoryName = `Playwright Category ${suffix}`
const portalLoginId = `pwp${suffix.slice(0, 6)}`

test.describe('master data', () => {
	test.describe.configure({ mode: 'serial' })

	test.beforeAll(async ({ request }) => {
		await assertLocalServicesReady(request)
	})

	test.afterAll(async () => {
		await deleteContactByName(contactName)
		await deleteProductByName(productName)
		await deleteCategoryByName(categoryName)
		await deletePortalIdentity(portalLoginId)
		await resetContactPortalAccess(seededIds.secondCustomer)
	})

	test('redirects anonymous visitors away from workspace routes', async ({ page }) => {
		await page.goto('/contacts')
		await expect(page).toHaveURL(/\/login\?next=%2Fcontacts$/)

		await page.goto('/products/categories')
		await expect(page).toHaveURL(/\/login\?next=%2Fproducts%2Fcategories$/)
	})

	test('denies Contact users every internal master-data route', async ({ page }) => {
		await login(page, 'ulcust', 'URBANLEDGER_SEED_CUSTOMER_PASSWORD')

		for (const route of ['/contacts', '/products', '/products/categories', '/dashboard']) {
			await page.goto(route)
			await expect(page).toHaveURL('/portal')
		}
	})

	test('shows persisted contacts and products to an Admin', async ({ page }) => {
		await login(page, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')

		await page.goto('/contacts')
		await expect(page.getByRole('link', { name: 'Aarav Mehta' })).toBeVisible()

		await page.goto('/products')
		await expect(page.getByRole('link', { name: 'Ergonomic Office Chair' })).toBeVisible()
		await expect(page.getByRole('cell', { name: 'Furniture' }).first()).toBeVisible()
	})

	test('creates a contact that survives a reload', async ({ page }) => {
		await login(page, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')
		await page.goto('/contacts/new')
		await page.getByLabel('Contact name').fill(contactName)
		await page.getByLabel('Both').check()
		await page.getByLabel('Email').fill(`${suffix}@playwright.test`)
		await page.getByLabel('City').fill('Pune')
		await page.getByRole('button', { name: 'Create contact' }).click()

		await expect(page.getByRole('heading', { name: contactName, level: 1 })).toBeVisible()

		const stored = await withDatabase((client) =>
			client.query('SELECT kind, city, revision FROM app.contacts WHERE name = $1', [contactName])
		)
		expect(stored.rows).toEqual([{ kind: 'BOTH', city: 'Pune', revision: 1 }])

		await page.goto('/contacts?q=Playwright')
		await expect(page.getByRole('link', { name: contactName })).toBeVisible()
	})

	test('rejects a stale contact revision', async ({ page }) => {
		const staleName = `${contactName} stale`
		const created = await withDatabase((client) =>
			client.query<{ id: string }>(
				`INSERT INTO app.contacts ("businessId", kind, name, city, "updatedAt")
				 VALUES ($1, 'CUSTOMER', $2, 'Pune', now()) RETURNING id`,
				[seededIds.business, staleName]
			)
		)
		const contactId = created.rows[0].id

		try {
			await login(page, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')
			await page.goto(`/contacts/${contactId}/edit`)
			await withDatabase((client) =>
				client.query('UPDATE app.contacts SET revision = revision + 1 WHERE id = $1', [contactId])
			)

			await page.getByLabel('Contact name').fill(`${staleName} edited`)
			await page.getByRole('button', { name: 'Save changes' }).click()

			await expect(page.getByTestId('form-error-summary')).toContainText(
				'changed while you were editing'
			)

			const unchanged = await withDatabase((client) =>
				client.query('SELECT name FROM app.contacts WHERE id = $1', [contactId])
			)
			expect(unchanged.rows[0].name).toBe(staleName)
		} finally {
			await deleteContactByName(staleName)
		}
	})

	test('uploads, replaces and removes a contact image through private storage', async ({
		page
	}) => {
		await login(page, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')
		const contact = await withDatabase((client) =>
			client.query<{ id: string }>('SELECT id FROM app.contacts WHERE name = $1', [contactName])
		)
		const contactId = contact.rows[0].id
		await page.goto(`/contacts/${contactId}`)

		await page.locator('input[name="image"]').setInputFiles(textFixture())
		await expect(page.getByText('Use a JPEG, PNG or WebP image.')).toBeVisible()

		await page.locator('input[name="image"]').setInputFiles(pngFixture())
		const image = page.getByRole('img', { name: `${contactName} profile image` })
		await expect(image).toBeVisible()
		// The upload shows a local preview while it runs, so the stored asset is
		// only readable once the server confirms the replacement.
		await expect(page.getByText('Photo updated.')).toBeVisible()

		const storedAsset = await withDatabase((client) =>
			client.query<{ storageKey: string; mimeType: string; width: number }>(
				`SELECT fa."storageKey", fa."mimeType", fa.width
				 FROM app.contacts c JOIN app.file_assets fa ON fa.id = c."imageAssetId"
				 WHERE c.id = $1`,
				[contactId]
			)
		)
		expect(storedAsset.rows[0]).toMatchObject({ mimeType: 'image/png', width: 4 })
		expect(storedAsset.rows[0].storageKey.startsWith(`${seededIds.business}/contacts/`)).toBe(true)

		const signedUrl = await image.getAttribute('src')
		const publicAttempt = await page.request.get(
			`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/contact-images/${storedAsset.rows[0].storageKey}`
		)
		expect(publicAttempt.ok()).toBe(false)
		expect(signedUrl).toContain('token=')

		await page.getByRole('button', { name: 'Remove' }).click()
		await expect(page.getByRole('img', { name: `${contactName} profile image` })).toHaveCount(0)

		const cleared = await withDatabase((client) =>
			client.query('SELECT "imageAssetId" FROM app.contacts WHERE id = $1', [contactId])
		)
		expect(cleared.rows[0].imageAssetId).toBeNull()
	})

	test('provisions contact portal access, retries and reports collisions', async ({ page }) => {
		await resetContactPortalAccess(seededIds.secondCustomer)
		await login(page, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')
		await page.goto(`/contacts/${seededIds.secondCustomer}`)

		await page.getByLabel('Login ID').fill('uladmin')
		await page.getByLabel('Identity email').fill(`${portalLoginId}@playwright.test`)
		await page.getByLabel('Initial password').fill('Portal#12345')
		await page.getByLabel('Confirm password').fill('Portal#12345')
		await page.getByRole('button', { name: 'Enable portal access' }).click()
		await expect(page.getByTestId('form-error-summary')).toContainText('already in use')

		await page.reload()
		await page.getByLabel('Login ID').fill(portalLoginId)
		await page.getByLabel('Identity email').fill(`${portalLoginId}@playwright.test`)
		await page.getByLabel('Initial password').fill('Portal#12345')
		await page.getByLabel('Confirm password').fill('Portal#12345')
		await page.getByRole('button', { name: 'Enable portal access' }).click()
		await expect(page.getByText(portalLoginId, { exact: false }).first()).toBeVisible()

		const access = await withDatabase((client) =>
			client.query(
				`SELECT pa.status, pa."contactId", po.state
				 FROM app.portal_access pa
				 JOIN app.application_users au ON au.id = pa."userId"
				 JOIN app.provisioning_operations po ON po."normalizedLoginId" = au."normalizedLoginId"
				 WHERE au."normalizedLoginId" = $1`,
				[portalLoginId]
			)
		)
		expect(access.rows).toEqual([
			{ status: 'ACTIVE', contactId: seededIds.secondCustomer, state: 'COMPLETED' }
		])

		await page.reload()
		await expect(page.getByText(portalLoginId, { exact: false }).first()).toBeVisible()
	})

	test('creates a category and uses it on a new product', async ({ page }) => {
		await login(page, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')
		await page.goto('/products/categories')
		await page.getByLabel('New category').fill(categoryName)
		await page.getByRole('button', { name: 'Add category' }).click()
		await expect(page.getByRole('cell', { name: categoryName })).toBeVisible()

		await page.goto('/products/new')
		await page.getByLabel('Product name').fill(productName)
		await page.getByLabel('Category').selectOption({ label: categoryName })
		await page.getByLabel('Sales price').fill('1999.50')
		await page.getByLabel('Purchase cost').fill('1200')
		await page.getByRole('button', { name: 'Create product' }).click()

		await expect(page.getByRole('heading', { name: productName, level: 1 })).toBeVisible()
		await expect(page.getByText('₹1,999.50')).toBeVisible()

		const stored = await withDatabase((client) =>
			client.query(
				`SELECT p."salesPrice"::text, pc.name AS category
				 FROM app.products p JOIN app.product_categories pc ON pc.id = p."categoryId"
				 WHERE p.name = $1`,
				[productName]
			)
		)
		expect(stored.rows[0]).toMatchObject({ salesPrice: '1999.5000', category: categoryName })
	})

	test('archives and restores a product as Admin only', async ({ page }) => {
		await login(page, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')
		const product = await withDatabase((client) =>
			client.query<{ id: string }>('SELECT id FROM app.products WHERE name = $1', [productName])
		)
		const productId = product.rows[0].id

		await page.goto(`/products/${productId}`)
		await page.getByRole('button', { name: 'Archive' }).click()
		await page.getByRole('button', { name: 'Archive product' }).click()
		await expect(page.getByText('Archived on')).toBeVisible()

		await page.goto('/products')
		await expect(page.getByRole('link', { name: productName })).toHaveCount(0)

		await page.goto('/products?archived=include')
		await expect(page.getByRole('link', { name: productName })).toBeVisible()

		await page.goto(`/products/${productId}`)
		await page.getByRole('button', { name: 'Restore' }).click()
		await page.getByRole('button', { name: 'Restore product' }).click()
		await expect(page.getByText('Active', { exact: true })).toBeVisible()
	})

	test('hides master updates from an Accountant and enforces it on the server', async ({
		page,
		browser
	}) => {
		await login(page, 'ulacct', 'URBANLEDGER_SEED_ACCOUNTANT_PASSWORD')
		await page.goto(`/products/${seededIds.chair}`)
		await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
		await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0)

		await page.goto(`/contacts/${seededIds.customer}`)
		await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0)

		const adminContext = await browser.newContext()
		const adminPage = await adminContext.newPage()
		await login(adminPage, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')
		const actionFields = await readServerActionFields(
			adminPage,
			`/products/${seededIds.chair}/edit`
		)
		await adminContext.close()

		const denied = await page.request.post(`/products/${seededIds.chair}/edit`, {
			multipart: {
				...actionFields,
				productId: seededIds.chair,
				revision: '1',
				name: 'Renamed by an unauthorized actor',
				kind: 'GOODS',
				categoryId: seededIds.category,
				sku: '',
				salesPrice: '1.00',
				purchaseCost: '1.00'
			}
		})
		expect(denied.status()).toBe(200)

		const unchanged = await withDatabase((client) =>
			client.query('SELECT name FROM app.products WHERE id = $1', [seededIds.chair])
		)
		expect(unchanged.rows[0].name).toBe('Ergonomic Office Chair')
	})

	test('filters, sorts and paginates from the URL', async ({ page }) => {
		await login(page, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')

		await page.goto('/contacts?kind=VENDOR')
		await expect(page.getByRole('link', { name: 'Narmada Timber Works' })).toBeVisible()
		await expect(page.getByRole('link', { name: 'Aarav Mehta' })).toHaveCount(0)

		await page.goto('/products?sort=salesPrice&dir=desc')
		const firstRow = page.getByRole('row').nth(1)
		await expect(firstRow).toContainText('Six Seat Dining Set')

		await page.goto('/products?page=99')
		await expect(page.getByText(/Page 1 of 1/)).toBeVisible()

		await page.goto('/contacts?q=definitely-no-match')
		await expect(page.getByText('No contacts match these filters')).toBeVisible()
	})

	test('supports mobile navigation, dialogs and sign out from the keyboard', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await login(page, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')
		await page.goto('/dashboard')

		await page.getByRole('button', { name: 'Open navigation' }).click()
		const navigation = page.getByRole('dialog', { name: 'Navigation' })
		await expect(navigation).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(navigation).toBeHidden()

		await page.getByRole('button', { name: 'Open navigation' }).click()
		await page
			.getByRole('dialog', { name: 'Navigation' })
			.getByRole('link', { name: 'Contacts' })
			.click()
		await expect(page).toHaveURL('/contacts')

		await page.goto(`/contacts/${seededIds.customer}`)
		await page.getByRole('button', { name: 'Archive' }).click()
		const confirmation = page.getByRole('dialog').filter({ hasText: 'Archive Aarav Mehta?' })
		await expect(confirmation).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(confirmation).toBeHidden()

		await page.getByRole('button', { name: 'Open navigation' }).click()
		await page
			.getByRole('dialog', { name: 'Navigation' })
			.getByRole('button', { name: 'Sign out' })
			.click()
		await expect(page).toHaveURL('/login')
	})
})
