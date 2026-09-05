import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { config as loadEnvironment } from 'dotenv'
import { Client } from 'pg'
import type { Actor } from '../../src/lib/contracts/access'
import { capabilitiesByRole } from '../../src/server/access/permissions'
import { revokeStaffGrant } from '../../src/server/access'
import { getPrisma } from '../../src/server/db/prisma'

loadEnvironment({ path: '.env.local', quiet: true })

const ids = {
	business: 'f0000000-0000-4000-8000-000000000001',
	firstUser: 'f1000000-0000-4000-8000-000000000001',
	secondUser: 'f1000000-0000-4000-8000-000000000002',
	firstProvider: 'f1000000-0000-4000-8000-000000000101',
	secondProvider: 'f1000000-0000-4000-8000-000000000102',
	firstGrant: 'f2000000-0000-4000-8000-000000000001',
	secondGrant: 'f2000000-0000-4000-8000-000000000002'
} as const

const actor: Actor = {
	userId: ids.firstUser,
	providerUserId: ids.firstProvider,
	businessId: ids.business,
	role: 'ADMIN',
	contactId: null,
	displayName: 'First Administrator',
	capabilities: capabilitiesByRole.ADMIN
}

async function cleanup() {
	const connectionString = process.env.DIRECT_URL
	assert.ok(connectionString)
	const client = new Client({ connectionString })
	await client.connect()
	try {
		await client.query('DELETE FROM app.audit_events WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.command_operations WHERE "businessId" = $1::uuid', [
			ids.business
		])
		await client.query('DELETE FROM app.staff_grants WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.application_users WHERE id IN ($1::uuid, $2::uuid)', [
			ids.firstUser,
			ids.secondUser
		])
		await client.query('DELETE FROM app.businesses WHERE id = $1::uuid', [ids.business])
	} finally {
		await client.end()
	}
}

async function setup() {
	const database = getPrisma()
	await database.business.create({
		data: {
			id: ids.business,
			slug: 'last-admin-test',
			name: 'Last Admin Test',
			readyAt: new Date()
		}
	})
	await database.applicationUser.create({
		data: {
			id: ids.firstUser,
			providerUserId: ids.firstProvider,
			loginId: 'admin1',
			normalizedLoginId: 'admin1',
			normalizedEmail: 'first-admin@urbanledger.test',
			displayName: actor.displayName,
			status: 'ACTIVE'
		}
	})
	await database.staffGrant.create({
		data: { id: ids.firstGrant, userId: ids.firstUser, businessId: ids.business, role: 'ADMIN' }
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

test('the last active non-expiring Administrator cannot be revoked', async () => {
	const refused = await revokeStaffGrant(actor, {
		operationKey: randomUUID(),
		grantId: ids.firstGrant
	})
	assert.equal(refused.ok, false)
	if (!refused.ok) assert.equal(refused.error.code, 'INVALID_STATE')
	assert.equal(
		(await getPrisma().staffGrant.findUnique({ where: { id: ids.firstGrant } }))?.revokedAt,
		null
	)

	await getPrisma().applicationUser.create({
		data: {
			id: ids.secondUser,
			providerUserId: ids.secondProvider,
			loginId: 'admin2',
			normalizedLoginId: 'admin2',
			normalizedEmail: 'second-admin@urbanledger.test',
			displayName: 'Second Administrator',
			status: 'ACTIVE'
		}
	})
	await getPrisma().staffGrant.create({
		data: { id: ids.secondGrant, userId: ids.secondUser, businessId: ids.business, role: 'ADMIN' }
	})
	const revoked = await revokeStaffGrant(actor, {
		operationKey: randomUUID(),
		grantId: ids.firstGrant
	})
	assert.equal(revoked.ok, true)
	assert.ok((await getPrisma().staffGrant.findUnique({ where: { id: ids.firstGrant } }))?.revokedAt)
})
