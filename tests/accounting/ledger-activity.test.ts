import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { config as loadEnvironment } from 'dotenv'
import { Client } from 'pg'
import type { Actor } from '../../src/lib/contracts/access'
import type { ActionResult } from '../../src/lib/contracts/errors'
import { capabilitiesByRole } from '../../src/server/access/permissions'
import {
	getAccountActivity,
	getJournalActivity,
	getJournalEntry,
	getTrialBalance,
	postOpeningJournal,
	reverseJournalEntry
} from '../../src/server/accounting'
import { getPrisma } from '../../src/server/db/prisma'

loadEnvironment({ path: '.env.local', quiet: true })

const ids = {
	business: 'b0000000-0000-4000-8000-000000000001',
	user: 'b1000000-0000-4000-8000-000000000001',
	providerUser: 'b1000000-0000-4000-8000-000000000101',
	grant: 'b2000000-0000-4000-8000-000000000001',
	cash: 'b3000000-0000-4000-8000-000000000001',
	capital: 'b3000000-0000-4000-8000-000000000002',
	journal: 'b4000000-0000-4000-8000-000000000001'
} as const

const actor: Actor = {
	userId: ids.user,
	providerUserId: ids.providerUser,
	businessId: ids.business,
	role: 'ACCOUNTANT',
	contactId: null,
	displayName: 'Ledger Activity User',
	capabilities: capabilitiesByRole.ACCOUNTANT
}

function expectSuccess<T>(result: ActionResult<T>) {
	if (!result.ok) assert.fail(`${result.error.code}: ${result.error.message}`)
	return result.data
}

async function cleanupFixtureData() {
	const connectionString = process.env.DIRECT_URL
	assert.ok(connectionString, 'DIRECT_URL is required for ledger activity test cleanup.')
	const client = new Client({ connectionString })
	await client.connect()

	try {
		await client.query('BEGIN')
		await client.query('ALTER TABLE app.journal_items DISABLE TRIGGER protect_posted_journal_items')
		await client.query(
			'ALTER TABLE app.journal_entries DISABLE TRIGGER protect_posted_journal_entries'
		)
		await client.query('DELETE FROM app.audit_events WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.command_operations WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query('DELETE FROM app.journal_entries WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query('DELETE FROM app.document_sequences WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query('DELETE FROM app.staff_grants WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.journals WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.ledger_accounts WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query('DELETE FROM app.application_users WHERE id = $1::uuid', [ids.user])
		await client.query('DELETE FROM app.businesses WHERE id = $1::uuid', [ids.business])
		await client.query('SET CONSTRAINTS ALL IMMEDIATE')
		await client.query('ALTER TABLE app.journal_items ENABLE TRIGGER protect_posted_journal_items')
		await client.query(
			'ALTER TABLE app.journal_entries ENABLE TRIGGER protect_posted_journal_entries'
		)
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
			slug: 'ledger-activity-test',
			name: 'Ledger Activity Test',
			readyAt: new Date()
		}
	})
	await database.applicationUser.create({
		data: {
			id: ids.user,
			providerUserId: ids.providerUser,
			loginId: 'ledger1',
			normalizedLoginId: 'ledger1',
			normalizedEmail: 'ledger-activity@urbanledger.test',
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
	await database.ledgerAccount.createMany({
		data: [
			{
				id: ids.cash,
				businessId: ids.business,
				code: '1000',
				name: 'Cash',
				type: 'ASSET',
				subtype: 'CASH'
			},
			{
				id: ids.capital,
				businessId: ids.business,
				code: '3000',
				name: 'Capital',
				type: 'CAPITAL',
				subtype: 'GENERAL'
			}
		]
	})
	await database.journal.create({
		data: {
			id: ids.journal,
			businessId: ids.business,
			code: 'OPN',
			name: 'Opening',
			type: 'OPENING'
		}
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

test('posted activity includes a later reversal at its effective date', async () => {
	const original = expectSuccess(
		await postOpeningJournal(actor, {
			operationKey: randomUUID(),
			journalId: ids.journal,
			postingDate: '2026-08-01',
			memo: 'Opening cash',
			lines: [
				{ accountId: ids.cash, debit: '100.00', credit: '0' },
				{ accountId: ids.capital, debit: '0', credit: '100.00' }
			]
		})
	)
	const reversal = expectSuccess(
		await reverseJournalEntry(actor, {
			operationKey: randomUUID(),
			entryId: original.entryId,
			postingDate: '2026-08-06',
			reason: 'Opening amount entered in error'
		})
	)

	const activity = expectSuccess(
		await getAccountActivity(actor, { accountId: ids.cash, pageSize: 20 })
	)
	assert.equal(activity.totalDebit, '100.00')
	assert.equal(activity.totalCredit, '100.00')
	assert.equal(activity.currentBalance, '0.00')
	assert.equal(activity.direction, 'ZERO')
	assert.deepEqual(
		activity.rows.map((row) => [row.entryId, row.postingDate, row.debit, row.credit]),
		[
			[reversal.entryId, '2026-08-06', '0.00', '100.00'],
			[original.entryId, '2026-08-01', '100.00', '0.00']
		]
	)

	const beforeReversal = expectSuccess(
		await getAccountActivity(actor, {
			accountId: ids.cash,
			dateTo: '2026-08-05',
			pageSize: 20
		})
	)
	assert.equal(beforeReversal.rows.length, 1)
	assert.equal(beforeReversal.rows[0]?.entryId, original.entryId)

	const journal = expectSuccess(
		await getJournalActivity(actor, { journalId: ids.journal, pageSize: 20 })
	)
	assert.equal(journal.postedEntryCount, 2)
	assert.equal(journal.totalDebit, '200.00')
	assert.equal(journal.totalCredit, '200.00')

	const originalDetail = expectSuccess(await getJournalEntry(actor, { entryId: original.entryId }))
	assert.equal(originalDetail.status, 'REVERSED')
	assert.equal(originalDetail.reversalEntry?.id, reversal.entryId)

	const augustFive = expectSuccess(await getTrialBalance(actor, { asOfDate: '2026-08-05' }))
	assert.equal(augustFive.rows.find((row) => row.accountId === ids.cash)?.balance, '100.00')
	const augustSix = expectSuccess(await getTrialBalance(actor, { asOfDate: '2026-08-06' }))
	assert.equal(augustSix.rows.find((row) => row.accountId === ids.cash)?.balance, '0.00')
})
