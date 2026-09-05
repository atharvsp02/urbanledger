import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { config as loadEnvironment } from 'dotenv'
import { Client } from 'pg'
import { capabilitiesByRole } from '../../src/server/access/permissions'
import {
	postManualJournal,
	postOpeningJournal,
	reverseJournalEntry
} from '../../src/server/accounting/journal-commands'
import { getTrialBalance } from '../../src/server/accounting/trial-balance'
import { getPrisma } from '../../src/server/db/prisma'
import type { Actor } from '../../src/lib/contracts/access'
import type { ActionResult, ApplicationErrorCode } from '../../src/lib/contracts/errors'

loadEnvironment({ path: '.env.local', quiet: true })

const ids = {
	business: '90000000-0000-4000-8000-000000000001',
	otherBusiness: '90000000-0000-4000-8000-000000000002',
	user: '91000000-0000-4000-8000-000000000001',
	providerUser: '91000000-0000-4000-8000-000000000101',
	grant: '92000000-0000-4000-8000-000000000001',
	cash: '93000000-0000-4000-8000-000000000001',
	bank: '93000000-0000-4000-8000-000000000002',
	capital: '93000000-0000-4000-8000-000000000003',
	expense: '93000000-0000-4000-8000-000000000004',
	income: '93000000-0000-4000-8000-000000000005',
	receivable: '93000000-0000-4000-8000-000000000006',
	archivedAccount: '93000000-0000-4000-8000-000000000007',
	otherAccount: '93000000-0000-4000-8000-000000000008',
	generalJournal: '94000000-0000-4000-8000-000000000001',
	openingJournal: '94000000-0000-4000-8000-000000000002',
	archivedJournal: '94000000-0000-4000-8000-000000000003',
	otherJournal: '94000000-0000-4000-8000-000000000004',
	contact: '95000000-0000-4000-8000-000000000001',
	archivedContact: '95000000-0000-4000-8000-000000000002',
	otherContact: '95000000-0000-4000-8000-000000000003',
	expenseAnalytic: '96000000-0000-4000-8000-000000000001',
	incomeAnalytic: '96000000-0000-4000-8000-000000000002',
	archivedAnalytic: '96000000-0000-4000-8000-000000000003',
	otherAnalytic: '96000000-0000-4000-8000-000000000004'
} as const

const actor: Actor = {
	userId: ids.user,
	providerUserId: ids.providerUser,
	businessId: ids.business,
	role: 'ACCOUNTANT',
	contactId: null,
	displayName: 'Accounting Test User',
	capabilities: capabilitiesByRole.ACCOUNTANT
}

const postingDate = '2026-09-05'

