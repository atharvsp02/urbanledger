import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	createVendorBillInputSchema,
	getVendorBillInputSchema,
	postVendorBillInputSchema,
	updateDraftVendorBillInputSchema,
	vendorBillDetailSchema,
	vendorBillListInputSchema,
	vendorBillTransitionInputSchema,
	type CreateVendorBillInput,
	type GetVendorBillInput,
	type PostVendorBillInput,
	type UpdateDraftVendorBillInput,
	type VendorBillDetail,
	type VendorBillListInput,
	type VendorBillListResult,
	type VendorBillOptions,
	type VendorBillTransitionInput
} from '@/lib/contracts/vendor-bill'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import {
	assertJournalAmountRange,
	formatJournalAmount,
	sumJournalAmounts,
	zeroJournalAmount
} from '@/server/accounting/money'
import {
	allocateJournalEntryNumber,
	assertAccountingDateUnlocked,
	commitPostedJournalEntry,
	type PostedJournalLine
} from '@/server/accounting/posting-kernel'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { resolvePage } from '@/server/masters/pagination'
import { executePurchasingOperation, purchasingRequestHash } from '@/server/purchasing/operation'
import { allocatePurchaseDocumentNumber } from '@/server/purchasing/sequences'

type PurchaseTransaction = Prisma.TransactionClient

type TaxDependency = {
	id: string
	name: string
	rate: Prisma.Decimal
	revision: number
	inputAccountId: string
}

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the Vendor Bill details.',
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
			message: 'The Vendor Bill request could not be completed.',
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

function calculateTaxAmount(netAmount: Prisma.Decimal, rate: Prisma.Decimal) {
	const amount = new Prisma.Decimal(formatJournalAmount(netAmount.times(rate).div(100)))
	assertJournalAmountRange(amount)
	return amount
}

async function loadVendorBillDetail(
	transaction: PurchaseTransaction,
	businessId: string,
	vendorBillId: string
): Promise<VendorBillDetail> {
	const bill = await transaction.financialDocument.findFirst({
		where: { id: vendorBillId, businessId, kind: 'VENDOR_BILL' },
		include: {
			createdBy: { select: { id: true, displayName: true } },
			journalEntry: { select: { id: true, reference: true } },
			lines: {
				include: { analyticAccount: { select: { id: true, name: true } } },
				orderBy: [{ position: 'asc' }, { id: 'asc' }]
			}
		}
	})

	if (!bill) throw new ApplicationError('NOT_FOUND', 'This Vendor Bill does not exist.')

	return {
		id: bill.id,
		billNumber: bill.number,
		billDate: dateOnly(bill.documentDate),
		dueDate: dateOnly(bill.dueDate),
		vendorReference: bill.externalReference,
		state: bill.state,
		netTotal: formatJournalAmount(bill.netTotal),
		taxTotal: formatJournalAmount(bill.taxTotal),
		total: formatJournalAmount(bill.total),
		revision: bill.revision,
		vendor: { id: bill.contactId, name: bill.contactNameSnapshot },
		sourceOrder: { id: bill.sourceOrderId, orderNumber: bill.sourceOrderNumberSnapshot },
		journalEntry: bill.journalEntry,
		createdBy: bill.createdBy,
		createdAt: bill.createdAt.toISOString(),
		updatedAt: bill.updatedAt.toISOString(),
		lines: bill.lines.map((line) => {
			const hasTax = line.taxId !== null
			if (
				hasTax !==
				(line.taxNameSnapshot !== null &&
					line.taxRateSnapshot !== null &&
					line.taxRevisionSnapshot !== null)
			) {
				throw new ApplicationError('INVALID_STATE', 'A Vendor Bill tax snapshot is incomplete.')
			}

			return {
				id: line.id,
				position: line.position,
				sourceOrderLineId: line.sourceOrderLineId,
				productId: line.productId,
				productName: line.productNameSnapshot,
				quantity: line.quantity.toFixed(4),
				unitPrice: line.unitPriceSnapshot.toFixed(4),
				lineNetTotal: formatJournalAmount(line.lineNetTotal),
				tax: hasTax
					? {
							id: line.taxId!,
							name: line.taxNameSnapshot!,
							rate: line.taxRateSnapshot!.toFixed(4)
						}
					: null,
				taxAmount: formatJournalAmount(line.taxAmount),
				lineTotal: formatJournalAmount(line.lineTotal),
				analyticAccount: line.analyticAccount
			}
		})
	}
}

