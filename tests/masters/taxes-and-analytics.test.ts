import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { config as loadEnvironment } from 'dotenv'
import { Client } from 'pg'
import type { Actor } from '../../src/lib/contracts/access'
import type { ApplicationErrorCode } from '../../src/lib/contracts/errors'
import { capabilitiesByRole } from '../../src/server/access/permissions'
import { getPrisma } from '../../src/server/db/prisma'
import { ApplicationError } from '../../src/server/errors/application-error'
import {
	createAnalyticAccount,
	getAnalyticAccountDetail,
	listSelectableAnalyticAccounts,
	setAnalyticAccountArchived,
	updateAnalyticAccount
} from '../../src/server/masters/analytic-accounts'
import {
	createTax,
	getTax,
	listSelectableTaxes,
	listTaxes,
	setTaxArchived,
	updateTax
} from '../../src/server/masters/taxes'

loadEnvironment({ path: '.env.local', quiet: true })

const ids = {
	business: 'b0000000-0000-4000-8000-000000000001',
	user: 'b1000000-0000-4000-8000-000000000001',
	providerUser: 'b1000000-0000-4000-8000-000000000101',
	grant: 'b2000000-0000-4000-8000-000000000001',
	inputTax: 'b3000000-0000-4000-8000-000000000001',
	outputTax: 'b3000000-0000-4000-8000-000000000002',
	archivedOutputTax: 'b3000000-0000-4000-8000-000000000003',
	generalAsset: 'b3000000-0000-4000-8000-000000000004'
} as const

const actor: Actor = {
	userId: ids.user,
	providerUserId: ids.providerUser,
	businessId: ids.business,
	role: 'ADMIN',
	contactId: null,
	displayName: 'Master Data Test User',
	capabilities: capabilitiesByRole.ADMIN
}

const accountantActor: Actor = {
	...actor,
	role: 'ACCOUNTANT',
	capabilities: capabilitiesByRole.ACCOUNTANT
}

async function expectFailure(run: () => Promise<unknown>, code: ApplicationErrorCode) {
	try {
		await run()
	} catch (error) {
		assert.ok(error instanceof ApplicationError, `Expected ApplicationError, received ${error}`)
		assert.equal(error.code, code)
		return error
	}

	assert.fail(`Expected ${code}.`)
}

