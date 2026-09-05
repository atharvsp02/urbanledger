import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	businessSettingsSchema,
	businessSetupResultSchema,
	completeBusinessSetupInputSchema,
	updateAccountingLockDateInputSchema,
	updateBusinessSettingsInputSchema,
	type BusinessSettings,
	type BusinessSetupResult,
	type CompleteBusinessSetupInput,
	type OpeningBalanceOptions,
	type SetupReadiness,
	type UpdateAccountingLockDateInput,
	type UpdateBusinessSettingsInput
} from '@/lib/contracts/business'
import {
	allocateJournalEntryNumber,
	assertAccountingDateUnlocked,
	commitPostedJournalEntry
} from '@/server/accounting/posting-kernel'
import {
	formatJournalAmount,
	parseJournalAmount,
	sumJournalAmounts
} from '@/server/accounting/money'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import { assertNotFutureBusinessDate } from '@/server/business/dates'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import {
	canonicalRequestHash,
	executeIdempotentOperation
} from '@/server/operations/command-operation'

type BusinessTransaction = Prisma.TransactionClient

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the company settings.',
			z.flattenError(error).fieldErrors
		).toActionError()
	}
}

function actionFailure(error: unknown, requestId?: string): ActionResult<never> {
	if (error instanceof ApplicationError) {
		return { ok: false, error: error.toActionError(requestId) }
	}
	return {
		ok: false,
		error: {
			code: 'DATABASE_UNAVAILABLE',
			message: 'The company settings request could not be completed.',
			...(requestId ? { requestId } : {})
		}
	}
}

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

function businessDate(value: string) {
	return new Date(`${value}T00:00:00.000Z`)
}

function toSettings(business: {
	id: string
	name: string
	addressLine1: string | null
	addressLine2: string | null
	city: string | null
	state: string | null
	postalCode: string | null
	country: string
	currency: string
	timezone: string
	fiscalYearStartMonth: number
	fiscalYearStartDay: number
	accountingLockDate: Date | null
	purchaseOrderPrefix: string
	salesOrderPrefix: string
	purchaseReceiptPrefix: string
	salesDeliveryPrefix: string
	customerInvoicePrefix: string
	vendorBillPrefix: string
	customerPaymentPrefix: string
	vendorPaymentPrefix: string
	journalEntryPrefix: string
	revision: number
	readyAt: Date | null
}): BusinessSettings {
	return {
		id: business.id,
		name: business.name,
		addressLine1: business.addressLine1,
		addressLine2: business.addressLine2,
		city: business.city,
		state: business.state,
		postalCode: business.postalCode,
		country: business.country,
		currency: business.currency,
		timezone: business.timezone,
		fiscalYearStartMonth: business.fiscalYearStartMonth,
		fiscalYearStartDay: business.fiscalYearStartDay,
		accountingLockDate: business.accountingLockDate ? dateOnly(business.accountingLockDate) : null,
		purchaseOrderPrefix: business.purchaseOrderPrefix,
		salesOrderPrefix: business.salesOrderPrefix,
		purchaseReceiptPrefix: business.purchaseReceiptPrefix,
		salesDeliveryPrefix: business.salesDeliveryPrefix,
		customerInvoicePrefix: business.customerInvoicePrefix,
		vendorBillPrefix: business.vendorBillPrefix,
		customerPaymentPrefix: business.customerPaymentPrefix,
		vendorPaymentPrefix: business.vendorPaymentPrefix,
		journalEntryPrefix: business.journalEntryPrefix,
		revision: business.revision,
		setupCompletedAt: business.readyAt?.toISOString() ?? null
	}
}

async function loadSettings(transaction: BusinessTransaction, businessId: string) {
	const business = await transaction.business.findUnique({ where: { id: businessId } })
	if (!business) throw new ApplicationError('NOT_FOUND', 'This business does not exist.')
	return toSettings(business)
}