async function loadTaxDependencies(
	transaction: PurchaseTransaction,
	businessId: string,
	taxIds: string[]
) {
	const taxes = await transaction.tax.findMany({
		where: { id: { in: taxIds }, businessId },
		include: { inputAccount: true }
	})

	if (taxes.length !== taxIds.length) {
		throw new ApplicationError('NOT_FOUND', 'A selected purchase tax was not found.')
	}

	const dependencies = new Map<string, TaxDependency>()
	for (const tax of taxes) {
		if (tax.archivedAt) {
			throw new ApplicationError('ARCHIVED_DEPENDENCY', 'Choose an active purchase tax.')
		}
		if (tax.scope !== 'PURCHASE' && tax.scope !== 'BOTH') {
			throw new ApplicationError('INVALID_STATE', 'Choose a Purchase or Both tax.')
		}
		if (
			!tax.inputAccountId ||
			!tax.inputAccount ||
			tax.inputAccount.businessId !== businessId ||
			tax.inputAccount.archivedAt ||
			tax.inputAccount.type !== 'ASSET' ||
			tax.inputAccount.subtype !== 'INPUT_TAX'
		) {
			throw new ApplicationError(
				'INVALID_STATE',
				'The purchase tax requires an active Input Tax account.'
			)
		}

		dependencies.set(tax.id, {
			id: tax.id,
			name: tax.name,
			rate: tax.rate,
			revision: tax.revision,
			inputAccountId: tax.inputAccountId
		})
	}

	return dependencies
}

async function loadAnalyticDependencies(
	transaction: PurchaseTransaction,
	businessId: string,
	analyticAccountIds: string[]
) {
	const accounts = await transaction.analyticAccount.findMany({
		where: { id: { in: analyticAccountIds }, businessId }
	})

	if (accounts.length !== analyticAccountIds.length) {
		throw new ApplicationError('NOT_FOUND', 'A selected expense analytic account was not found.')
	}
	if (accounts.some((account) => account.archivedAt)) {
		throw new ApplicationError('ARCHIVED_DEPENDENCY', 'Choose active expense analytic accounts.')
	}
	if (accounts.some((account) => account.type !== 'EXPENSE')) {
		throw new ApplicationError('INVALID_STATE', 'Choose Expense analytic accounts.')
	}

	return new Map(accounts.map((account) => [account.id, account]))
}

