import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { config as loadEnvironment } from 'dotenv'
import { Client } from 'pg'
import { Prisma } from '../../src/generated/prisma/client'
import type { Actor } from '../../src/lib/contracts/access'
import type { ActionResult } from '../../src/lib/contracts/errors'
import { capabilitiesByRole } from '../../src/server/access/permissions'
import { commitPostedJournalEntry } from '../../src/server/accounting/posting-kernel'
import { getPrisma } from '../../src/server/db/prisma'
import {
	getDocumentSettlement,
	recordCustomerPayment,
	reversePayment
} from '../../src/server/payments'

loadEnvironment({ path: '.env.local', quiet: true })

const ids = {
	business: 'd0000000-0000-4000-8000-000000000001',
	user: 'd1000000-0000-4000-8000-000000000001',
	provider: 'd1000000-0000-4000-8000-000000000101',
	grant: 'd2000000-0000-4000-8000-000000000001',
	contact: 'd3000000-0000-4000-8000-000000000001',
	order: 'd4000000-0000-4000-8000-000000000001',
	document: 'd5000000-0000-4000-8000-000000000001',
	receivable: 'd6000000-0000-4000-8000-000000000001',
	income: 'd6000000-0000-4000-8000-000000000002',
	bank: 'd6000000-0000-4000-8000-000000000003',
	salesJournal: 'd7000000-0000-4000-8000-000000000001',
	bankJournal: 'd7000000-0000-4000-8000-000000000002'
} as const

const actor: Actor = {
	userId: ids.user,
	providerUserId: ids.provider,
	businessId: ids.business,
	role: 'ACCOUNTANT',
	contactId: null,
	displayName: 'Payment Safety User',
	capabilities: capabilitiesByRole.ACCOUNTANT
}

function success<T>(result: ActionResult<T>) {
	if (!result.ok) assert.fail(`${result.error.code}: ${result.error.message}`)
	return result.data
}

async function cleanup() {
	const connectionString = process.env.DIRECT_URL
	assert.ok(connectionString)
	const client = new Client({ connectionString })
	await client.connect()
	try {
		await client.query('BEGIN')
		await client.query('SET LOCAL session_replication_role = replica')
		await client.query(
			'DELETE FROM app.allocation_reversals WHERE "allocationId" IN (SELECT pa.id FROM app.payment_allocations pa JOIN app.payments p ON p.id = pa."paymentId" WHERE p."businessId" = $1::uuid)',
			[ids.business]
		)
		await client.query(
			'DELETE FROM app.payment_allocations WHERE "paymentId" IN (SELECT id FROM app.payments WHERE "businessId" = $1::uuid)',
			[ids.business]
		)
		await client.query('DELETE FROM app.payments WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.financial_documents WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query('DELETE FROM app.journal_entries WHERE "businessId" = $1::uuid', [
			ids.business
		])
		for (const table of ['command_operations', 'audit_events', 'document_sequences']) {
			await client.query(`DELETE FROM app.${table} WHERE "businessId" = $1::uuid`, [ids.business])
		}
		await client.query('DELETE FROM app.orders WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.journals WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.ledger_accounts WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query('DELETE FROM app.contacts WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.staff_grants WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.application_users WHERE id = $1::uuid', [ids.user])
		await client.query('DELETE FROM app.businesses WHERE id = $1::uuid', [ids.business])
		await client.query('COMMIT')
	} catch (error) {
		await client.query('ROLLBACK')
		throw error
	} finally {
		await client.end()
	}
}