function manualInput(operationKey = randomUUID()) {
	return {
		operationKey,
		journalId: ids.generalJournal,
		postingDate,
		memo: 'Office expense',
		lines: [
			{
				accountId: ids.expense,
				contactId: ids.contact,
				analyticAccountId: ids.expenseAnalytic,
				description: 'Office supplies',
				debit: '100.00',
				credit: '0'
			},
			{
				accountId: ids.cash,
				description: 'Cash paid',
				debit: '0',
				credit: '100.00'
			}
		]
	}
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

async function cleanupFixtureData() {
	const connectionString = process.env.DIRECT_URL
	assert.ok(connectionString, 'DIRECT_URL is required for accounting integration test cleanup.')

	const client = new Client({ connectionString })
	await client.connect()

	try {
		await client.query('BEGIN')
		await client.query('ALTER TABLE app.journal_items DISABLE TRIGGER protect_posted_journal_items')
		await client.query(
			'ALTER TABLE app.journal_entries DISABLE TRIGGER protect_posted_journal_entries'
		)
		await client.query('DELETE FROM app.audit_events WHERE "businessId" = ANY($1::uuid[])', [
			[ids.business, ids.otherBusiness]
		])
		await client.query('DELETE FROM app.command_operations WHERE "businessId" = ANY($1::uuid[])', [
			[ids.business, ids.otherBusiness]
		])
		await client.query('DELETE FROM app.journal_entries WHERE "businessId" = ANY($1::uuid[])', [
			[ids.business, ids.otherBusiness]
		])
		await client.query('DELETE FROM app.document_sequences WHERE "businessId" = ANY($1::uuid[])', [
			[ids.business, ids.otherBusiness]
		])
		await client.query('DELETE FROM app.staff_grants WHERE "businessId" = ANY($1::uuid[])', [
			[ids.business, ids.otherBusiness]
		])
		await client.query('DELETE FROM app.analytic_accounts WHERE "businessId" = ANY($1::uuid[])', [
			[ids.business, ids.otherBusiness]
		])
		await client.query('DELETE FROM app.contacts WHERE "businessId" = ANY($1::uuid[])', [
			[ids.business, ids.otherBusiness]
		])
		await client.query('DELETE FROM app.journals WHERE "businessId" = ANY($1::uuid[])', [
			[ids.business, ids.otherBusiness]
		])
		await client.query('DELETE FROM app.ledger_accounts WHERE "businessId" = ANY($1::uuid[])', [
			[ids.business, ids.otherBusiness]
		])
		await client.query('DELETE FROM app.application_users WHERE id = $1::uuid', [ids.user])
		await client.query('DELETE FROM app.businesses WHERE id = ANY($1::uuid[])', [
			[ids.business, ids.otherBusiness]
		])
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

	await database.business.createMany({
		data: [
			{
				id: ids.business,
				slug: 'accounting-kernel-test',
				name: 'Accounting Kernel Test',
				readyAt: new Date()
			},
			{
				id: ids.otherBusiness,
				slug: 'accounting-kernel-other',
				name: 'Other Accounting Business',
				readyAt: new Date()
			}
		]
	})

	await database.applicationUser.create({
		data: {
			id: ids.user,
			providerUserId: ids.providerUser,
			loginId: 'acctest',
			normalizedLoginId: 'acctest',
			normalizedEmail: 'accounting-kernel@urbanledger.test',
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
				id: ids.bank,
				businessId: ids.business,
				code: '1010',
				name: 'Bank',
				type: 'ASSET',
				subtype: 'BANK'
			},
			{
				id: ids.capital,
				businessId: ids.business,
				code: '3000',
				name: 'Capital',
				type: 'CAPITAL',
				subtype: 'GENERAL'
			},
			{
				id: ids.expense,
				businessId: ids.business,
				code: '5000',
				name: 'Office Expense',
				type: 'EXPENSE',
				subtype: 'GENERAL'
			},
			{
				id: ids.income,
				businessId: ids.business,
				code: '4000',
				name: 'Other Income',
				type: 'INCOME',
				subtype: 'GENERAL'
			},
			{
				id: ids.receivable,
				businessId: ids.business,
				code: '1100',
				name: 'Receivable',
				type: 'ASSET',
				subtype: 'RECEIVABLE'
			},
			{
				id: ids.archivedAccount,
				businessId: ids.business,
				code: '5090',
				name: 'Archived Expense',
				type: 'EXPENSE',
				subtype: 'GENERAL',
				archivedAt: new Date()
			},
			{
				id: ids.otherAccount,
				businessId: ids.otherBusiness,
				code: '9000',
				name: 'Other Business Account',
				type: 'EXPENSE',
				subtype: 'GENERAL'
			}
		]
	})

	await database.journal.createMany({
		data: [
			{
				id: ids.generalJournal,
				businessId: ids.business,
				code: 'GEN',
				name: 'General',
				type: 'GENERAL'
			},
			{
				id: ids.openingJournal,
				businessId: ids.business,
				code: 'OPN',
				name: 'Opening',
				type: 'OPENING'
			},
			{
				id: ids.archivedJournal,
				businessId: ids.business,
				code: 'ARC',
				name: 'Archived General',
				type: 'GENERAL',
				archivedAt: new Date()
			},
			{
				id: ids.otherJournal,
				businessId: ids.otherBusiness,
				code: 'OTH',
				name: 'Other General',
				type: 'GENERAL'
			}
		]
	})

	await database.contact.createMany({
		data: [
			{
				id: ids.contact,
				businessId: ids.business,
				kind: 'VENDOR',
				name: 'Office Supplier'
			},
			{
				id: ids.archivedContact,
				businessId: ids.business,
				kind: 'VENDOR',
				name: 'Archived Supplier',
				archivedAt: new Date()
			},
			{
				id: ids.otherContact,
				businessId: ids.otherBusiness,
				kind: 'VENDOR',
				name: 'Other Supplier'
			}
		]
	})

	await database.analyticAccount.createMany({
		data: [
			{
				id: ids.expenseAnalytic,
				businessId: ids.business,
				name: 'Office Costs',
				type: 'EXPENSE'
			},
			{
				id: ids.incomeAnalytic,
				businessId: ids.business,
				name: 'Other Revenue',
				type: 'INCOME'
			},
			{
				id: ids.archivedAnalytic,
				businessId: ids.business,
				name: 'Archived Costs',
				type: 'EXPENSE',
				archivedAt: new Date()
			},
			{
				id: ids.otherAnalytic,
				businessId: ids.otherBusiness,
				name: 'Other Costs',
				type: 'EXPENSE'
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

test('posts balanced manual and opening journal entries atomically', async () => {
	const manual = expectSuccess(await postManualJournal(actor, manualInput()))
	assert.equal(manual.source, 'MANUAL')
	assert.equal(manual.totalDebit, '100.00')
	assert.equal(manual.totalCredit, '100.00')
	assert.match(manual.entryNumber, /^JE\/2026\/\d{6}$/)

	const opening = expectSuccess(
		await postOpeningJournal(actor, {
			operationKey: randomUUID(),
			journalId: ids.openingJournal,
			postingDate,
			memo: 'Opening bank balance',
			lines: [
				{ accountId: ids.bank, debit: '2500', credit: '0' },
				{ accountId: ids.capital, debit: '0', credit: '2500.00' }
			]
		})
	)
	assert.equal(opening.source, 'OPENING')
	assert.equal(opening.totalDebit, '2500.00')

	const persisted = await getPrisma().journalEntry.findUnique({
		where: { id: manual.entryId },
		include: { items: true }
	})
	assert.equal(persisted?.state, 'POSTED')
	assert.equal(persisted?.items.length, 2)
	assert.equal(await getPrisma().auditEvent.count({ where: { targetId: manual.entryId } }), 1)
})

test('rejects an unbalanced entry', async () => {
	const input = manualInput()
	input.lines[1].credit = '99.99'
	expectFailure(await postManualJournal(actor, input), 'VALIDATION_ERROR')
})

test('rejects fewer than two lines', async () => {
	const input = manualInput()
	input.lines = [input.lines[0]]
	expectFailure(await postManualJournal(actor, input), 'VALIDATION_ERROR')
})

test('rejects debit and credit on the same line', async () => {
	const input = manualInput()
	input.lines[0].credit = '1.00'
	expectFailure(await postManualJournal(actor, input), 'VALIDATION_ERROR')
})

test('rejects zero and negative journal amounts', async () => {
	const zeroInput = manualInput()
	zeroInput.lines = [
		{ accountId: ids.expense, debit: '0', credit: '0' },
		{ accountId: ids.cash, debit: '0', credit: '0' }
	]
	expectFailure(await postManualJournal(actor, zeroInput), 'VALIDATION_ERROR')

	const negativeInput = manualInput()
	negativeInput.lines[0].debit = '-1.00'
	expectFailure(await postManualJournal(actor, negativeInput), 'VALIDATION_ERROR')
})

test('normalizes exact decimals and rejects unsupported precision and totals', async () => {
	const exactInput = manualInput()
	exactInput.lines[0].debit = '0.10'
	exactInput.lines[1].credit = '0.1'
	const exactResult = expectSuccess(await postManualJournal(actor, exactInput))
	assert.equal(exactResult.totalDebit, '0.10')
	assert.equal(exactResult.totalCredit, '0.10')

	const excessPrecision = manualInput()
	excessPrecision.lines[0].debit = '0.001'
	expectFailure(await postManualJournal(actor, excessPrecision), 'VALIDATION_ERROR')

	const excessTotal = manualInput()
	excessTotal.lines = [
		{ accountId: ids.expense, debit: '999999999999999999.99', credit: '0' },
		{ accountId: ids.expense, debit: '999999999999999999.99', credit: '0' },
		{ accountId: ids.cash, debit: '0', credit: '999999999999999999.99' },
		{ accountId: ids.cash, debit: '0', credit: '999999999999999999.99' }
	]
	expectFailure(await postManualJournal(actor, excessTotal), 'VALIDATION_ERROR')
})

test('rejects wrong-business and archived dependencies', async () => {
	const wrongJournal = manualInput()
	wrongJournal.journalId = ids.otherJournal
	expectFailure(await postManualJournal(actor, wrongJournal), 'NOT_FOUND')

	const wrongAccount = manualInput()
	wrongAccount.lines[0].accountId = ids.otherAccount
	expectFailure(await postManualJournal(actor, wrongAccount), 'NOT_FOUND')

	const wrongContact = manualInput()
	wrongContact.lines[0].contactId = ids.otherContact
	expectFailure(await postManualJournal(actor, wrongContact), 'NOT_FOUND')

	const wrongAnalytic = manualInput()
	wrongAnalytic.lines[0].analyticAccountId = ids.otherAnalytic
	expectFailure(await postManualJournal(actor, wrongAnalytic), 'NOT_FOUND')

	const archivedJournal = manualInput()
	archivedJournal.journalId = ids.archivedJournal
	expectFailure(await postManualJournal(actor, archivedJournal), 'ARCHIVED_DEPENDENCY')

	const archivedAccount = manualInput()
	archivedAccount.lines[0].accountId = ids.archivedAccount
	expectFailure(await postManualJournal(actor, archivedAccount), 'ARCHIVED_DEPENDENCY')

	const archivedContact = manualInput()
	archivedContact.lines[0].contactId = ids.archivedContact
	expectFailure(await postManualJournal(actor, archivedContact), 'ARCHIVED_DEPENDENCY')

	const archivedAnalytic = manualInput()
	archivedAnalytic.lines[0].analyticAccountId = ids.archivedAnalytic
	expectFailure(await postManualJournal(actor, archivedAnalytic), 'ARCHIVED_DEPENDENCY')
})

test('rejects incompatible accounts and analytic account types', async () => {
	const controlAccount = manualInput()
	controlAccount.lines[0].accountId = ids.receivable
	controlAccount.lines[0].analyticAccountId = null
	expectFailure(await postManualJournal(actor, controlAccount), 'INVALID_STATE')

	const analyticMismatch = manualInput()
	analyticMismatch.lines[0].analyticAccountId = ids.incomeAnalytic
	expectFailure(await postManualJournal(actor, analyticMismatch), 'INVALID_STATE')

	const openingAccountMismatch = manualInput()
	openingAccountMismatch.journalId = ids.openingJournal
	expectFailure(await postOpeningJournal(actor, openingAccountMismatch), 'INVALID_STATE')

	const openingDirectionMismatch = {
		operationKey: randomUUID(),
		journalId: ids.openingJournal,
		postingDate,
		memo: 'Invalid opening direction',
		lines: [
			{ accountId: ids.cash, debit: '0', credit: '50.00' },
			{ accountId: ids.capital, debit: '50.00', credit: '0' }
		]
	}
	expectFailure(await postOpeningJournal(actor, openingDirectionMismatch), 'INVALID_STATE')
})

test('rejects a locked posting date', async () => {
	await getPrisma().business.update({
		where: { id: ids.business },
		data: { accountingLockDate: new Date(`${postingDate}T00:00:00.000Z`) }
	})

	try {
		expectFailure(await postManualJournal(actor, manualInput()), 'LOCKED_PERIOD')
	} finally {
		await getPrisma().business.update({
			where: { id: ids.business },
			data: { accountingLockDate: null }
		})
	}
})

test('returns the committed result for a repeated operation key', async () => {
	const operationKey = randomUUID()
	const first = expectSuccess(await postManualJournal(actor, manualInput(operationKey)))
	const equivalent = manualInput(operationKey)
	equivalent.lines[0].debit = '100'
	equivalent.lines[1].credit = '100.0'
	const second = expectSuccess(await postManualJournal(actor, equivalent))

	assert.deepEqual(second, first)
	assert.equal(
		await getPrisma().journalEntry.count({
			where: { businessId: ids.business, id: first.entryId }
		}),
		1
	)
	assert.equal(
		await getPrisma().commandOperation.count({
			where: { businessId: ids.business, operationKey }
		}),
		1
	)
})

test('collapses concurrent retries into one posting', async () => {
	const operationKey = randomUUID()
	const [left, right] = await Promise.all([
		postManualJournal(actor, manualInput(operationKey)),
		postManualJournal(actor, manualInput(operationKey))
	])
	const leftResult = expectSuccess(left)
	const rightResult = expectSuccess(right)

	assert.equal(leftResult.entryId, rightResult.entryId)
	assert.equal(await getPrisma().journalEntry.count({ where: { id: leftResult.entryId } }), 1)
})

test('rejects a changed payload under a reused operation key', async () => {
	const operationKey = randomUUID()
	expectSuccess(await postManualJournal(actor, manualInput(operationKey)))

	const changed = manualInput(operationKey)
	changed.memo = 'Changed memo'
	expectFailure(await postManualJournal(actor, changed), 'OPERATION_KEY_MISMATCH')
})

test('database constraints reject mutation of a posted entry and its items', async () => {
	const result = expectSuccess(await postManualJournal(actor, manualInput()))
	const item = await getPrisma().journalItem.findFirstOrThrow({
		where: { entryId: result.entryId }
	})

	await assert.rejects(
		getPrisma().journalEntry.update({
			where: { id: result.entryId },
			data: { reference: 'MUTATED' }
		}),
		/posted journal entries are immutable/
	)
	await assert.rejects(
		getPrisma().journalItem.update({
			where: { id: item.id },
			data: { description: 'Mutated' }
		}),
		/posted journal items are immutable/
	)
})

test('creates a linked opposite entry for a reversal', async () => {
	const input = manualInput()
	input.lines[0].debit = '12.34'
	input.lines[1].credit = '12.34'
	const originalResult = expectSuccess(await postManualJournal(actor, input))
	const originalBefore = await getPrisma().journalEntry.findUniqueOrThrow({
		where: { id: originalResult.entryId },
		include: { items: { orderBy: { accountId: 'asc' } } }
	})

	const reversalResult = expectSuccess(
		await reverseJournalEntry(actor, {
			operationKey: randomUUID(),
			entryId: originalResult.entryId,
			postingDate: '2026-09-06',
			reason: 'Correct the manual journal'
		})
	)
	const reversal = await getPrisma().journalEntry.findUniqueOrThrow({
		where: { id: reversalResult.entryId },
		include: { items: { orderBy: { accountId: 'asc' } } }
	})
	const originalAfter = await getPrisma().journalEntry.findUniqueOrThrow({
		where: { id: originalResult.entryId },
		include: { items: { orderBy: { accountId: 'asc' } } }
	})

	assert.equal(reversal.source, 'REVERSAL')
	assert.equal(reversal.reversalOfEntryId, originalResult.entryId)
	assert.equal(reversal.items.length, originalBefore.items.length)

	for (const [index, item] of reversal.items.entries()) {
		assert.equal(item.accountId, originalBefore.items[index].accountId)
		assert.equal(item.debit.toFixed(2), originalBefore.items[index].credit.toFixed(2))
		assert.equal(item.credit.toFixed(2), originalBefore.items[index].debit.toFixed(2))
	}

	assert.deepEqual(originalAfter, originalBefore)
	assert.equal(
		await getPrisma().auditEvent.count({
			where: { targetId: reversal.id, action: 'journal.reversed' }
		}),
		1
	)
})

test('returns an exactly balanced trial balance', async () => {
	await getPrisma().ledgerAccount.update({
		where: { id: ids.expense },
		data: { archivedAt: new Date() }
	})
	const report = expectSuccess(await getTrialBalance(actor, { asOfDate: '2026-12-31' }))

	assert.equal(report.totalDebit, report.totalCredit)
	assert.equal(report.difference, '0.00')
	assert.equal(report.balanced, true)
	assert.ok(report.rows.length >= 4)
	assert.ok(report.rows.some((row) => row.accountId === ids.expense))
})
