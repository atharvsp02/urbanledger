import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { config as loadEnvironment } from 'dotenv'
import { Client } from 'pg'
import { Prisma } from '../../src/generated/prisma/client'
import type { Actor } from '../../src/lib/contracts/access'
import type { ActionResult, ApplicationErrorCode } from '../../src/lib/contracts/errors'
import { capabilitiesByRole } from '../../src/server/access/permissions'
import { getPrisma } from '../../src/server/db/prisma'
import {
	cancelDraftVendorBill,
	cancelPurchaseOrder,
	confirmPurchaseOrder,
	createPurchaseOrder,
	createVendorBillFromPurchaseOrder,
	getInventoryPositions,
	getPurchaseReceipt,
	getVendorBill,
	listPurchaseReceipts,
	listVendorBills,
	postVendorBill,
	receivePurchaseOrder,
	updateDraftVendorBill
} from '../../src/server/purchasing'

loadEnvironment({ path: '.env.local', quiet: true })

const ids = {
	business: 'b0000000-0000-4000-8000-000000000001',
	user: 'b1000000-0000-4000-8000-000000000001',
	providerUser: 'b1000000-0000-4000-8000-000000000101',
	grant: 'b2000000-0000-4000-8000-000000000001',
	category: 'b3000000-0000-4000-8000-000000000001',
	vendor: 'b4000000-0000-4000-8000-000000000001',
	goods: 'b5000000-0000-4000-8000-000000000001',
	service: 'b5000000-0000-4000-8000-000000000002',
	expense: 'b6000000-0000-4000-8000-000000000001',
	payable: 'b6000000-0000-4000-8000-000000000002',
	inputTax: 'b6000000-0000-4000-8000-000000000003',
	purchaseJournal: 'b7000000-0000-4000-8000-000000000001',
	purchaseTax: 'b8000000-0000-4000-8000-000000000001',
	salesTax: 'b8000000-0000-4000-8000-000000000002',
	expenseAnalytic: 'b9000000-0000-4000-8000-000000000001',
	incomeAnalytic: 'b9000000-0000-4000-8000-000000000002'
} as const

const actor: Actor = {
	userId: ids.user,
	providerUserId: ids.providerUser,
	businessId: ids.business,
	role: 'ACCOUNTANT',
	contactId: null,
	displayName: 'Purchase Workflow User',
	capabilities: capabilitiesByRole.ACCOUNTANT
}

const contactActor: Actor = {
	...actor,
	role: 'CONTACT',
	contactId: ids.vendor,
	capabilities: capabilitiesByRole.CONTACT
}

function expectFailure<T>(result: ActionResult<T>, code: ApplicationErrorCode) {
	assert.equal(result.ok, false)
	if (result.ok) assert.fail(`Expected ${code}.`)
	assert.equal(result.error.code, code)
}

function expectSuccess<T>(result: ActionResult<T>) {
	if (!result.ok) assert.fail(`${result.error.code}: ${result.error.message}`)
	return result.data
}

