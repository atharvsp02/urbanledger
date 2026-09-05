import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { config as loadEnvironment } from 'dotenv'
import { Client } from 'pg'
import { Prisma } from '../../src/generated/prisma/client'
import type { Actor } from '../../src/lib/contracts/access'
import type { ActionResult } from '../../src/lib/contracts/errors'
import { capabilitiesByRole } from '../../src/server/access/permissions'
import { getPrisma } from '../../src/server/db/prisma'
import {
	confirmPurchaseOrder,
	createPurchaseOrder,
	receivePurchaseOrder
} from '../../src/server/purchasing'
import {
	confirmSalesOrder,
	createCustomerInvoiceFromSalesOrder,
	createSalesOrder,
	deliverSalesOrder,
	listInventoryMovements,
	postCustomerInvoice
} from '../../src/server/sales'

loadEnvironment({ path: '.env.local', quiet: true })

const ids = {
	business: 'c0000000-0000-4000-8000-000000000001',
	user: 'c1000000-0000-4000-8000-000000000001',
	providerUser: 'c1000000-0000-4000-8000-000000000101',
	grant: 'c2000000-0000-4000-8000-000000000001',
	category: 'c3000000-0000-4000-8000-000000000001',
	customer: 'c4000000-0000-4000-8000-000000000001',
	vendor: 'c4000000-0000-4000-8000-000000000002',
	goods: 'c5000000-0000-4000-8000-000000000001',
	service: 'c5000000-0000-4000-8000-000000000002',
	receivable: 'c6000000-0000-4000-8000-000000000001',
	income: 'c6000000-0000-4000-8000-000000000002',
	outputTax: 'c6000000-0000-4000-8000-000000000003',
	salesJournal: 'c7000000-0000-4000-8000-000000000001',
	salesTax: 'c8000000-0000-4000-8000-000000000001',
	incomeAnalytic: 'c9000000-0000-4000-8000-000000000001'
} as const

const actor: Actor = {
	userId: ids.user,
	providerUserId: ids.providerUser,
	businessId: ids.business,
	role: 'ACCOUNTANT',
	contactId: null,
	displayName: 'Sales Workflow User',
	capabilities: capabilitiesByRole.ACCOUNTANT
}

function expectSuccess<T>(result: ActionResult<T>) {
	if (!result.ok) assert.fail(`${result.error.code}: ${result.error.message}`)
	return result.data
}