export async function createVendorBillFromPurchaseOrder(
	actor: Actor,
	input: CreateVendorBillInput
): Promise<ActionResult<VendorBillDetail>> {
	const parsed = createVendorBillInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)

	const operation = 'vendor_bill.create'
	const hash = purchasingRequestHash({
		operation,
		actorUserId: actor.userId,
		purchaseOrderId: parsed.data.purchaseOrderId,
		expectedPurchaseOrderRevision: parsed.data.expectedPurchaseOrderRevision,
		billDate: parsed.data.billDate,
		dueDate: parsed.data.dueDate,
		vendorReference: parsed.data.vendorReference ?? null
	})

	try {
		const result = await executePurchasingOperation({
			actor,
			capability: 'transactions:create',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = vendorBillDetailSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (bill) => bill.id,
			command: async (transaction) => {
				const order = await transaction.order.findFirst({
					where: {
						id: parsed.data.purchaseOrderId,
						businessId: actor.businessId,
						kind: 'PURCHASE'
					},
					include: {
						contact: true,
						purchaseReceipt: { select: { id: true } },
						financialDocuments: {
							where: { kind: 'VENDOR_BILL', state: { not: 'CANCELLED' } },
							select: { id: true }
						},
						lines: {
							include: { product: { select: { businessId: true } } },
							orderBy: [{ position: 'asc' }, { id: 'asc' }]
						}
					}
				})

				if (!order) throw new ApplicationError('NOT_FOUND', 'This purchase order does not exist.')
				if (order.revision !== parsed.data.expectedPurchaseOrderRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This purchase order changed. Reload it and try again.'
					)
				}
				if (order.state !== 'CONFIRMED' || !order.purchaseReceipt) {
					throw new ApplicationError(
						'INVALID_STATE',
						'A Vendor Bill requires a confirmed, fully received purchase order.'
					)
				}
				if (order.financialDocuments.length > 0) {
					throw new ApplicationError(
						'INVALID_STATE',
						'An active Vendor Bill already exists for this purchase order.'
					)
				}
				if (
					order.contact.businessId !== actor.businessId ||
					order.contact.archivedAt ||
					(order.contact.kind !== 'VENDOR' && order.contact.kind !== 'BOTH')
				) {
					throw new ApplicationError('ARCHIVED_DEPENDENCY', 'The purchase vendor is unavailable.')
				}
				if (order.lines.some((line) => line.product.businessId !== actor.businessId)) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The purchase order contains a product outside the current business.'
					)
				}

				const claimed = await transaction.order.updateMany({
					where: {
						id: order.id,
						businessId: actor.businessId,
						kind: 'PURCHASE',
						state: 'CONFIRMED',
						revision: parsed.data.expectedPurchaseOrderRevision
					},
					data: { revision: { increment: 1 } }
				})

				if (claimed.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This purchase order changed. Reload it and try again.'
					)
				}

				const billNumber = await allocatePurchaseDocumentNumber(
					transaction,
					actor.businessId,
					'VENDOR_BILL',
					parsed.data.billDate,
					'BILL'
				)
				const bill = await transaction.financialDocument.create({
					data: {
						businessId: actor.businessId,
						kind: 'VENDOR_BILL',
						contactId: order.contactId,
						sourceOrderId: order.id,
						number: billNumber,
						documentDate: businessDate(parsed.data.billDate),
						dueDate: businessDate(parsed.data.dueDate),
						externalReference: parsed.data.vendorReference ?? null,
						contactNameSnapshot: order.contact.name,
						sourceOrderNumberSnapshot: order.number,
						netTotal: order.total,
						taxTotal: '0.00',
						total: order.total,
						createdById: actor.userId
					},
					select: { id: true }
				})

				await transaction.financialDocumentLine.createMany({
					data: order.lines.map((line) => ({
						documentId: bill.id,
						sourceOrderLineId: line.id,
						productId: line.productId,
						productNameSnapshot: line.productNameSnapshot,
						quantity: line.quantity,
						unitPriceSnapshot: line.unitPriceSnapshot,
						lineNetTotal: line.lineTotal,
						taxAmount: '0.00',
						lineTotal: line.lineTotal,
						position: line.position
					}))
				})

				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'vendor_bill.created',
						targetType: 'FinancialDocument',
						targetId: bill.id,
						requestId: parsed.data.operationKey,
						details: { billNumber, purchaseOrderId: order.id, purchaseOrderNumber: order.number }
					}
				})

				return loadVendorBillDetail(transaction, actor.businessId, bill.id)
			}
		})

		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function updateDraftVendorBill(
	actor: Actor,
	input: UpdateDraftVendorBillInput
): Promise<ActionResult<VendorBillDetail>> {
	const parsed = updateDraftVendorBillInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)

	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:create')
				const bill = await transaction.financialDocument.findFirst({
					where: {
						id: parsed.data.vendorBillId,
						businessId: actor.businessId,
						kind: 'VENDOR_BILL'
					},
					include: { lines: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } }
				})

				if (!bill) throw new ApplicationError('NOT_FOUND', 'This Vendor Bill does not exist.')
				if (bill.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Vendor Bill changed. Reload it and try again.'
					)
				}
				if (bill.state !== 'DRAFT') {
					throw new ApplicationError('INVALID_STATE', 'Only draft Vendor Bills can be changed.')
				}

				const selectionByLineId = new Map(
					parsed.data.lines.map((line) => [line.lineId, line] as const)
				)
				if (
					selectionByLineId.size !== bill.lines.length ||
					bill.lines.some((line) => !selectionByLineId.has(line.id))
				) {
					throw new ApplicationError(
						'VALIDATION_ERROR',
						'Tax and analytic selections must be supplied once for every Vendor Bill line.'
					)
				}

				const taxIds = [
					...new Set(parsed.data.lines.flatMap((line) => (line.taxId ? [line.taxId] : [])))
				]
				const analyticIds = [
					...new Set(
						parsed.data.lines.flatMap((line) =>
							line.analyticAccountId ? [line.analyticAccountId] : []
						)
					)
				]
				const taxes = await loadTaxDependencies(transaction, actor.businessId, taxIds)
				await loadAnalyticDependencies(transaction, actor.businessId, analyticIds)
				const taxAmounts: Prisma.Decimal[] = []

				for (const line of bill.lines) {
					const selection = selectionByLineId.get(line.id)!
					const tax = selection.taxId ? taxes.get(selection.taxId) : null
					const taxAmount = tax
						? calculateTaxAmount(line.lineNetTotal, tax.rate)
						: zeroJournalAmount()
					taxAmounts.push(taxAmount)

					await transaction.financialDocumentLine.update({
						where: { id: line.id },
						data: {
							taxId: tax?.id ?? null,
							taxNameSnapshot: tax?.name ?? null,
							taxRateSnapshot: tax?.rate ?? null,
							taxRevisionSnapshot: tax?.revision ?? null,
							taxAmount: formatJournalAmount(taxAmount),
							lineTotal: formatJournalAmount(line.lineNetTotal.plus(taxAmount)),
							analyticAccountId: selection.analyticAccountId
						}
					})
				}

				const taxTotal = sumJournalAmounts(taxAmounts)
				const updated = await transaction.financialDocument.updateMany({
					where: {
						id: bill.id,
						businessId: actor.businessId,
						kind: 'VENDOR_BILL',
						state: 'DRAFT',
						revision: parsed.data.expectedRevision
					},
					data: {
						documentDate: businessDate(parsed.data.billDate),
						dueDate: businessDate(parsed.data.dueDate),
						externalReference: parsed.data.vendorReference ?? null,
						taxTotal: formatJournalAmount(taxTotal),
						total: formatJournalAmount(bill.netTotal.plus(taxTotal)),
						revision: { increment: 1 }
					}
				})

				if (updated.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Vendor Bill changed. Reload it and try again.'
					)
				}

				return loadVendorBillDetail(transaction, actor.businessId, bill.id)
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function cancelDraftVendorBill(
	actor: Actor,
	input: VendorBillTransitionInput
): Promise<ActionResult<VendorBillDetail>> {
	const parsed = vendorBillTransitionInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)

	const operation = 'vendor_bill.cancel'
	const hash = purchasingRequestHash({
		operation,
		actorUserId: actor.userId,
		vendorBillId: parsed.data.vendorBillId,
		expectedRevision: parsed.data.expectedRevision
	})

	try {
		const result = await executePurchasingOperation({
			actor,
			capability: 'transactions:create',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = vendorBillDetailSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (bill) => bill.id,
			command: async (transaction) => {
				const bill = await transaction.financialDocument.findFirst({
					where: {
						id: parsed.data.vendorBillId,
						businessId: actor.businessId,
						kind: 'VENDOR_BILL'
					},
					select: { id: true, state: true, revision: true }
				})
				if (!bill) throw new ApplicationError('NOT_FOUND', 'This Vendor Bill does not exist.')
				if (bill.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Vendor Bill changed. Reload it and try again.'
					)
				}
				if (bill.state !== 'DRAFT') {
					throw new ApplicationError('INVALID_STATE', 'Only a draft Vendor Bill can be cancelled.')
				}

				const updated = await transaction.financialDocument.updateMany({
					where: {
						id: bill.id,
						businessId: actor.businessId,
						state: 'DRAFT',
						revision: parsed.data.expectedRevision
					},
					data: { state: 'CANCELLED', revision: { increment: 1 } }
				})
				if (updated.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Vendor Bill changed. Reload it and try again.'
					)
				}

				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'vendor_bill.cancelled',
						targetType: 'FinancialDocument',
						targetId: bill.id,
						requestId: parsed.data.operationKey
					}
				})

				return loadVendorBillDetail(transaction, actor.businessId, bill.id)
			}
		})

		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function postVendorBill(
	actor: Actor,
	input: PostVendorBillInput
): Promise<ActionResult<VendorBillDetail>> {
	const parsed = postVendorBillInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)

	const operation = 'vendor_bill.post'
	const hash = purchasingRequestHash({
		operation,
		actorUserId: actor.userId,
		vendorBillId: parsed.data.vendorBillId,
		expectedRevision: parsed.data.expectedRevision,
		journalId: parsed.data.journalId
	})

	try {
		const result = await executePurchasingOperation({
			actor,
			capability: 'transactions:post',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = vendorBillDetailSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (bill) => bill.id,
			command: async (transaction, accountingLockDate) => {
				const bill = await transaction.financialDocument.findFirst({
					where: {
						id: parsed.data.vendorBillId,
						businessId: actor.businessId,
						kind: 'VENDOR_BILL'
					},
					include: { contact: true, lines: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } }
				})
				if (!bill) throw new ApplicationError('NOT_FOUND', 'This Vendor Bill does not exist.')
				if (bill.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Vendor Bill changed. Reload it and try again.'
					)
				}
				if (bill.state !== 'DRAFT') {
					throw new ApplicationError('INVALID_STATE', 'Only a draft Vendor Bill can be posted.')
				}
				assertAccountingDateUnlocked(dateOnly(bill.documentDate), accountingLockDate)

				if (
					bill.contact.businessId !== actor.businessId ||
					bill.contact.archivedAt ||
					(bill.contact.kind !== 'VENDOR' && bill.contact.kind !== 'BOTH')
				) {
					throw new ApplicationError(
						'ARCHIVED_DEPENDENCY',
						'The Vendor Bill vendor is unavailable.'
					)
				}

				const journal = await transaction.journal.findFirst({
					where: { id: parsed.data.journalId, businessId: actor.businessId },
					include: { defaultExpenseAccount: true, defaultControlAccount: true }
				})
				if (!journal || journal.archivedAt || journal.type !== 'PURCHASE') {
					throw new ApplicationError('INVALID_STATE', 'Choose an active Purchase journal.')
				}
				if (
					!journal.defaultExpenseAccount ||
					journal.defaultExpenseAccount.businessId !== actor.businessId ||
					journal.defaultExpenseAccount.archivedAt ||
					journal.defaultExpenseAccount.type !== 'EXPENSE' ||
					journal.defaultExpenseAccount.subtype !== 'GENERAL'
				) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The Purchase journal requires an active Expense default account.'
					)
				}
				if (
					!journal.defaultControlAccount ||
					journal.defaultControlAccount.businessId !== actor.businessId ||
					journal.defaultControlAccount.archivedAt ||
					journal.defaultControlAccount.type !== 'LIABILITY' ||
					journal.defaultControlAccount.subtype !== 'PAYABLE'
				) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The Purchase journal requires an active Payable default account.'
					)
				}

				const taxIds = [...new Set(bill.lines.flatMap((line) => (line.taxId ? [line.taxId] : [])))]
				const analyticIds = [
					...new Set(
						bill.lines.flatMap((line) => (line.analyticAccountId ? [line.analyticAccountId] : []))
					)
				]
				const taxes = await loadTaxDependencies(transaction, actor.businessId, taxIds)
				await loadAnalyticDependencies(transaction, actor.businessId, analyticIds)
				const expenseLines: PostedJournalLine[] = []
				const taxLines: PostedJournalLine[] = []
				const recalculatedTaxAmounts: Prisma.Decimal[] = []

				for (const line of bill.lines) {
					if (line.lineNetTotal.greaterThan(0)) {
						expenseLines.push({
							accountId: journal.defaultExpenseAccount.id,
							contactId: bill.contactId,
							analyticAccountId: line.analyticAccountId,
							description: `${bill.number}: ${line.productNameSnapshot}`,
							debit: line.lineNetTotal,
							credit: zeroJournalAmount()
						})
					}

					if (line.taxId) {
						const tax = taxes.get(line.taxId)
						if (
							!tax ||
							line.taxRevisionSnapshot !== tax.revision ||
							line.taxNameSnapshot !== tax.name ||
							!line.taxRateSnapshot?.equals(tax.rate)
						) {
							throw new ApplicationError(
								'STALE_REVISION',
								'A selected tax changed. Update the draft Vendor Bill before posting.'
							)
						}

						const taxAmount = calculateTaxAmount(line.lineNetTotal, tax.rate)
						recalculatedTaxAmounts.push(taxAmount)
						if (
							!line.taxAmount.equals(taxAmount) ||
							!line.lineTotal.equals(line.lineNetTotal.plus(taxAmount))
						) {
							throw new ApplicationError(
								'INVALID_STATE',
								'The Vendor Bill tax totals are inconsistent.'
							)
						}
						if (taxAmount.greaterThan(0)) {
							taxLines.push({
								accountId: tax.inputAccountId,
								contactId: bill.contactId,
								analyticAccountId: null,
								description: `${bill.number}: ${tax.name}`,
								debit: taxAmount,
								credit: zeroJournalAmount()
							})
						}
					} else {
						recalculatedTaxAmounts.push(zeroJournalAmount())
						if (!line.taxAmount.isZero() || !line.lineTotal.equals(line.lineNetTotal)) {
							throw new ApplicationError(
								'INVALID_STATE',
								'The Vendor Bill line totals are inconsistent.'
							)
						}
					}
				}

				const taxTotal = sumJournalAmounts(recalculatedTaxAmounts)
				const total = bill.netTotal.plus(taxTotal)
				if (!bill.taxTotal.equals(taxTotal) || !bill.total.equals(total) || total.isZero()) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The Vendor Bill totals are invalid for posting.'
					)
				}

				const entryNumber = await allocateJournalEntryNumber(
					transaction,
					actor.businessId,
					dateOnly(bill.documentDate)
				)
				const entry = await commitPostedJournalEntry(transaction, {
					businessId: actor.businessId,
					journalId: journal.id,
					postingDate: bill.documentDate,
					reference: entryNumber,
					source: 'VENDOR_BILL',
					sourceReference: bill.id,
					createdById: actor.userId,
					lines: [
						...expenseLines,
						...taxLines,
						{
							accountId: journal.defaultControlAccount.id,
							contactId: bill.contactId,
							analyticAccountId: null,
							description: bill.number,
							debit: zeroJournalAmount(),
							credit: total
						}
					]
				})

				const updated = await transaction.financialDocument.updateMany({
					where: {
						id: bill.id,
						businessId: actor.businessId,
						kind: 'VENDOR_BILL',
						state: 'DRAFT',
						revision: parsed.data.expectedRevision
					},
					data: {
						state: 'POSTED',
						journalEntryId: entry.entryId,
						revision: { increment: 1 }
					}
				})
				if (updated.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Vendor Bill changed. Reload it and try again.'
					)
				}

				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'vendor_bill.posted',
						targetType: 'FinancialDocument',
						targetId: bill.id,
						requestId: parsed.data.operationKey,
						details: {
							billNumber: bill.number,
							entryId: entry.entryId,
							entryNumber,
							netTotal: formatJournalAmount(bill.netTotal),
							taxTotal: formatJournalAmount(taxTotal),
							total: formatJournalAmount(total)
						}
					}
				})

				return loadVendorBillDetail(transaction, actor.businessId, bill.id)
			}
		})

		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function getVendorBill(
	actor: Actor,
	input: GetVendorBillInput
): Promise<ActionResult<VendorBillDetail>> {
	const parsed = getVendorBillInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)

	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
			return loadVendorBillDetail(transaction, actor.businessId, parsed.data.vendorBillId)
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function listVendorBills(
	actor: Actor,
	input: VendorBillListInput = {}
): Promise<ActionResult<VendorBillListResult>> {
	const parsed = vendorBillListInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)

	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				const where: Prisma.FinancialDocumentWhereInput = {
					businessId: actor.businessId,
					kind: 'VENDOR_BILL',
					...(parsed.data.state === 'ALL' ? {} : { state: parsed.data.state })
				}
				const totalCount = await transaction.financialDocument.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const bills = await transaction.financialDocument.findMany({
					where,
					include: {
						createdBy: { select: { id: true, displayName: true } },
						journalEntry: { select: { id: true, reference: true } }
					},
					orderBy: [{ documentDate: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})

				return {
					rows: bills.map((bill) => ({
						id: bill.id,
						billNumber: bill.number,
						billDate: dateOnly(bill.documentDate),
						dueDate: dateOnly(bill.dueDate),
						vendorReference: bill.externalReference,
						state: bill.state,
						netTotal: formatJournalAmount(bill.netTotal),
						taxTotal: formatJournalAmount(bill.taxTotal),
						total: formatJournalAmount(bill.total),
						revision: bill.revision,
						vendor: { id: bill.contactId, name: bill.contactNameSnapshot },
						sourceOrder: {
							id: bill.sourceOrderId,
							orderNumber: bill.sourceOrderNumberSnapshot
						},
						journalEntry: bill.journalEntry,
						createdBy: bill.createdBy,
						createdAt: bill.createdAt.toISOString(),
						updatedAt: bill.updatedAt.toISOString()
					})),
					totalCount,
					page,
					pageSize: parsed.data.pageSize,
					lastPage
				} satisfies VendorBillListResult
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getVendorBillOptions(actor: Actor): Promise<ActionResult<VendorBillOptions>> {
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				const [journals, taxes, analyticAccounts] = await Promise.all([
					transaction.journal.findMany({
						where: {
							businessId: actor.businessId,
							type: 'PURCHASE',
							archivedAt: null,
							defaultExpenseAccount: {
								is: {
									businessId: actor.businessId,
									archivedAt: null,
									type: 'EXPENSE',
									subtype: 'GENERAL'
								}
							},
							defaultControlAccount: {
								is: {
									businessId: actor.businessId,
									archivedAt: null,
									type: 'LIABILITY',
									subtype: 'PAYABLE'
								}
							}
						},
						select: { id: true, code: true, name: true },
						orderBy: [{ name: 'asc' }, { id: 'asc' }]
					}),
					transaction.tax.findMany({
						where: {
							businessId: actor.businessId,
							archivedAt: null,
							scope: { in: ['PURCHASE', 'BOTH'] },
							inputAccount: {
								is: {
									businessId: actor.businessId,
									archivedAt: null,
									type: 'ASSET',
									subtype: 'INPUT_TAX'
								}
							}
						},
						select: { id: true, name: true, rate: true },
						orderBy: [{ name: 'asc' }, { id: 'asc' }]
					}),
					transaction.analyticAccount.findMany({
						where: { businessId: actor.businessId, type: 'EXPENSE', archivedAt: null },
						select: { id: true, name: true },
						orderBy: [{ name: 'asc' }, { id: 'asc' }]
					})
				])

				return {
					purchaseJournals: journals,
					taxes: taxes.map((tax) => ({ ...tax, rate: tax.rate.toFixed(4) })),
					expenseAnalyticAccounts: analyticAccounts
				} satisfies VendorBillOptions
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