async function cleanupFixtureData() {
	const connectionString = process.env.DIRECT_URL
	assert.ok(connectionString, 'DIRECT_URL is required for purchase workflow test cleanup.')
	const client = new Client({ connectionString })
	await client.connect()

	try {
		await client.query('BEGIN')
		for (const statement of [
			'ALTER TABLE app.financial_document_lines DISABLE TRIGGER protect_financial_document_lines',
			'ALTER TABLE app.financial_documents DISABLE TRIGGER protect_financial_documents',
			'ALTER TABLE app.inventory_movements DISABLE TRIGGER protect_inventory_movements',
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
			slug: 'purchase-workflow-test',
			name: 'Purchase Workflow Test',
			readyAt: new Date()
		}
	})
	await database.applicationUser.create({
		data: {
			id: ids.user,
			providerUserId: ids.providerUser,
			loginId: 'pwtest1',
			normalizedLoginId: 'pwtest1',
			normalizedEmail: 'purchase-workflow@urbanledger.test',
			displayName: actor.displayName,
			status: 'ACTIVE'
		}
	})
	await database.staffGrant.create({
		data: { id: ids.grant, userId: ids.user, businessId: ids.business, role: 'ACCOUNTANT' }
	})
	await database.contact.create({
		data: { id: ids.vendor, businessId: ids.business, kind: 'VENDOR', name: 'Workflow Vendor' }
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
				salesPrice: '150.0000',
				purchaseCost: '100.0000'
			},
			{
				id: ids.service,
				businessId: ids.business,
				categoryId: ids.category,
				name: 'Workflow Service',
				kind: 'SERVICE',
				salesPrice: '75.0000',
				purchaseCost: '50.0000'
			}
		]
	})
	await database.ledgerAccount.createMany({
		data: [
			{
				id: ids.expense,
				businessId: ids.business,
				code: '5000',
				name: 'Purchase Expense',
				type: 'EXPENSE'
			},
			{
				id: ids.payable,
				businessId: ids.business,
				code: '2000',
				name: 'Payable',
				type: 'LIABILITY',
				subtype: 'PAYABLE'
			},
			{
				id: ids.inputTax,
				businessId: ids.business,
				code: '1200',
				name: 'Input Tax',
				type: 'ASSET',
				subtype: 'INPUT_TAX'
			}
		]
	})
	await database.journal.create({
		data: {
			id: ids.purchaseJournal,
			businessId: ids.business,
			code: 'PUR',
			name: 'Purchases',
			type: 'PURCHASE',
			defaultExpenseAccountId: ids.expense,
			defaultControlAccountId: ids.payable
		}
	})
	await database.tax.createMany({
		data: [
			{
				id: ids.purchaseTax,
				businessId: ids.business,
				name: 'Purchase 18%',
				rate: '18.0000',
				scope: 'PURCHASE',
				inputAccountId: ids.inputTax
			},
			{
				id: ids.salesTax,
				businessId: ids.business,
				name: 'Sales 18%',
				rate: '18.0000',
				scope: 'SALES',
				inputAccountId: ids.inputTax
			}
		]
	})
	await database.analyticAccount.createMany({
		data: [
			{ id: ids.expenseAnalytic, businessId: ids.business, name: 'Procurement', type: 'EXPENSE' },
			{ id: ids.incomeAnalytic, businessId: ids.business, name: 'Sales Team', type: 'INCOME' }
		]
	})
}

async function createOrder(state: 'DRAFT' | 'CONFIRMED' = 'CONFIRMED') {
	const created = expectSuccess(
		await createPurchaseOrder(actor, {
			operationKey: randomUUID(),
			vendorId: ids.vendor,
			orderDate: '2026-09-05',
			lines: [
				{ productId: ids.goods, quantity: '2', unitPrice: '100' },
				{ productId: ids.service, quantity: '1', unitPrice: '50' }
			]
		})
	)

	if (state === 'DRAFT') return created
	return expectSuccess(
		await confirmPurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: created.id,
			expectedRevision: created.revision
		})
	)
}

before(async () => {
	await cleanupFixtureData()
	await createFixtureData()
})

after(async () => {
	await cleanupFixtureData()
	await getPrisma().$disconnect()
})

test('receipt records stock movement and accepts service without a ledger entry', async () => {
	const order = await createOrder()
	const operationKey = randomUUID()
	const receipt = expectSuccess(
		await receivePurchaseOrder(actor, {
			operationKey,
			purchaseOrderId: order.id,
			expectedRevision: order.revision,
			receiptDate: '2026-09-06'
		})
	)

	assert.match(receipt.receiptNumber, /^PR\/2026\/\d{6}$/)
	assert.equal(receipt.lines.length, 2)
	assert.ok(receipt.lines.find((line) => line.productKind === 'GOODS')?.inventoryMovementId)
	assert.equal(
		receipt.lines.find((line) => line.productKind === 'SERVICE')?.inventoryMovementId,
		null
	)
	assert.equal(
		await getPrisma().inventoryMovement.count({ where: { businessId: ids.business } }),
		1
	)
	assert.equal(await getPrisma().journalEntry.count({ where: { businessId: ids.business } }), 0)

	const repeated = expectSuccess(
		await receivePurchaseOrder(actor, {
			operationKey,
			purchaseOrderId: order.id,
			expectedRevision: order.revision,
			receiptDate: '2026-09-06'
		})
	)
	assert.equal(repeated.id, receipt.id)
	assert.equal(expectSuccess(await listPurchaseReceipts(actor)).totalCount, 1)
	assert.equal(
		expectSuccess(await getPurchaseReceipt(actor, { purchaseReceiptId: receipt.id })).id,
		receipt.id
	)
	const inventory = expectSuccess(await getInventoryPositions(actor))
	assert.deepEqual(inventory.rows, [
		{
			productId: ids.goods,
			productName: 'Workflow Goods',
			productKind: 'GOODS',
			quantityOnHand: '2.0000'
		}
	])

	expectFailure(
		await receivePurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: order.id,
			expectedRevision: order.revision + 1,
			receiptDate: '2026-09-06'
		}),
		'INVALID_STATE'
	)
})