export async function calculateSetupReadiness(
	transaction: BusinessTransaction,
	businessId: string
): Promise<SetupReadiness> {
	const [business, accounts, journals] = await Promise.all([
		transaction.business.findUnique({ where: { id: businessId }, select: { readyAt: true } }),
		transaction.ledgerAccount.findMany({
			where: { businessId, archivedAt: null },
			select: { id: true, type: true, subtype: true }
		}),
		transaction.journal.findMany({
			where: { businessId, archivedAt: null },
			include: {
				defaultIncomeAccount: true,
				defaultExpenseAccount: true,
				defaultControlAccount: true,
				defaultLiquidityAccount: true
			}
		})
	])
	if (!business) throw new ApplicationError('NOT_FOUND', 'This business does not exist.')

	const missingRequirements: string[] = []
	const accountRequirements: Array<[string, (account: (typeof accounts)[number]) => boolean]> = [
		['Cash account', (account: (typeof accounts)[number]) => account.subtype === 'CASH'],
		['Bank account', (account: (typeof accounts)[number]) => account.subtype === 'BANK'],
		[
			'Receivable account',
			(account: (typeof accounts)[number]) => account.subtype === 'RECEIVABLE'
		],
		['Payable account', (account: (typeof accounts)[number]) => account.subtype === 'PAYABLE'],
		['Input Tax account', (account: (typeof accounts)[number]) => account.subtype === 'INPUT_TAX'],
		[
			'Output Tax account',
			(account: (typeof accounts)[number]) => account.subtype === 'OUTPUT_TAX'
		],
		['Income account', (account: (typeof accounts)[number]) => account.type === 'INCOME'],
		['Expense account', (account: (typeof accounts)[number]) => account.type === 'EXPENSE'],
		['Capital account', (account: (typeof accounts)[number]) => account.type === 'CAPITAL']
	]
	for (const [label, predicate] of accountRequirements) {
		if (!accounts.some(predicate)) missingRequirements.push(label)
	}

	const hasActiveAccount = (id: string | null | undefined, type: string, subtype = 'GENERAL') =>
		id !== null &&
		id !== undefined &&
		accounts.some(
			(account) => account.id === id && account.type === type && account.subtype === subtype
		)
	const hasJournal = (type: (typeof journals)[number]['type']) =>
		journals.some((j) => j.type === type)
	if (
		!journals.some(
			(journal) =>
				journal.type === 'SALES' &&
				hasActiveAccount(journal.defaultIncomeAccountId, 'INCOME') &&
				hasActiveAccount(journal.defaultControlAccountId, 'ASSET', 'RECEIVABLE')
		)
	) {
		missingRequirements.push('Sales journal with Income and Receivable defaults')
	}
	if (
		!journals.some(
			(journal) =>
				journal.type === 'PURCHASE' &&
				hasActiveAccount(journal.defaultExpenseAccountId, 'EXPENSE') &&
				hasActiveAccount(journal.defaultControlAccountId, 'LIABILITY', 'PAYABLE')
		)
	) {
		missingRequirements.push('Purchase journal with Expense and Payable defaults')
	}
	if (
		!journals.some(
			(journal) =>
				journal.type === 'BANK' &&
				hasActiveAccount(journal.defaultLiquidityAccountId, 'ASSET', 'BANK')
		)
	) {
		missingRequirements.push('Bank journal with Bank default')
	}
	if (
		!journals.some(
			(journal) =>
				journal.type === 'CASH' &&
				hasActiveAccount(journal.defaultLiquidityAccountId, 'ASSET', 'CASH')
		)
	) {
		missingRequirements.push('Cash journal with Cash default')
	}
	if (!hasJournal('GENERAL')) missingRequirements.push('General journal')
	if (!hasJournal('OPENING')) missingRequirements.push('Opening journal')

	return {
		isReadyToPost: missingRequirements.length === 0,
		isSetupComplete: business.readyAt !== null,
		missingRequirements,
		completedAt: business.readyAt?.toISOString() ?? null
	}
}

