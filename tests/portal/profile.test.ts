import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { config as loadEnvironment } from 'dotenv'
import { Client } from 'pg'
import type { Actor } from '../../src/lib/contracts/access'
import { capabilitiesByRole } from '../../src/server/access/permissions'
import { getPrisma } from '../../src/server/db/prisma'
import { getPortalProfile, updatePortalProfile } from '../../src/server/portal/profile'

loadEnvironment({ path: '.env.local', quiet: true })

const ids = {
	business: 'bd000000-0000-4000-8000-000000000001',
	user: 'bd100000-0000-4000-8000-000000000001',
	providerUser: 'bd100000-0000-4000-8000-000000000101',
	contact: 'bd200000-0000-4000-8000-000000000001',
	portalAccess: 'bd300000-0000-4000-8000-000000000001'
} as const

const contactActor: Actor = {
	userId: ids.user,
	providerUserId: ids.providerUser,
	businessId: ids.business,
	role: 'CONTACT',
	contactId: ids.contact,
	displayName: 'Original Customer',
	capabilities: capabilitiesByRole.CONTACT
}

async function cleanup() {
	const connectionString = process.env.DIRECT_URL
	assert.ok(connectionString, 'DIRECT_URL is required for portal profile test cleanup.')
	const client = new Client({ connectionString })
	await client.connect()

	try {
		await client.query('BEGIN')
		await client.query('DELETE FROM app.audit_events WHERE "businessId" = $1::uuid', [ids.business])
		await client.query('DELETE FROM app.portal_access WHERE id = $1::uuid', [ids.portalAccess])
		await client.query('DELETE FROM app.contacts WHERE id = $1::uuid', [ids.contact])
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

before(async () => {
	await cleanup()
	const prisma = getPrisma()
	await prisma.business.create({
		data: {
			id: ids.business,
			slug: 'portal-profile-test',
			name: 'Portal Profile Test',
			readyAt: new Date()
		}
	})
	await prisma.applicationUser.create({
		data: {
			id: ids.user,
			providerUserId: ids.providerUser,
			loginId: 'profile1',
			normalizedLoginId: 'profile1',
			normalizedEmail: 'profile@urbanledger.test',
			displayName: contactActor.displayName,
			status: 'ACTIVE'
		}
	})
	await prisma.contact.create({
		data: {
			id: ids.contact,
			businessId: ids.business,
			kind: 'CUSTOMER',
			name: contactActor.displayName,
			email: 'original@example.test'
		}
	})
	await prisma.portalAccess.create({
		data: {
			id: ids.portalAccess,
			userId: ids.user,
			businessId: ids.business,
			contactId: ids.contact,
			status: 'ACTIVE'
		}
	})
})

after(async () => {
	await cleanup()
	await getPrisma().$disconnect()
})

test('updates only the linked Contact profile with revision protection', async () => {
	const initial = await getPortalProfile(contactActor)
	assert.equal(initial.ok, true)
	if (!initial.ok) return

	const updated = await updatePortalProfile(contactActor, {
		revision: initial.data.revision,
		name: 'Updated Customer',
		email: 'updated@example.test',
		mobile: '+91 98765 43210',
		street: '12 Market Road',
		city: 'Pune',
		state: 'Maharashtra',
		pincode: '411001'
	})

	assert.equal(updated.ok, true)
	if (!updated.ok) return
	assert.equal(updated.data.name, 'Updated Customer')
	assert.equal(updated.data.revision, initial.data.revision + 1)

	const identity = await getPrisma().applicationUser.findUnique({ where: { id: ids.user } })
	assert.equal(identity?.displayName, 'Updated Customer')
	assert.equal(identity?.normalizedEmail, 'profile@urbanledger.test')

	const stale = await updatePortalProfile(contactActor, {
		revision: initial.data.revision,
		name: 'Stale Change',
		email: '',
		mobile: '',
		street: '',
		city: '',
		state: '',
		pincode: ''
	})
	assert.equal(stale.ok, false)
	if (!stale.ok) assert.equal(stale.error.code, 'STALE_REVISION')

	const staffAttempt = await getPortalProfile({
		...contactActor,
		role: 'ACCOUNTANT',
		contactId: null,
		capabilities: capabilitiesByRole.ACCOUNTANT
	})
	assert.equal(staffAttempt.ok, false)
	if (!staffAttempt.ok) assert.equal(staffAttempt.error.code, 'FORBIDDEN')
})