test('Vendor Bill posts exact expense, Input Tax and Payable entries idempotently', async () => {
	const order = await createOrder()
	expectSuccess(
		await receivePurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: order.id,
			expectedRevision: order.revision,
			receiptDate: '2026-09-06'
		})
	)
	const createKey = randomUUID()
	const draft = expectSuccess(
		await createVendorBillFromPurchaseOrder(actor, {
			operationKey: createKey,
			purchaseOrderId: order.id,
			expectedPurchaseOrderRevision: order.revision + 1,
			billDate: '2026-09-07',
			dueDate: '2026-09-30',
			vendorReference: 'VENDOR-42'
		})
	)
	const repeatedDraft = expectSuccess(
		await createVendorBillFromPurchaseOrder(actor, {
			operationKey: createKey,
			purchaseOrderId: order.id,
			expectedPurchaseOrderRevision: order.revision + 1,
			billDate: '2026-09-07',
			dueDate: '2026-09-30',
			vendorReference: 'VENDOR-42'
		})
	)
	assert.equal(repeatedDraft.id, draft.id)

	expectFailure(
		await updateDraftVendorBill(actor, {
			vendorBillId: draft.id,
			expectedRevision: draft.revision,
			billDate: draft.billDate,
			dueDate: draft.dueDate,
			vendorReference: draft.vendorReference,
			lines: draft.lines.map((line) => ({
				lineId: line.id,
				taxId: ids.salesTax,
				analyticAccountId: null
			}))
		}),
		'INVALID_STATE'
	)
	expectFailure(
		await updateDraftVendorBill(actor, {
			vendorBillId: draft.id,
			expectedRevision: draft.revision,
			billDate: draft.billDate,
			dueDate: draft.dueDate,
			vendorReference: draft.vendorReference,
			lines: draft.lines.map((line) => ({
				lineId: line.id,
				taxId: null,
				analyticAccountId: ids.incomeAnalytic
			}))
		}),
		'INVALID_STATE'
	)

	const updated = expectSuccess(
		await updateDraftVendorBill(actor, {
			vendorBillId: draft.id,
			expectedRevision: draft.revision,
			billDate: draft.billDate,
			dueDate: draft.dueDate,
			vendorReference: draft.vendorReference,
			lines: draft.lines.map((line) => ({
				lineId: line.id,
				taxId: ids.purchaseTax,
				analyticAccountId: ids.expenseAnalytic
			}))
		})
	)
	assert.equal(updated.netTotal, '250.00')
	assert.equal(updated.taxTotal, '45.00')
	assert.equal(updated.total, '295.00')

	const postKey = randomUUID()
	const posted = expectSuccess(
		await postVendorBill(actor, {
			operationKey: postKey,
			vendorBillId: updated.id,
			expectedRevision: updated.revision,
			journalId: ids.purchaseJournal
		})
	)
	const repeatedPosting = expectSuccess(
		await postVendorBill(actor, {
			operationKey: postKey,
			vendorBillId: updated.id,
			expectedRevision: updated.revision,
			journalId: ids.purchaseJournal
		})
	)
	assert.equal(repeatedPosting.journalEntry?.id, posted.journalEntry?.id)
	assert.equal(posted.state, 'POSTED')
	assert.ok(posted.journalEntry)

	const entry = await getPrisma().journalEntry.findUniqueOrThrow({
		where: { id: posted.journalEntry!.id },
		include: { items: true }
	})
	assert.equal(entry.state, 'POSTED')
	assert.equal(entry.source, 'VENDOR_BILL')
	assert.equal(entry.sourceReference, posted.id)
	assert.equal(
		entry.items.every((item) => item.contactId === ids.vendor),
		true
	)
	assert.equal(
		entry.items
			.filter((item) => item.accountId === ids.expense)
			.reduce((sum, item) => sum.plus(item.debit), new Prisma.Decimal('0'))
			.toFixed(2),
		'250.00'
	)
	assert.equal(
		entry.items
			.filter((item) => item.accountId === ids.inputTax)
			.reduce((sum, item) => sum.plus(item.debit), new Prisma.Decimal('0'))
			.toFixed(2),
		'45.00'
	)
	assert.equal(
		entry.items
			.filter((item) => item.accountId === ids.payable)
			.reduce((sum, item) => sum.plus(item.credit), new Prisma.Decimal('0'))
			.toFixed(2),
		'295.00'
	)
	assert.equal(
		entry.items
			.filter((item) => item.accountId === ids.expense)
			.every((item) => item.analyticAccountId === ids.expenseAnalytic),
		true
	)
	assert.equal(await getPrisma().journalEntry.count({ where: { sourceReference: posted.id } }), 1)
	assert.equal(expectSuccess(await getVendorBill(actor, { vendorBillId: posted.id })).id, posted.id)
	assert.ok(expectSuccess(await listVendorBills(actor)).rows.some((bill) => bill.id === posted.id))

	expectFailure(
		await updateDraftVendorBill(actor, {
			vendorBillId: posted.id,
			expectedRevision: posted.revision,
			billDate: posted.billDate,
			dueDate: posted.dueDate,
			vendorReference: null,
			lines: posted.lines.map((line) => ({ lineId: line.id, taxId: null, analyticAccountId: null }))
		}),
		'INVALID_STATE'
	)
})