export async function getBusinessSettings(actor: Actor): Promise<ActionResult<BusinessSettings>> {
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
			return loadSettings(transaction, actor.businessId)
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getSetupReadiness(actor: Actor): Promise<ActionResult<SetupReadiness>> {
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
			return calculateSetupReadiness(transaction, actor.businessId)
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

function validateCalendarSettings(timezone: string, month: number, day: number) {
	try {
		new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
	} catch {
		throw new ApplicationError('VALIDATION_ERROR', 'Choose a valid IANA business timezone.')
	}
	const date = new Date(Date.UTC(2024, month - 1, day))
	if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
		throw new ApplicationError('VALIDATION_ERROR', 'Choose a valid fiscal-year start date.')
	}
}

export async function updateBusinessSettings(
	actor: Actor,
	input: UpdateBusinessSettingsInput
): Promise<ActionResult<BusinessSettings>> {
	const parsed = updateBusinessSettingsInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	validateCalendarSettings(
		parsed.data.timezone,
		parsed.data.fiscalYearStartMonth,
		parsed.data.fiscalYearStartDay
	)
	const operation = 'business.settings.update'
	const hash = canonicalRequestHash({ operation, actorUserId: actor.userId, ...parsed.data })
	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'business:manage',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = businessSettingsSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (settings) => settings.id,
			command: async (transaction) => {
				const current = await transaction.business.findUnique({ where: { id: actor.businessId } })
				if (!current) throw new ApplicationError('NOT_FOUND', 'This business does not exist.')
				if (current.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'Company settings changed. Reload and try again.'
					)
				}
				if (current.currency !== parsed.data.currency) {
					const postingCount = await transaction.journalEntry.count({
						where: { businessId: actor.businessId, state: 'POSTED' }
					})
					if (postingCount > 0) {
						throw new ApplicationError(
							'INVALID_STATE',
							'Currency cannot change after financial postings exist.'
						)
					}
				}
				const {
					operationKey: _operationKey,
					expectedRevision: _expectedRevision,
					...values
				} = parsed.data
				const updated = await transaction.business.updateMany({
					where: { id: actor.businessId, revision: parsed.data.expectedRevision },
					data: { ...values, revision: { increment: 1 } }
				})
				if (updated.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'Company settings changed. Reload and try again.'
					)
				}
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'business.settings.updated',
						targetType: 'Business',
						targetId: actor.businessId,
						requestId: parsed.data.operationKey
					}
				})
				return loadSettings(transaction, actor.businessId)
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function updateAccountingLockDate(
	actor: Actor,
	input: UpdateAccountingLockDateInput
): Promise<ActionResult<BusinessSettings>> {
	const parsed = updateAccountingLockDateInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation = 'business.accounting_lock.update'
	const hash = canonicalRequestHash({ operation, actorUserId: actor.userId, ...parsed.data })
	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'business:manage',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = businessSettingsSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (settings) => settings.id,
			command: async (transaction) => {
				const updated = await transaction.business.updateMany({
					where: { id: actor.businessId, revision: parsed.data.expectedRevision },
					data: {
						accountingLockDate: parsed.data.lockDate ? businessDate(parsed.data.lockDate) : null,
						revision: { increment: 1 }
					}
				})
				if (updated.count === 0) {
					const exists = await transaction.business.findUnique({ where: { id: actor.businessId } })
					if (!exists) throw new ApplicationError('NOT_FOUND', 'This business does not exist.')
					throw new ApplicationError(
						'STALE_REVISION',
						'Company settings changed. Reload and try again.'
					)
				}
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'business.accounting_lock.updated',
						targetType: 'Business',
						targetId: actor.businessId,
						requestId: parsed.data.operationKey,
						details: { lockDate: parsed.data.lockDate }
					}
				})
				return loadSettings(transaction, actor.businessId)
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function getOpeningBalanceOptions(
	actor: Actor
): Promise<ActionResult<OpeningBalanceOptions>> {
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
			const [openingJournals, liquidityAccounts, capitalAccounts] = await Promise.all([
				transaction.journal.findMany({
					where: { businessId: actor.businessId, type: 'OPENING', archivedAt: null },
					select: { id: true, code: true, name: true },
					orderBy: [{ name: 'asc' }, { id: 'asc' }]
				}),
				transaction.ledgerAccount.findMany({
					where: {
						businessId: actor.businessId,
						archivedAt: null,
						type: 'ASSET',
						subtype: { in: ['CASH', 'BANK'] }
					},
					select: { id: true, code: true, name: true, subtype: true },
					orderBy: [{ code: 'asc' }, { id: 'asc' }]
				}),
				transaction.ledgerAccount.findMany({
					where: { businessId: actor.businessId, archivedAt: null, type: 'CAPITAL' },
					select: { id: true, code: true, name: true },
					orderBy: [{ code: 'asc' }, { id: 'asc' }]
				})
			])
			return {
				openingJournals,
				liquidityAccounts: liquidityAccounts.map((account) => ({
					...account,
					subtype: account.subtype as 'CASH' | 'BANK'
				})),
				capitalAccounts
			} satisfies OpeningBalanceOptions
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function completeBusinessSetup(
	actor: Actor,
	input: CompleteBusinessSetupInput
): Promise<ActionResult<BusinessSetupResult>> {
	const parsed = completeBusinessSetupInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation = 'business.setup.complete'
	const balances = parsed.data.balances.map((balance) => ({
		accountId: balance.accountId,
		amount: formatJournalAmount(parseJournalAmount(balance.amount))
	}))
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		expectedRevision: parsed.data.expectedRevision,
		openingDate: parsed.data.openingDate,
		openingJournalId: parsed.data.openingJournalId,
		capitalAccountId: parsed.data.capitalAccountId,
		balances
	})
	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'business:manage',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = businessSetupResultSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (setup) => setup.settings.id,
			command: async (transaction, accountingLockDate, businessTimezone) => {
				const business = await transaction.business.findUnique({ where: { id: actor.businessId } })
				if (!business) throw new ApplicationError('NOT_FOUND', 'This business does not exist.')
				if (business.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'Company settings changed. Reload and try again.'
					)
				}
				if (business.readyAt) {
					throw new ApplicationError('INVALID_STATE', 'Business setup is already complete.')
				}
				const readiness = await calculateSetupReadiness(transaction, actor.businessId)
				if (!readiness.isReadyToPost) {
					throw new ApplicationError(
						'INVALID_STATE',
						`Complete required accounting configuration: ${readiness.missingRequirements.join(', ')}.`
					)
				}
				assertAccountingDateUnlocked(parsed.data.openingDate, accountingLockDate)
				assertNotFutureBusinessDate(parsed.data.openingDate, businessTimezone, 'Opening date')
				const [journal, capitalAccount, liquidityAccounts] = await Promise.all([
					transaction.journal.findFirst({
						where: {
							id: parsed.data.openingJournalId,
							businessId: actor.businessId,
							type: 'OPENING',
							archivedAt: null
						}
					}),
					transaction.ledgerAccount.findFirst({
						where: {
							id: parsed.data.capitalAccountId,
							businessId: actor.businessId,
							type: 'CAPITAL',
							archivedAt: null
						}
					}),
					transaction.ledgerAccount.findMany({
						where: {
							id: { in: balances.map((balance) => balance.accountId) },
							businessId: actor.businessId,
							type: 'ASSET',
							subtype: { in: ['CASH', 'BANK'] },
							archivedAt: null
						}
					})
				])
				if (!journal || !capitalAccount || liquidityAccounts.length !== balances.length) {
					throw new ApplicationError(
						'INVALID_STATE',
						'Choose active Opening, liquidity and Capital accounts from this business.'
					)
				}

				let openingEntry: BusinessSetupResult['openingEntry'] = null
				if (balances.length > 0) {
					const amounts = balances.map((balance) => parseJournalAmount(balance.amount))
					const total = sumJournalAmounts(amounts)
					const entryNumber = await allocateJournalEntryNumber(
						transaction,
						actor.businessId,
						parsed.data.openingDate
					)
					const entry = await commitPostedJournalEntry(transaction, {
						businessId: actor.businessId,
						journalId: journal.id,
						postingDate: businessDate(parsed.data.openingDate),
						reference: entryNumber,
						source: 'OPENING',
						sourceReference: actor.businessId,
						createdById: actor.userId,
						lines: [
							...balances.map((balance, index) => ({
								accountId: balance.accountId,
								contactId: null,
								analyticAccountId: null,
								description: 'Opening balance',
								debit: amounts[index]!,
								credit: new Prisma.Decimal('0')
							})),
							{
								accountId: capitalAccount.id,
								contactId: null,
								analyticAccountId: null,
								description: 'Opening capital',
								debit: new Prisma.Decimal('0'),
								credit: total
							}
						]
					})
					openingEntry = {
						entryId: entry.entryId,
						entryNumber,
						postingDate: parsed.data.openingDate,
						total: formatJournalAmount(total)
					}
				}

				await transaction.business.update({
					where: { id: actor.businessId },
					data: { readyAt: new Date(), revision: { increment: 1 } }
				})
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'business.setup.completed',
						targetType: 'Business',
						targetId: actor.businessId,
						requestId: parsed.data.operationKey,
						details: { openingEntryId: openingEntry?.entryId ?? null }
					}
				})
				return {
					settings: await loadSettings(transaction, actor.businessId),
					readiness: await calculateSetupReadiness(transaction, actor.businessId),
					openingEntry
				}
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}
