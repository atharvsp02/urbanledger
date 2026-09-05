import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { config as loadEnvironment } from 'dotenv'
import { Client } from 'pg'
import type { Actor } from '../../src/lib/contracts/access'
import type { ActionResult } from '../../src/lib/contracts/errors'
import { capabilitiesByRole } from '../../src/server/access/permissions'
import {
	postManualJournal,
	postOpeningJournal,
	reverseJournalEntry
} from '../../src/server/accounting'
import { getPrisma } from '../../src/server/db/prisma'
import { getBalanceSheet, getLiquidityMovement, getProfitAndLoss } from '../../src/server/reports'

loadEnvironment({ path: '.env.local', quiet: true })

const ids = {
	business: 'e0000000-0000-4000-8000-000000000001',
	user: 'e1000000-0000-4000-8000-000000000001',
	provider: 'e1000000-0000-4000-8000-000000000101',
	grant: 'e2000000-0000-4000-8000-000000000001',
	bank: 'e3000000-0000-4000-8000-000000000001',
	capital: 'e3000000-0000-4000-8000-000000000002',
	income: 'e3000000-0000-4000-8000-000000000003',
	expense: 'e3000000-0000-4000-8000-000000000004',
	openingJournal: 'e4000000-0000-4000-8000-000000000001',
	generalJournal: 'e4000000-0000-4000-8000-000000000002'
} as const

const actor: Actor = {
	userId: ids.user,
	providerUserId: ids.provider,
	businessId: ids.business,
	role: 'ACCOUNTANT',
	contactId: null,
	displayName: 'Report Totals User',
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
		await client.query('DELETE FROM app.journal_entries WHERE "businessId" = $1::uuid', [
			ids.business
		])
		for (const table of ['command_operations', 'audit_events', 'document_sequences']) {
			await client.query(`DELETE FROM app.${table} WHERE "businessId" = $1::uuid`, [ids.business])
		}
		await client.query('DELETE FROM app.journals WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.ledger_accounts WHERE "businessId" = $1::uuid', [
			ids.business
		])
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
			slug: 'report-totals-test',
			name: 'Report Totals Test',
			readyAt: new Date()
		}
	})
	await database.applicationUser.create({
		data: {
			id: ids.user,
			providerUserId: ids.provider,
			loginId: 'report1',
			normalizedLoginId: 'report1',
			normalizedEmail: 'report-totals@urbanledger.test',
			displayName: actor.displayName,
			status: 'ACTIVE'
		}
	})
	await database.staffGrant.create({
		data: { id: ids.grant, userId: ids.user, businessId: ids.business, role: 'ACCOUNTANT' }
	})
	await database.ledgerAccount.createMany({
		data: [
			{
				id: ids.bank,
				businessId: ids.business,
				code: '1000',
				name: 'Bank',
				type: 'ASSET',
				subtype: 'BANK'
			},
			{ id: ids.capital, businessId: ids.business, code: '3000', name: 'Capital', type: 'CAPITAL' },
			{ id: ids.income, businessId: ids.business, code: '4000', name: 'Income', type: 'INCOME' },
			{ id: ids.expense, businessId: ids.business, code: '5000', name: 'Expense', type: 'EXPENSE' }
		]
	})
	await database.journal.createMany({
		data: [
			{
				id: ids.openingJournal,
				businessId: ids.business,
				code: 'OPN',
				name: 'Opening',
				type: 'OPENING'
			},
			{
				id: ids.generalJournal,
				businessId: ids.business,
				code: 'GEN',
				name: 'General',
				type: 'GENERAL'
			}
		]
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

test('report totals use posted entries and later reversals at their effective date', async () => {
	success(
		await postOpeningJournal(actor, {
			operationKey: randomUUID(),
			journalId: ids.openingJournal,
			postingDate: '2026-05-01',
			memo: 'Opening capital',
			lines: [
				{ accountId: ids.bank, debit: '1000', credit: '0' },
				{ accountId: ids.capital, debit: '0', credit: '1000' }
			]
		})
	)
	const revenue = success(
		await postManualJournal(actor, {
			operationKey: randomUUID(),
			journalId: ids.generalJournal,
			postingDate: '2026-06-10',
			memo: 'Service revenue',
			lines: [
				{ accountId: ids.bank, debit: '300', credit: '0' },
				{ accountId: ids.income, debit: '0', credit: '300' }
			]
		})
	)
	success(
		await postManualJournal(actor, {
			operationKey: randomUUID(),
			journalId: ids.generalJournal,
			postingDate: '2026-06-15',
			memo: 'Operating expense',
			lines: [
				{ accountId: ids.expense, debit: '100', credit: '0' },
				{ accountId: ids.bank, debit: '0', credit: '100' }
			]
		})
	)
	success(
		await reverseJournalEntry(actor, {
			operationKey: randomUUID(),
			entryId: revenue.entryId,
			postingDate: '2026-07-05',
			reason: 'Revenue transaction cancelled'
		})
	)

	const june = success(
		await getProfitAndLoss(actor, { dateFrom: '2026-06-01', dateTo: '2026-06-30' })
	)
	assert.equal(june.income.total, '300.00')
	assert.equal(june.expenses.total, '100.00')
	assert.equal(june.profit, '200.00')
	const juneBalance = success(await getBalanceSheet(actor, { asOfDate: '2026-06-30' }))
	assert.equal(juneBalance.assets.total, '1200.00')
	assert.equal(juneBalance.equity.derivedEarnings, '200.00')
	assert.equal(juneBalance.totalLiabilitiesAndEquity, '1200.00')
	assert.equal(juneBalance.balanced, true)
	const liquidity = success(
		await getLiquidityMovement(actor, { dateFrom: '2026-06-01', dateTo: '2026-06-30' })
	)
	assert.equal(liquidity.totalOpening, '1000.00')
	assert.equal(liquidity.totalInflow, '300.00')
	assert.equal(liquidity.totalOutflow, '100.00')
	assert.equal(liquidity.totalClosing, '1200.00')
	const julyBalance = success(await getBalanceSheet(actor, { asOfDate: '2026-07-31' }))
	assert.equal(julyBalance.assets.total, '900.00')
	assert.equal(julyBalance.equity.derivedEarnings, '-100.00')
	assert.equal(julyBalance.balanced, true)
})