async function cleanupFixtureData() {
	const connectionString = process.env.DIRECT_URL
	assert.ok(connectionString, 'DIRECT_URL is required for sales workflow test cleanup.')
	const client = new Client({ connectionString })
	await client.connect()

	try {
		await client.query('BEGIN')
		for (const statement of [
			'ALTER TABLE app.financial_document_lines DISABLE TRIGGER protect_financial_document_lines',
			'ALTER TABLE app.financial_documents DISABLE TRIGGER protect_financial_documents',
			'ALTER TABLE app.inventory_movements DISABLE TRIGGER protect_inventory_movements',
			'ALTER TABLE app.sales_delivery_lines DISABLE TRIGGER protect_sales_delivery_lines',
			'ALTER TABLE app.sales_deliveries DISABLE TRIGGER protect_sales_deliveries',
			'ALTER TABLE app.purchase_receipt_lines DISABLE TRIGGER protect_purchase_receipt_lines',
			'ALTER TABLE app.purchase_receipts DISABLE TRIGGER protect_purchase_receipts',
			'ALTER TABLE app.order_lines DISABLE TRIGGER protect_frozen_order_lines',
			'ALTER TABLE app.orders DISABLE TRIGGER protect_frozen_orders',
			'ALTER TABLE app.journal_items DISABLE TRIGGER protect_posted_journal_items',
			'ALTER TABLE app.journal_entries DISABLE TRIGGER protect_posted_journal_entries'
		]) {
			await client.query(statement)
		}

		for (const table of ['command_operations', 'audit_events', 'document_sequences']) {
			await client.query(`DELETE FROM app.${table} WHERE "businessId" = $1::uuid`, [ids.business])
		}
		await client.query(
			'DELETE FROM app.financial_document_lines WHERE "documentId" IN (SELECT id FROM app.financial_documents WHERE "businessId" = $1::uuid)',
			[ids.business]
		)
		await client.query('DELETE FROM app.financial_documents WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query('DELETE FROM app.inventory_movements WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query(
			'DELETE FROM app.sales_delivery_lines WHERE "deliveryId" IN (SELECT id FROM app.sales_deliveries WHERE "businessId" = $1::uuid)',
			[ids.business]
		)
		await client.query('DELETE FROM app.sales_deliveries WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query(
			'DELETE FROM app.purchase_receipt_lines WHERE "receiptId" IN (SELECT id FROM app.purchase_receipts WHERE "businessId" = $1::uuid)',
			[ids.business]
		)
		await client.query('DELETE FROM app.purchase_receipts WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query(
			'DELETE FROM app.journal_items WHERE "entryId" IN (SELECT id FROM app.journal_entries WHERE "businessId" = $1::uuid)',
			[ids.business]
		)
		for (const table of [
			'journal_entries',
			'orders',
			'taxes',
			'journals',
			'analytic_accounts',
			'ledger_accounts',
			'staff_grants',
			'products',
			'product_categories',
			'contacts'
		]) {
			await client.query(`DELETE FROM app.${table} WHERE "businessId" = $1::uuid`, [ids.business])
		}
		await client.query('DELETE FROM app.application_users WHERE id = $1::uuid', [ids.user])
		await client.query('DELETE FROM app.businesses WHERE id = $1::uuid', [ids.business])
		await client.query('SET CONSTRAINTS ALL IMMEDIATE')

		for (const statement of [
			'ALTER TABLE app.financial_document_lines ENABLE TRIGGER protect_financial_document_lines',
			'ALTER TABLE app.financial_documents ENABLE TRIGGER protect_financial_documents',
			'ALTER TABLE app.inventory_movements ENABLE TRIGGER protect_inventory_movements',
			'ALTER TABLE app.sales_delivery_lines ENABLE TRIGGER protect_sales_delivery_lines',
			'ALTER TABLE app.sales_deliveries ENABLE TRIGGER protect_sales_deliveries',
			'ALTER TABLE app.purchase_receipt_lines ENABLE TRIGGER protect_purchase_receipt_lines',
			'ALTER TABLE app.purchase_receipts ENABLE TRIGGER protect_purchase_receipts',
			'ALTER TABLE app.order_lines ENABLE TRIGGER protect_frozen_order_lines',
			'ALTER TABLE app.orders ENABLE TRIGGER protect_frozen_orders',
			'ALTER TABLE app.journal_items ENABLE TRIGGER protect_posted_journal_items',
			'ALTER TABLE app.journal_entries ENABLE TRIGGER protect_posted_journal_entries'
		]) {
			await client.query(statement)
		}
		await client.query('COMMIT')
	} catch (error) {
		await client.query('ROLLBACK')
		throw error
	} finally {
		await client.end()
	}
}

async function createFixtureData() {
	const database = getPrisma()
	await database.business.create({
		data: {
			id: ids.business,
			slug: 'sales-workflow-test',
			name: 'Sales Workflow Test',
			readyAt: new Date()
		}
	})
	await database.applicationUser.create({
		data: {
			id: ids.user,
			providerUserId: ids.providerUser,
			loginId: 'sales1',
			normalizedLoginId: 'sales1',
			normalizedEmail: 'sales-workflow@urbanledger.test',
			displayName: actor.displayName,
			status: 'ACTIVE'
		}
	})
	await database.staffGrant.create({
		data: { id: ids.grant, userId: ids.user, businessId: ids.business, role: 'ACCOUNTANT' }
	})
	await database.contact.createMany({
		data: [
			{ id: ids.customer, businessId: ids.business, kind: 'CUSTOMER', name: 'Workflow Customer' },
			{ id: ids.vendor, businessId: ids.business, kind: 'VENDOR', name: 'Workflow Vendor' }
		]
	})
	await database.productCategory.create({
		data: { id: ids.category, businessId: ids.business, name: 'Workflow Products' }
	})
	await database.product.createMany({
		data: [
			{
				id: ids.goods,
				businessId: ids.business,
				categoryId: ids.category,
				name: 'Workflow Goods',
				kind: 'GOODS',
				salesPrice: '100.0000',
				purchaseCost: '60.0000'
			},
			{
				id: ids.service,
				businessId: ids.business,
				categoryId: ids.category,
				name: 'Workflow Service',
				kind: 'SERVICE',
				salesPrice: '50.0000',
				purchaseCost: '20.0000'
			}
		]
	})
	await database.ledgerAccount.createMany({
		data: [
			{
				id: ids.receivable,
				businessId: ids.business,
				code: '1100',
				name: 'Accounts Receivable',
				type: 'ASSET',
				subtype: 'RECEIVABLE'
			},
			{
				id: ids.income,
				businessId: ids.business,
				code: '4000',
				name: 'Sales Income',
				type: 'INCOME'
			},
			{
				id: ids.outputTax,
				businessId: ids.business,
				code: '2100',
				name: 'Output Tax',
				type: 'LIABILITY',
				subtype: 'OUTPUT_TAX'
			}
		]
	})
	await database.journal.create({
		data: {
			id: ids.salesJournal,
			businessId: ids.business,
			code: 'SAL',
			name: 'Sales',
			type: 'SALES',
			defaultIncomeAccountId: ids.income,
			defaultControlAccountId: ids.receivable
		}
	})
	await database.tax.create({
		data: {
			id: ids.salesTax,
			businessId: ids.business,
			name: 'Sales 18%',
			rate: '18.0000',
			scope: 'SALES',
			outputAccountId: ids.outputTax
		}
	})
	await database.analyticAccount.create({
		data: { id: ids.incomeAnalytic, businessId: ids.business, name: 'Sales Team', type: 'INCOME' }
	})
}

before(async () => {
	await cleanupFixtureData()
	await createFixtureData()
})

after(async () => {
	await cleanupFixtureData()
	await getPrisma().$disconnect()
})

test('delivery reduces stock and Customer Invoice posting balances exact ledger lines idempotently', async () => {
	const purchaseOrder = expectSuccess(
		await createPurchaseOrder(actor, {
			operationKey: randomUUID(),
			vendorId: ids.vendor,
			orderDate: '2026-09-01',
			lines: [{ productId: ids.goods, quantity: '10', unitPrice: '60' }]
		})
	)
	const confirmedPurchase = expectSuccess(
		await confirmPurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: purchaseOrder.id,
			expectedRevision: purchaseOrder.revision
		})
	)
	expectSuccess(
		await receivePurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: confirmedPurchase.id,
			expectedRevision: confirmedPurchase.revision,
			receiptDate: '2026-09-01'
		})
	)

	const salesOrder = expectSuccess(
		await createSalesOrder(actor, {
			operationKey: randomUUID(),
			customerId: ids.customer,
			orderDate: '2026-09-02',
			lines: [
				{
					productId: ids.goods,
					quantity: '3',
					unitPrice: '100',
					taxId: ids.salesTax,
					analyticAccountId: ids.incomeAnalytic
				},
				{
					productId: ids.service,
					quantity: '1',
					unitPrice: '50',
					taxId: ids.salesTax,
					analyticAccountId: ids.incomeAnalytic
				}
			]
		})
	)
	assert.equal(salesOrder.netTotal, '350.00')
	assert.equal(salesOrder.taxTotal, '63.00')
	assert.equal(salesOrder.total, '413.00')

	const confirmedSales = expectSuccess(
		await confirmSalesOrder(actor, {
			operationKey: randomUUID(),
			salesOrderId: salesOrder.id,
			expectedRevision: salesOrder.revision
		})
	)
	const deliveryKey = randomUUID()
	const deliveryInput = {
		operationKey: deliveryKey,
		salesOrderId: confirmedSales.id,
		expectedRevision: confirmedSales.revision,
		deliveryDate: '2026-09-03'
	}
	const delivery = expectSuccess(await deliverSalesOrder(actor, deliveryInput))
	const repeatedDelivery = expectSuccess(await deliverSalesOrder(actor, deliveryInput))
	assert.equal(repeatedDelivery.id, delivery.id)
	assert.ok(delivery.lines.find((line) => line.productKind === 'GOODS')?.inventoryMovementId)
	assert.equal(
		delivery.lines.find((line) => line.productKind === 'SERVICE')?.inventoryMovementId,
		null
	)
	assert.equal(await getPrisma().salesDelivery.count({ where: { businessId: ids.business } }), 1)
	assert.equal(
		await getPrisma().financialDocument.count({ where: { businessId: ids.business } }),
		0
	)
	assert.equal(await getPrisma().journalEntry.count({ where: { businessId: ids.business } }), 0)

	const movements = expectSuccess(await listInventoryMovements(actor, { productId: ids.goods }))
	assert.deepEqual(
		movements.rows.map((movement) => [movement.direction, movement.quantityChange]),
		[
			['OUT', '-3.0000'],
			['IN', '10.0000']
		]
	)
	const position = await getPrisma().inventoryMovement.aggregate({
		where: { businessId: ids.business, productId: ids.goods },
		_sum: { quantityDelta: true }
	})
	assert.equal(position._sum.quantityDelta?.toFixed(4), '7.0000')

	const invoiceKey = randomUUID()
	const invoiceInput = {
		operationKey: invoiceKey,
		salesOrderId: confirmedSales.id,
		expectedSalesOrderRevision: confirmedSales.revision + 1,
		invoiceDate: '2026-09-04',
		dueDate: '2026-09-30',
		reference: 'CUSTOMER-REF-42'
	}
	const invoice = expectSuccess(await createCustomerInvoiceFromSalesOrder(actor, invoiceInput))
	const repeatedInvoice = expectSuccess(
		await createCustomerInvoiceFromSalesOrder(actor, invoiceInput)
	)
	assert.equal(repeatedInvoice.id, invoice.id)
	assert.equal(invoice.total, '413.00')
	assert.equal(
		await getPrisma().financialDocument.count({ where: { businessId: ids.business } }),
		1
	)

	const postKey = randomUUID()
	const postInput = {
		operationKey: postKey,
		customerInvoiceId: invoice.id,
		expectedRevision: invoice.revision,
		journalId: ids.salesJournal
	}
	const posted = expectSuccess(await postCustomerInvoice(actor, postInput))
	const repeatedPosting = expectSuccess(await postCustomerInvoice(actor, postInput))
	assert.equal(repeatedPosting.journalEntry?.id, posted.journalEntry?.id)
	assert.equal(posted.state, 'POSTED')
	assert.ok(posted.journalEntry)

	const entry = await getPrisma().journalEntry.findUniqueOrThrow({
		where: { id: posted.journalEntry.id },
		include: { items: true }
	})
	assert.equal(entry.source, 'CUSTOMER_INVOICE')
	assert.equal(entry.sourceReference, posted.id)
	assert.equal(entry.state, 'POSTED')
	assert.equal(
		entry.items.reduce((sum, item) => sum.plus(item.debit), new Prisma.Decimal('0')).toFixed(2),
		'413.00'
	)
	assert.equal(
		entry.items.reduce((sum, item) => sum.plus(item.credit), new Prisma.Decimal('0')).toFixed(2),
		'413.00'
	)
	assert.equal(
		entry.items
			.filter((item) => item.accountId === ids.receivable)
			.reduce((sum, item) => sum.plus(item.debit), new Prisma.Decimal('0'))
			.toFixed(2),
		'413.00'
	)
	assert.equal(
		entry.items
			.filter((item) => item.accountId === ids.income)
			.reduce((sum, item) => sum.plus(item.credit), new Prisma.Decimal('0'))
			.toFixed(2),
		'350.00'
	)
	assert.equal(
		entry.items
			.filter((item) => item.accountId === ids.outputTax)
			.reduce((sum, item) => sum.plus(item.credit), new Prisma.Decimal('0'))
			.toFixed(2),
		'63.00'
	)
	assert.equal(
		entry.items
			.filter((item) => item.accountId === ids.income)
			.every((item) => item.analyticAccountId === ids.incomeAnalytic),
		true
	)
	assert.equal(
		entry.items.every((item) => item.contactId === ids.customer),
		true
	)
	assert.equal(await getPrisma().journalEntry.count({ where: { sourceReference: posted.id } }), 1)
})