async function setup() {
	const database = getPrisma()
	await database.business.create({
		data: {
			id: ids.business,
			slug: 'payment-safety-test',
			name: 'Payment Safety Test',
			readyAt: new Date()
		}
	})
	await database.applicationUser.create({
		data: {
			id: ids.user,
			providerUserId: ids.provider,
			loginId: 'paytest',
			normalizedLoginId: 'paytest',
			normalizedEmail: 'payment-safety@urbanledger.test',
			displayName: actor.displayName,
			status: 'ACTIVE'
		}
	})
	await database.staffGrant.create({
		data: { id: ids.grant, userId: ids.user, businessId: ids.business, role: 'ACCOUNTANT' }
	})
	await database.contact.create({
		data: { id: ids.contact, businessId: ids.business, kind: 'CUSTOMER', name: 'Payment Customer' }
	})
	await database.ledgerAccount.createMany({
		data: [
			{
				id: ids.receivable,
				businessId: ids.business,
				code: '1100',
				name: 'Receivable',
				type: 'ASSET',
				subtype: 'RECEIVABLE'
			},
			{ id: ids.income, businessId: ids.business, code: '4000', name: 'Income', type: 'INCOME' },
			{
				id: ids.bank,
				businessId: ids.business,
				code: '1000',
				name: 'Bank',
				type: 'ASSET',
				subtype: 'BANK'
			}
		]
	})
	await database.journal.createMany({
		data: [
			{
				id: ids.salesJournal,
				businessId: ids.business,
				code: 'SAL',
				name: 'Sales',
				type: 'SALES',
				defaultIncomeAccountId: ids.income,
				defaultControlAccountId: ids.receivable
			},
			{
				id: ids.bankJournal,
				businessId: ids.business,
				code: 'BNK',
				name: 'Bank',
				type: 'BANK',
				defaultLiquidityAccountId: ids.bank
			}
		]
	})
	await database.order.create({
		data: {
			id: ids.order,
			businessId: ids.business,
			kind: 'SALES',
			contactId: ids.contact,
			number: 'SO-TEST-1',
			orderDate: new Date('2026-09-01T00:00:00.000Z'),
			state: 'CONFIRMED',
			netTotal: '100.00',
			taxTotal: '0.00',
			total: '100.00',
			createdById: ids.user
		}
	})
	await database.$transaction(async (transaction) => {
		const entry = await commitPostedJournalEntry(transaction, {
			businessId: ids.business,
			journalId: ids.salesJournal,
			postingDate: new Date('2026-09-01T00:00:00.000Z'),
			reference: 'JE-TEST-1',
			source: 'CUSTOMER_INVOICE',
			sourceReference: ids.document,
			createdById: ids.user,
			lines: [
				{
					accountId: ids.receivable,
					contactId: ids.contact,
					debit: new Prisma.Decimal('100'),
					credit: new Prisma.Decimal('0')
				},
				{
					accountId: ids.income,
					contactId: ids.contact,
					debit: new Prisma.Decimal('0'),
					credit: new Prisma.Decimal('100')
				}
			]
		})
		await transaction.financialDocument.create({
			data: {
				id: ids.document,
				businessId: ids.business,
				kind: 'CUSTOMER_INVOICE',
				contactId: ids.contact,
				sourceOrderId: ids.order,
				number: 'INV-TEST-1',
				documentDate: new Date('2026-09-01T00:00:00.000Z'),
				dueDate: new Date('2026-09-05T00:00:00.000Z'),
				contactNameSnapshot: 'Payment Customer',
				sourceOrderNumberSnapshot: 'SO-TEST-1',
				state: 'POSTED',
				netTotal: '100.00',
				taxTotal: '0.00',
				total: '100.00',
				journalEntryId: entry.entryId,
				createdById: ids.user
			}
		})
	})
}

before(async () => {
	await cleanup()
	await setup()
})

after(async () => {
	await cleanup()
	await getPrisma().$disconnect()
})

test('concurrent payments cannot overpay and reversal restores effective outstanding', async () => {
	const attempts = await Promise.all([
		recordCustomerPayment(actor, {
			operationKey: randomUUID(),
			documentId: ids.document,
			expectedDocumentRevision: 1,
			journalId: ids.bankJournal,
			paymentDate: '2026-09-04',
			amount: '70.00'
		}),
		recordCustomerPayment(actor, {
			operationKey: randomUUID(),
			documentId: ids.document,
			expectedDocumentRevision: 1,
			journalId: ids.bankJournal,
			paymentDate: '2026-09-04',
			amount: '70.00'
		})
	])
	const succeeded = attempts.filter((result) => result.ok)
	const failed = attempts.filter((result) => !result.ok)
	assert.equal(succeeded.length, 1)
	assert.equal(failed.length, 1)
	if (failed[0]?.ok === false) assert.equal(failed[0].error.code, 'INSUFFICIENT_OUTSTANDING')
	const payment = success(succeeded[0]!)
	assert.equal(await getPrisma().payment.count({ where: { businessId: ids.business } }), 1)

	const reversed = success(
		await reversePayment(actor, {
			operationKey: randomUUID(),
			paymentId: payment.id,
			expectedRevision: 1,
			reversalDate: '2026-09-05',
			reason: 'Concurrent payment safety verification'
		})
	)
	assert.equal(reversed.status, 'REVERSED')
	const beforeReversal = success(
		await getDocumentSettlement(actor, { documentId: ids.document, asOfDate: '2026-09-04' })
	)
	assert.equal(beforeReversal.outstandingAmount, '30.00')
	const afterReversal = success(
		await getDocumentSettlement(actor, { documentId: ids.document, asOfDate: '2026-09-05' })
	)
	assert.equal(afterReversal.outstandingAmount, '100.00')
})