test('rejects invalid purchase states and Contact access', async () => {
	const draft = await createOrder('DRAFT')
	expectFailure(
		await receivePurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: draft.id,
			expectedRevision: draft.revision,
			receiptDate: '2026-09-06'
		}),
		'INVALID_STATE'
	)
	expectFailure(
		await receivePurchaseOrder(contactActor, {
			operationKey: randomUUID(),
			purchaseOrderId: draft.id,
			expectedRevision: draft.revision,
			receiptDate: '2026-09-06'
		}),
		'FORBIDDEN'
	)

	const cancelledSource = await createOrder('DRAFT')
	const cancelled = expectSuccess(
		await cancelPurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: cancelledSource.id,
			expectedRevision: cancelledSource.revision
		})
	)
	expectFailure(
		await receivePurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: cancelled.id,
			expectedRevision: cancelled.revision,
			receiptDate: '2026-09-06'
		}),
		'INVALID_STATE'
	)

	const unreceived = await createOrder()
	expectFailure(
		await createVendorBillFromPurchaseOrder(contactActor, {
			operationKey: randomUUID(),
			purchaseOrderId: unreceived.id,
			expectedPurchaseOrderRevision: unreceived.revision,
			billDate: '2026-09-07',
			dueDate: '2026-09-30'
		}),
		'FORBIDDEN'
	)
	expectFailure(
		await createVendorBillFromPurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: unreceived.id,
			expectedPurchaseOrderRevision: unreceived.revision,
			billDate: '2026-09-07',
			dueDate: '2026-09-30'
		}),
		'INVALID_STATE'
	)
})

test('cancelled draft Vendor Bill can be replaced without deleting history', async () => {
	const order = await createOrder()
	expectSuccess(
		await receivePurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: order.id,
			expectedRevision: order.revision,
			receiptDate: '2026-09-06'
		})
	)
	const first = expectSuccess(
		await createVendorBillFromPurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: order.id,
			expectedPurchaseOrderRevision: order.revision + 1,
			billDate: '2026-09-07',
			dueDate: '2026-09-30'
		})
	)
	expectFailure(
		await createVendorBillFromPurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: order.id,
			expectedPurchaseOrderRevision: order.revision + 2,
			billDate: '2026-09-07',
			dueDate: '2026-09-30'
		}),
		'INVALID_STATE'
	)
	const cancelled = expectSuccess(
		await cancelDraftVendorBill(actor, {
			operationKey: randomUUID(),
			vendorBillId: first.id,
			expectedRevision: first.revision
		})
	)
	const replacement = expectSuccess(
		await createVendorBillFromPurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: order.id,
			expectedPurchaseOrderRevision: order.revision + 2,
			billDate: '2026-09-08',
			dueDate: '2026-10-01'
		})
	)
	assert.equal(cancelled.state, 'CANCELLED')
	assert.notEqual(replacement.id, cancelled.id)
	assert.equal(await getPrisma().financialDocument.count({ where: { sourceOrderId: order.id } }), 2)
})
