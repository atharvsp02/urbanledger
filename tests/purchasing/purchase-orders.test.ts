import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { config as loadEnvironment } from 'dotenv'
import { Client } from 'pg'
import type { Actor } from '../../src/lib/contracts/access'
import type { ActionResult, ApplicationErrorCode } from '../../src/lib/contracts/errors'
import { capabilitiesByRole } from '../../src/server/access/permissions'
import { getPrisma } from '../../src/server/db/prisma'
import {
	cancelPurchaseOrder,
	confirmPurchaseOrder,
	createPurchaseOrder,
	getPurchaseOrder,
	listPurchaseOrders,
	updateDraftPurchaseOrder
} from '../../src/server/purchasing'

loadEnvironment({ path: '.env.local', quiet: true })

const ids = {
	business: 'a0000000-0000-4000-8000-000000000001',
	user: 'a1000000-0000-4000-8000-000000000001',
	providerUser: 'a1000000-0000-4000-8000-000000000101',
	grant: 'a2000000-0000-4000-8000-000000000001',
	category: 'a3000000-0000-4000-8000-000000000001',
	vendor: 'a4000000-0000-4000-8000-000000000001',
	productOne: 'a5000000-0000-4000-8000-000000000001',
	productTwo: 'a5000000-0000-4000-8000-000000000002'
} as const

const actor: Actor = {
	userId: ids.user,
	providerUserId: ids.providerUser,
	businessId: ids.business,
	role: 'ACCOUNTANT',
	contactId: null,
	displayName: 'Purchase Test User',
	capabilities: capabilitiesByRole.ACCOUNTANT
}

function expectFailure<T>(result: ActionResult<T>, code: ApplicationErrorCode) {
	assert.equal(result.ok, false)

	if (result.ok) {
		assert.fail(`Expected ${code}.`)
	}

	assert.equal(result.error.code, code)
}

function expectSuccess<T>(result: ActionResult<T>) {
	if (!result.ok) {
		assert.fail(`${result.error.code}: ${result.error.message}`)
	}

	return result.data
}

function purchaseInput(operationKey = randomUUID()) {
	return {
		operationKey,
		vendorId: ids.vendor,
		orderDate: '2026-09-05',
		lines: [
			{ productId: ids.productOne, quantity: '1.005', unitPrice: '10.005' },
			{ productId: ids.productTwo, quantity: '2', unitPrice: '0.335' }
		]
	}
}

