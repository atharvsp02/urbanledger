import { expect, test, type Page } from '@playwright/test'
import { assertLocalServicesReady, businessToday, login, seededIds } from './support'

const today = businessToday()
const documentUrl = /\/[0-9a-f-]{36}$/

// The portal payment settles the invoice this suite posts, so the sales flow
// runs before it and hands over the identifier it created.
let salesInvoiceId = ''

async function fillFirstLine(
	page: Page,
	line: { productId: string; quantity: string; unitPrice: string; analyticAccountId: string }
) {
	await page.locator('#order-lines-0-productId').selectOption(line.productId)
	await page.locator('#order-lines-0-quantity').fill(line.quantity)
	await page.locator('#order-lines-0-unitPrice').fill(line.unitPrice)
	await page.locator('#order-lines-0-taxId').selectOption(seededIds.tax)
	await page.locator('#order-lines-0-analyticAccountId').selectOption(line.analyticAccountId)
}

async function confirmInDialog(page: Page, triggerLabel: string, confirmLabel: string) {
	await page.getByRole('button', { name: triggerLabel, exact: true }).click()
	await page.getByRole('dialog').getByRole('button', { name: confirmLabel, exact: true }).click()
	await expect(page.getByRole('dialog')).toBeHidden()
}

test.describe('business workflows', () => {
	test.describe.configure({ mode: 'serial' })

	test.beforeAll(async ({ request }) => {
		await assertLocalServicesReady(request)
	})

	test('staff purchase flow reaches a posted bill and an outgoing payment', async ({ page }) => {
		await login(page, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')

		await page.goto('/purchases/orders/new')
		await page.getByLabel('Vendor').selectOption(seededIds.vendor)
		await page.getByLabel('Order date').fill(today)
		await fillFirstLine(page, {
			productId: seededIds.chair,
			quantity: '2',
			unitPrice: '4000',
			analyticAccountId: seededIds.expenseAnalytic
		})
		await page.getByRole('button', { name: 'Create purchase order' }).click()
		await page.waitForURL(documentUrl)

		await confirmInDialog(page, 'Confirm', 'Confirm order')
		await expect(page.getByText('This order is read-only.')).toBeVisible()

		await page.getByLabel('Receipt date').fill(today)
		await page.getByRole('button', { name: 'Record receipt' }).click()
		await page.waitForURL(/\/purchases\/receipts\/[0-9a-f-]{36}$/)

		await page.goBack()
		await page.getByLabel('Bill date').fill(today)
		await page.getByLabel('Due date').fill(today)
		await page.getByRole('button', { name: 'Generate vendor bill' }).click()
		await page.waitForURL(/\/purchases\/bills\/[0-9a-f-]{36}$/)

		await page.locator('#bill-journalId').selectOption(seededIds.purchaseJournal)
		await confirmInDialog(page, 'Post bill', 'Post bill')
		await expect(page.getByText('Posted to')).toBeVisible()

		await page.getByLabel('Journal').selectOption(seededIds.bankJournal)
		await page.getByLabel('Payment date').fill(today)
		await page.getByRole('button', { name: 'Record outgoing payment' }).click()
		await page.waitForURL(/\/payments\/[0-9a-f-]{36}$/)
		await expect(page.getByText('Outgoing')).toBeVisible()
	})

	test('staff sales flow reaches a posted invoice with a partial payment', async ({ page }) => {
		await login(page, 'ulacct', 'URBANLEDGER_SEED_ACCOUNTANT_PASSWORD')

		await page.goto('/sales/orders/new')
		await page.getByLabel('Customer').selectOption(seededIds.customer)
		await page.getByLabel('Order date').fill(today)
		await fillFirstLine(page, {
			productId: seededIds.chair,
			quantity: '2',
			unitPrice: '7500',
			analyticAccountId: seededIds.incomeAnalytic
		})
		await page.getByRole('button', { name: 'Create sales order' }).click()
		await page.waitForURL(documentUrl)

		await confirmInDialog(page, 'Confirm', 'Confirm order')

		await page.getByLabel('Delivery date').fill(today)
		await page.getByRole('button', { name: 'Record delivery' }).click()
		await page.waitForURL(/\/sales\/deliveries\/[0-9a-f-]{36}$/)

		await page.goBack()
		await page.getByLabel('Invoice date').fill(today)
		await page.getByLabel('Due date').fill(today)
		await page.getByRole('button', { name: 'Generate customer invoice' }).click()
		await page.waitForURL(/\/sales\/invoices\/[0-9a-f-]{36}$/)

		salesInvoiceId = new URL(page.url()).pathname.split('/').pop() ?? ''
		expect(salesInvoiceId).toHaveLength(36)

		await page.locator('#invoice-journalId').selectOption(seededIds.salesJournal)
		await confirmInDialog(page, 'Post invoice', 'Post invoice')
		await expect(page.getByText('Posted to')).toBeVisible()

		await page.getByLabel('Journal').selectOption(seededIds.bankJournal)
		await page.getByLabel('Payment date').fill(today)
		await page.getByLabel('Amount').fill('1000')
		await page.getByRole('button', { name: 'Record incoming payment' }).click()
		await page.waitForURL(/\/payments\/[0-9a-f-]{36}$/)

		await page.goto(`/sales/invoices/${salesInvoiceId}`)
		await expect(page.getByText('Partially paid')).toBeVisible()
	})

	test('customer portal settles the invoice and can read both documents', async ({ page }) => {
		expect(salesInvoiceId).toHaveLength(36)
		await login(page, 'ulcust', 'URBANLEDGER_SEED_CUSTOMER_PASSWORD')

		await page.goto(`/portal/invoices/${salesInvoiceId}`)
		await expect(page.getByRole('heading', { name: 'Pay this invoice' })).toBeVisible()
		await expect(page.getByText('This is a simulated payment.')).toBeVisible()

		await page.getByRole('button', { name: 'Pay', exact: true }).click()
		await expect(page.getByText('Payment successful.')).toBeVisible({ timeout: 30_000 })
		await expect(page.getByRole('link', { name: 'View receipt' })).toBeVisible()

		const invoicePdf = await page.request.get(`/api/invoices/${salesInvoiceId}/pdf`)
		expect(invoicePdf.status()).toBe(200)
		expect(invoicePdf.headers()['content-type']).toContain('application/pdf')

		await page.getByRole('link', { name: 'View receipt' }).click()
		await page.waitForURL(/\/portal\/payments\/[0-9a-f-]{36}$/)
		const paymentId = new URL(page.url()).pathname.split('/').pop() ?? ''

		const receiptPdf = await page.request.get(`/api/payments/${paymentId}/receipt.pdf`)
		expect(receiptPdf.status()).toBe(200)
		expect(receiptPdf.headers()['content-type']).toContain('application/pdf')

		await page.goto('/portal')
		await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible()
	})

	test('vendor portal sees only its own bills', async ({ page }) => {
		expect(salesInvoiceId).toHaveLength(36)
		await login(page, 'ulvend', 'URBANLEDGER_SEED_VENDOR_PASSWORD')

		await expect(page.getByRole('heading', { name: 'Bills' })).toBeVisible()
		await expect(page.getByRole('heading', { name: 'Invoices' })).toBeHidden()

		await page.goto(`/portal/invoices/${salesInvoiceId}`)
		await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()

		await page.goto('/payments')
		await expect(page).toHaveURL('/portal')
	})

	test('dashboard and reports drill down into their source screens', async ({ page }) => {
		await login(page, 'uladmin', 'URBANLEDGER_SEED_ADMIN_PASSWORD')

		await expect(page.getByRole('heading', { name: 'Revenue, expense and profit' })).toBeVisible()
		await expect(page.getByRole('heading', { name: 'Receivable aging' })).toBeVisible()

		await page.getByRole('link', { name: 'Balance sheet' }).first().click()
		await page.waitForURL(/\/reports\/balance-sheet/)
		await expect(page.getByRole('heading', { name: 'Balance sheet' })).toBeVisible()

		await page.goto('/reports/profit-loss')
		await expect(page.getByRole('heading', { name: 'Profit and loss' })).toBeVisible()

		await page.goto('/reports/budget')
		await expect(page.getByRole('heading', { name: 'Budget report' })).toBeVisible()

		await page.goto('/settings/audit')
		await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible()
	})
})