async function cleanupFixtureData() {
	const connectionString = process.env.DIRECT_URL
	assert.ok(connectionString, 'DIRECT_URL is required for master data test cleanup.')

	const client = new Client({ connectionString })
	await client.connect()

	try {
		await client.query('BEGIN')
		await client.query('DELETE FROM app.taxes WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.analytic_accounts WHERE "businessId" = $1::uuid', [
			ids.business
		])
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

async function createFixtureData() {
	const database = getPrisma()

	await database.business.create({
		data: {
			id: ids.business,
			slug: 'master-data-test',
			name: 'Master Data Test',
			readyAt: new Date()
		}
	})
	await database.applicationUser.create({
		data: {
			id: ids.user,
			providerUserId: ids.providerUser,
			loginId: 'mdtest1',
			normalizedLoginId: 'mdtest1',
			normalizedEmail: 'master-data@urbanledger.test',
			displayName: actor.displayName,
			status: 'ACTIVE'
		}
	})
	await database.staffGrant.create({
		data: { id: ids.grant, userId: ids.user, businessId: ids.business, role: 'ADMIN' }
	})
	await database.ledgerAccount.createMany({
		data: [
			{
				id: ids.inputTax,
				businessId: ids.business,
				code: 'MD-1401',
				name: 'Input tax',
				type: 'ASSET',
				subtype: 'INPUT_TAX'
			},
			{
				id: ids.outputTax,
				businessId: ids.business,
				code: 'MD-2401',
				name: 'Output tax',
				type: 'LIABILITY',
				subtype: 'OUTPUT_TAX'
			},
			{
				id: ids.archivedOutputTax,
				businessId: ids.business,
				code: 'MD-2402',
				name: 'Retired output tax',
				type: 'LIABILITY',
				subtype: 'OUTPUT_TAX',
				archivedAt: new Date()
			},
			{
				id: ids.generalAsset,
				businessId: ids.business,
				code: 'MD-1000',
				name: 'General asset',
				type: 'ASSET',
				subtype: 'GENERAL'
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

test('rejects a rate outside the supported range', async () => {
	await assert.rejects(() =>
		createTax(actor, {
			name: 'Over range',
			rate: '100.5',
			scope: 'SALES',
			inputAccountId: null,
			outputAccountId: ids.outputTax
		})
	)
})

test('requires the mapping its scope needs', async () => {
	await assert.rejects(() =>
		createTax(actor, {
			name: 'Missing output',
			rate: '18',
			scope: 'SALES',
			inputAccountId: null,
			outputAccountId: null
		})
	)
})

test('rejects an account whose class does not match the mapping', async () => {
	const error = await expectFailure(
		() =>
			createTax(actor, {
				name: 'Wrong class',
				rate: '18',
				scope: 'PURCHASE',
				inputAccountId: ids.generalAsset,
				outputAccountId: null
			}),
		'VALIDATION_ERROR'
	)

	assert.ok(error.fieldErrors?.inputAccountId)
})

test('rejects an archived account mapping', async () => {
	await expectFailure(
		() =>
			createTax(actor, {
				name: 'Archived mapping',
				rate: '18',
				scope: 'SALES',
				inputAccountId: null,
				outputAccountId: ids.archivedOutputTax
			}),
		'ARCHIVED_DEPENDENCY'
	)
})

test('stores only the mappings the scope needs and clears the rest on change', async () => {
	const created = await createTax(actor, {
		name: 'Scoped tax',
		rate: '18.5',
		scope: 'BOTH',
		inputAccountId: ids.inputTax,
		outputAccountId: ids.outputTax
	})

	const both = await getTax(actor, created.id)
	assert.equal(both.rate, '18.5000')
	assert.equal(both.inputAccount?.id, ids.inputTax)
	assert.equal(both.outputAccount?.id, ids.outputTax)

	await updateTax(actor, created.id, both.revision, {
		name: 'Scoped tax',
		rate: '18.5',
		scope: 'SALES',
		inputAccountId: ids.inputTax,
		outputAccountId: ids.outputTax
	})

	const sales = await getTax(actor, created.id)
	assert.equal(sales.inputAccount, null)
	assert.equal(sales.outputAccount?.id, ids.outputTax)
})

test('rejects a duplicate tax name within the business', async () => {
	await expectFailure(
		() =>
			createTax(actor, {
				name: 'Scoped tax',
				rate: '5',
				scope: 'SALES',
				inputAccountId: null,
				outputAccountId: ids.outputTax
			}),
		'CONFLICT'
	)
})

test('rejects a stale tax revision', async () => {
	const current = (await listTaxes(actor, { search: 'Scoped tax' })).rows[0]

	await expectFailure(
		() =>
			updateTax(actor, current.id, current.revision - 1, {
				name: 'Scoped tax',
				rate: '9',
				scope: 'SALES',
				inputAccountId: null,
				outputAccountId: ids.outputTax
			}),
		'STALE_REVISION'
	)
})

test('excludes archived taxes from the active selector', async () => {
	const current = (await listTaxes(actor, { search: 'Scoped tax' })).rows[0]
	await setTaxArchived(actor, current.id, current.revision, true)

	const selectable = await listSelectableTaxes(actor)
	assert.equal(
		selectable.some((tax) => tax.id === current.id),
		false
	)

	const listed = await listTaxes(actor, { search: 'Scoped tax', includeArchived: true })
	assert.equal(listed.rows.length, 1)

	const restored = listed.rows[0]
	await setTaxArchived(actor, restored.id, restored.revision, false)
	assert.equal((await listSelectableTaxes(actor, 'SALES')).length, 1)
})

test('refuses a role without the capability', async () => {
	await expectFailure(
		() =>
			updateTax(accountantActor, ids.inputTax, 1, {
				name: 'Not allowed',
				rate: '1',
				scope: 'SALES',
				inputAccountId: null,
				outputAccountId: ids.outputTax
			}),
		'FORBIDDEN'
	)
})

test('rejects a duplicate analytic account name', async () => {
	await createAnalyticAccount(actor, { name: 'Workshop costs', type: 'EXPENSE' })

	await expectFailure(
		() => createAnalyticAccount(actor, { name: 'Workshop costs', type: 'INCOME' }),
		'CONFLICT'
	)
})

test('reports analytic usage counts and keeps the type editable while unused', async () => {
	const created = await createAnalyticAccount(actor, { name: 'Showroom income', type: 'INCOME' })
	const detail = await getAnalyticAccountDetail(actor, created.id)

	assert.equal(detail.journalItemCount, 0)
	assert.equal(detail.budgetLineCount, 0)

	await updateAnalyticAccount(actor, created.id, detail.revision, {
		name: 'Showroom income',
		type: 'EXPENSE'
	})

	assert.equal((await getAnalyticAccountDetail(actor, created.id)).type, 'EXPENSE')
})

test('rejects a stale analytic revision', async () => {
	const created = await createAnalyticAccount(actor, { name: 'Delivery costs', type: 'EXPENSE' })

	await expectFailure(
		() =>
			updateAnalyticAccount(actor, created.id, 99, {
				name: 'Delivery costs',
				type: 'EXPENSE'
			}),
		'STALE_REVISION'
	)
})

test('excludes archived analytic accounts from the active selector', async () => {
	const created = await createAnalyticAccount(actor, { name: 'Retired grouping', type: 'EXPENSE' })
	const detail = await getAnalyticAccountDetail(actor, created.id)
	await setAnalyticAccountArchived(actor, created.id, detail.revision, true)

	const selectable = await listSelectableAnalyticAccounts(actor)
	assert.equal(
		selectable.some((account) => account.id === created.id),
		false
	)

	const archived = await getAnalyticAccountDetail(actor, created.id)
	assert.ok(archived.archivedAt)
	await setAnalyticAccountArchived(actor, created.id, archived.revision, false)
	assert.equal(
		(await listSelectableAnalyticAccounts(actor, 'EXPENSE')).some(
			(account) => account.id === created.id
		),
		true
	)
})