async function cleanupFixtureData() {
	const connectionString = process.env.DIRECT_URL
	assert.ok(connectionString, 'DIRECT_URL is required for purchase order test cleanup.')

	const client = new Client({ connectionString })
	await client.connect()

	try {
		await client.query('BEGIN')
		await client.query('ALTER TABLE app.order_lines DISABLE TRIGGER protect_frozen_order_lines')
		await client.query('ALTER TABLE app.orders DISABLE TRIGGER protect_frozen_orders')
		await client.query('DELETE FROM app.command_operations WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query('DELETE FROM app.orders WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.document_sequences WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query('DELETE FROM app.staff_grants WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.products WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.product_categories WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query('DELETE FROM app.contacts WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.application_users WHERE id = $1::uuid', [ids.user])
		await client.query('DELETE FROM app.businesses WHERE id = $1::uuid', [ids.business])
		await client.query('ALTER TABLE app.order_lines ENABLE TRIGGER protect_frozen_order_lines')
		await client.query('ALTER TABLE app.orders ENABLE TRIGGER protect_frozen_orders')
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
			slug: 'purchase-order-test',
			name: 'Purchase Order Test',
			readyAt: new Date()
		}
	})
	await database.applicationUser.create({
		data: {
			id: ids.user,
			providerUserId: ids.providerUser,
			loginId: 'potest1',
			normalizedLoginId: 'potest1',
			normalizedEmail: 'purchase-order@urbanledger.test',
			displayName: actor.displayName,
			status: 'ACTIVE'
		}
	})
	await database.staffGrant.create({
		data: {
			id: ids.grant,
			userId: ids.user,
			businessId: ids.business,
			role: 'ACCOUNTANT'
		}
	})
	await database.productCategory.create({
		data: { id: ids.category, businessId: ids.business, name: 'Purchase Test Products' }
	})
	await database.contact.create({
		data: { id: ids.vendor, businessId: ids.business, kind: 'VENDOR', name: 'Test Vendor' }
	})
	await database.product.createMany({
		data: [
			{
				id: ids.productOne,
				businessId: ids.business,
				categoryId: ids.category,
				name: 'Desk',
				kind: 'GOODS',
				salesPrice: '20.0000',
				purchaseCost: '10.0050'
			},
			{
				id: ids.productTwo,
				businessId: ids.business,
				categoryId: ids.category,
				name: 'Chair',
				kind: 'GOODS',
				salesPrice: '1.0000',
				purchaseCost: '0.3350'
			}
		]
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

test('calculates canonical totals and repeats creation safely', async () => {
	const operationKey = randomUUID()
	const created = expectSuccess(await createPurchaseOrder(actor, purchaseInput(operationKey)))

	assert.equal(created.state, 'DRAFT')
	assert.equal(created.revision, 1)
	assert.equal(created.total, '10.73')
	assert.match(created.orderNumber, /^PO\/2026\/\d{6}$/)
	assert.deepEqual(
		created.lines.map((line) => ({
			position: line.position,
			quantity: line.quantity,
			unitPrice: line.unitPrice,
			lineTotal: line.lineTotal
		})),
		[
			{ position: 0, quantity: '1.0050', unitPrice: '10.0050', lineTotal: '10.06' },
			{ position: 1, quantity: '2.0000', unitPrice: '0.3350', lineTotal: '0.67' }
		]
	)

	const equivalentRetry = purchaseInput(operationKey)
	equivalentRetry.lines[0].quantity = '1.0050'
	equivalentRetry.lines[0].unitPrice = '10.0050'
	equivalentRetry.lines[1].quantity = '2.0'
	equivalentRetry.lines[1].unitPrice = '0.3350'
	const repeated = expectSuccess(await createPurchaseOrder(actor, equivalentRetry))
	assert.equal(repeated.id, created.id)
	assert.equal(await getPrisma().order.count({ where: { businessId: ids.business } }), 1)
	assert.equal(await getPrisma().journalEntry.count({ where: { businessId: ids.business } }), 0)

	const changedRetry = purchaseInput(operationKey)
	changedRetry.lines[0].quantity = '2'
	expectFailure(await createPurchaseOrder(actor, changedRetry), 'OPERATION_KEY_MISMATCH')

	const loaded = expectSuccess(await getPurchaseOrder(actor, { purchaseOrderId: created.id }))
	assert.equal(loaded.id, created.id)
	const listed = expectSuccess(await listPurchaseOrders(actor))
	assert.equal(listed.totalCount, 1)
	assert.equal(listed.rows[0]?.id, created.id)
})

test('protects revisions and freezes confirmed commercial lines', async () => {
	const created = expectSuccess(await createPurchaseOrder(actor, purchaseInput()))
	const updated = expectSuccess(
		await updateDraftPurchaseOrder(actor, {
			purchaseOrderId: created.id,
			expectedRevision: 1,
			vendorId: ids.vendor,
			orderDate: '2026-09-06',
			lines: [{ productId: ids.productOne, quantity: '3', unitPrice: '2.345' }]
		})
	)

	assert.equal(updated.revision, 2)
	assert.equal(updated.total, '7.04')
	assert.equal(updated.lines[0]?.lineTotal, '7.04')

	expectFailure(
		await updateDraftPurchaseOrder(actor, {
			purchaseOrderId: created.id,
			expectedRevision: 1,
			vendorId: ids.vendor,
			orderDate: '2026-09-06',
			lines: [{ productId: ids.productOne, quantity: '1', unitPrice: '1' }]
		}),
		'STALE_REVISION'
	)

	const confirmOperationKey = randomUUID()
	const confirmed = expectSuccess(
		await confirmPurchaseOrder(actor, {
			operationKey: confirmOperationKey,
			purchaseOrderId: created.id,
			expectedRevision: 2
		})
	)
	assert.equal(confirmed.state, 'CONFIRMED')
	assert.equal(confirmed.revision, 3)

	const repeatedConfirmation = expectSuccess(
		await confirmPurchaseOrder(actor, {
			operationKey: confirmOperationKey,
			purchaseOrderId: created.id,
			expectedRevision: 2
		})
	)
	assert.equal(repeatedConfirmation.revision, 3)

	expectFailure(
		await updateDraftPurchaseOrder(actor, {
			purchaseOrderId: created.id,
			expectedRevision: 3,
			vendorId: ids.vendor,
			orderDate: '2026-09-07',
			lines: [{ productId: ids.productTwo, quantity: '1', unitPrice: '1' }]
		}),
		'INVALID_STATE'
	)

	await assert.rejects(
		getPrisma().orderLine.update({
			where: { id: confirmed.lines[0]!.id },
			data: { quantity: '4.0000' }
		})
	)

	const cancelled = expectSuccess(
		await cancelPurchaseOrder(actor, {
			operationKey: randomUUID(),
			purchaseOrderId: created.id,
			expectedRevision: 3
		})
	)
	assert.equal(cancelled.state, 'CANCELLED')
	assert.equal(cancelled.revision, 4)
	assert.equal(await getPrisma().order.count({ where: { id: created.id } }), 1)
})
