'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { AccessMutationResult, AccessUser } from '@/lib/contracts/access-administration'
import type { BusinessSettings, BusinessSetupResult } from '@/lib/contracts/business'
import type { ActionResult } from '@/lib/contracts/errors'
import { getActor } from '@/server/auth/actor'
import {
	createAdministrator,
	createContactUser,
	disableIdentity,
	restoreIdentity,
	retryPortalProvisioning,
	revokePortalAccess,
	revokeStaffGrant
} from '@/server/access'
import {
	completeBusinessSetup,
	updateAccountingLockDate,
	updateBusinessSettings
} from '@/server/business'

export type SettingsActionState = ActionResult<BusinessSettings> | null
export type SetupActionState = ActionResult<BusinessSetupResult> | null
export type AccessActionState = ActionResult<AccessUser> | null

export async function saveCompanySettingsAction(
	_state: SettingsActionState,
	formData: FormData
): Promise<SettingsActionState> {
	const actor = await getActor()
	const read = (key: string) => String(formData.get(key) ?? '')
	const optional = (key: string) => {
		const value = read(key).trim()
		return value === '' ? null : value
	}

	const result = await updateBusinessSettings(actor, {
		operationKey: read('operationKey'),
		expectedRevision: Number(formData.get('expectedRevision') ?? '0'),
		name: read('name'),
		addressLine1: optional('addressLine1'),
		addressLine2: optional('addressLine2'),
		city: optional('city'),
		state: optional('state'),
		postalCode: optional('postalCode'),
		country: read('country'),
		currency: read('currency'),
		timezone: read('timezone'),
		fiscalYearStartMonth: Number(formData.get('fiscalYearStartMonth') ?? '4'),
		fiscalYearStartDay: Number(formData.get('fiscalYearStartDay') ?? '1'),
		purchaseOrderPrefix: read('purchaseOrderPrefix'),
		salesOrderPrefix: read('salesOrderPrefix'),
		purchaseReceiptPrefix: read('purchaseReceiptPrefix'),
		salesDeliveryPrefix: read('salesDeliveryPrefix'),
		customerInvoicePrefix: read('customerInvoicePrefix'),
		vendorBillPrefix: read('vendorBillPrefix'),
		customerPaymentPrefix: read('customerPaymentPrefix'),
		vendorPaymentPrefix: read('vendorPaymentPrefix'),
		journalEntryPrefix: read('journalEntryPrefix')
	})

	if (result.ok) revalidatePath('/settings/company')

	return result
}

export async function saveAccountingLockDateAction(
	_state: SettingsActionState,
	formData: FormData
): Promise<SettingsActionState> {
	const actor = await getActor()
	const lockDate = String(formData.get('lockDate') ?? '').trim()
	const result = await updateAccountingLockDate(actor, {
		operationKey: String(formData.get('operationKey') ?? ''),
		expectedRevision: Number(formData.get('expectedRevision') ?? '0'),
		lockDate: lockDate === '' ? null : lockDate
	})

	if (result.ok) revalidatePath('/settings/company')

	return result
}

export async function completeSetupAction(
	_state: SetupActionState,
	formData: FormData
): Promise<SetupActionState> {
	const actor = await getActor()
	const accountIds = formData.getAll('balanceAccountId').map(String)
	const amounts = formData.getAll('balanceAmount').map(String)
	const balances = accountIds
		.map((accountId, index) => ({ accountId, amount: (amounts[index] ?? '').trim() }))
		.filter((balance) => balance.accountId !== '' && balance.amount !== '')

	const result = await completeBusinessSetup(actor, {
		operationKey: String(formData.get('operationKey') ?? ''),
		expectedRevision: Number(formData.get('expectedRevision') ?? '0'),
		openingDate: String(formData.get('openingDate') ?? ''),
		openingJournalId: String(formData.get('openingJournalId') ?? ''),
		capitalAccountId: String(formData.get('capitalAccountId') ?? ''),
		balances
	})

	if (result.ok) {
		revalidatePath('/setup')
		revalidatePath('/dashboard')
	}

	return result
}

export async function createAccessUserAction(
	_state: AccessActionState,
	formData: FormData
): Promise<AccessActionState> {
	const actor = await getActor()
	const role = String(formData.get('role') ?? 'ADMINISTRATOR')
	const operationKey = String(formData.get('operationKey') ?? '')
	const credentials = {
		loginId: String(formData.get('loginId') ?? ''),
		email: String(formData.get('email') ?? ''),
		password: String(formData.get('password') ?? ''),
		passwordConfirmation: String(formData.get('passwordConfirmation') ?? '')
	}

	const result =
		role === 'USER'
			? await createContactUser(actor, {
					operationKey,
					contactId: String(formData.get('contactId') ?? ''),
					...credentials
				})
			: await createAdministrator(actor, {
					operationKey,
					displayName: String(formData.get('displayName') ?? ''),
					...credentials
				})

	if (result.ok) {
		revalidatePath('/settings/access')
		redirect('/settings/access')
	}

	return result
}

export async function retryPortalProvisioningAction(
	_state: AccessActionState,
	formData: FormData
): Promise<AccessActionState> {
	const actor = await getActor()
	const result = await retryPortalProvisioning(actor, {
		operationKey: String(formData.get('operationKey') ?? ''),
		password: String(formData.get('password') ?? ''),
		passwordConfirmation: String(formData.get('passwordConfirmation') ?? '')
	})

	if (result.ok) revalidatePath('/settings/access')

	return result
}

async function runAccessMutation(run: () => Promise<ActionResult<AccessMutationResult>>) {
	const result = await run()

	if (!result.ok) throw new Error(result.error.message)

	revalidatePath('/settings/access')
}

export async function disableIdentityAction(userId: string, operationKey: string) {
	const actor = await getActor()
	await runAccessMutation(() => disableIdentity(actor, { operationKey, userId }))
}

export async function restoreIdentityAction(userId: string, operationKey: string) {
	const actor = await getActor()
	await runAccessMutation(() => restoreIdentity(actor, { operationKey, userId }))
}

export async function revokeStaffGrantAction(grantId: string, operationKey: string) {
	const actor = await getActor()
	await runAccessMutation(() => revokeStaffGrant(actor, { operationKey, grantId }))
}

export async function revokePortalAccessAction(portalAccessId: string, operationKey: string) {
	const actor = await getActor()
	await runAccessMutation(() => revokePortalAccess(actor, { operationKey, portalAccessId }))
}
