import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import {
	createCustomerInvoiceInputSchema,
	customerInvoiceDetailSchema,
	customerInvoiceListInputSchema,
	customerInvoiceTransitionInputSchema,
	getCustomerInvoiceInputSchema,
	postCustomerInvoiceInputSchema,
	updateDraftCustomerInvoiceInputSchema,
	type CreateCustomerInvoiceInput,
	type CustomerInvoiceDetail,
	type CustomerInvoiceListInput,
	type CustomerInvoiceListResult,
	type CustomerInvoiceOptions,
	type CustomerInvoiceSummary,
	type CustomerInvoiceTransitionInput,
	type GetCustomerInvoiceInput,
	type PostCustomerInvoiceInput,
	type UpdateDraftCustomerInvoiceInput
} from '@/lib/contracts/customer-invoice'
import type { ActionResult } from '@/lib/contracts/errors'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import {
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
import { allocateDocumentNumber } from '@/server/documents/sequences'
import { ApplicationError } from '@/server/errors/application-error'
import { resolvePage } from '@/server/masters/pagination'
import {
	canonicalRequestHash,
	executeIdempotentOperation
} from '@/server/operations/command-operation'

type SalesTransaction = Prisma.TransactionClient

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the Customer Invoice details.',
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
			message: 'The Customer Invoice request could not be completed.',
			...(requestId ? { requestId } : {})
		}
	}
}

function businessDate(value: string) {
	return new Date(`${value}T00:00:00.000Z`)
}

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

async function loadCustomerInvoiceDetail(
	transaction: SalesTransaction,
	businessId: string,
	customerInvoiceId: string
): Promise<CustomerInvoiceDetail> {
	const invoice = await transaction.financialDocument.findFirst({
		where: { id: customerInvoiceId, businessId, kind: 'CUSTOMER_INVOICE' },
		include: {
			createdBy: { select: { id: true, displayName: true } },
			journalEntry: { select: { id: true, reference: true } },
			lines: {
				include: { analyticAccount: { select: { id: true, name: true } } },
				orderBy: [{ position: 'asc' }, { id: 'asc' }]
			}
		}
	})
	if (!invoice) throw new ApplicationError('NOT_FOUND', 'This Customer Invoice does not exist.')

	return {
		id: invoice.id,
		invoiceNumber: invoice.number,
		invoiceDate: dateOnly(invoice.documentDate),
		dueDate: dateOnly(invoice.dueDate),
		reference: invoice.externalReference,
		state: invoice.state,
		netTotal: formatJournalAmount(invoice.netTotal),
		taxTotal: formatJournalAmount(invoice.taxTotal),
		total: formatJournalAmount(invoice.total),
		revision: invoice.revision,
		customer: { id: invoice.contactId, name: invoice.contactNameSnapshot },
		sourceOrder: { id: invoice.sourceOrderId, orderNumber: invoice.sourceOrderNumberSnapshot },
		journalEntry: invoice.journalEntry,
		createdBy: invoice.createdBy,
		createdAt: invoice.createdAt.toISOString(),
		updatedAt: invoice.updatedAt.toISOString(),
		lines: invoice.lines.map((line) => ({
			id: line.id,
			position: line.position,
			sourceOrderLineId: line.sourceOrderLineId,
			productId: line.productId,
			productName: line.productNameSnapshot,
			quantity: line.quantity.toFixed(4),
			unitPrice: line.unitPriceSnapshot.toFixed(4),
			lineNetTotal: formatJournalAmount(line.lineNetTotal),
			tax: line.taxId
				? { id: line.taxId, name: line.taxNameSnapshot!, rate: line.taxRateSnapshot!.toFixed(4) }
				: null,
			taxAmount: formatJournalAmount(line.taxAmount),
			lineTotal: formatJournalAmount(line.lineTotal),
			analyticAccount: line.analyticAccount
		}))
	}
}

export async function createCustomerInvoiceFromSalesOrder(
	actor: Actor,
	input: CreateCustomerInvoiceInput
): Promise<ActionResult<CustomerInvoiceDetail>> {
	const parsed = createCustomerInvoiceInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation = 'customer_invoice.create'
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		salesOrderId: parsed.data.salesOrderId,
		expectedSalesOrderRevision: parsed.data.expectedSalesOrderRevision,
		invoiceDate: parsed.data.invoiceDate,
		dueDate: parsed.data.dueDate,
		reference: parsed.data.reference ?? null
	})

	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'transactions:create',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = customerInvoiceDetailSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (invoice) => invoice.id,
			command: async (transaction) => {
				const order = await transaction.order.findFirst({
					where: { id: parsed.data.salesOrderId, businessId: actor.businessId, kind: 'SALES' },
					include: {
						contact: true,
						financialDocuments: {
							where: { kind: 'CUSTOMER_INVOICE', state: { not: 'CANCELLED' } },
							select: { id: true }
						},
						lines: {
							include: { product: { select: { businessId: true } } },
							orderBy: [{ position: 'asc' }, { id: 'asc' }]
						}
					}
				})
				if (!order) throw new ApplicationError('NOT_FOUND', 'This Sales Order does not exist.')
				if (order.revision !== parsed.data.expectedSalesOrderRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Sales Order changed. Reload it and try again.'
					)
				}
				if (order.state !== 'CONFIRMED') {
					throw new ApplicationError(
						'INVALID_STATE',
						'A Customer Invoice requires a confirmed Sales Order.'
					)
				}
				if (order.financialDocuments.length > 0) {
					throw new ApplicationError(
						'INVALID_STATE',
						'An active Customer Invoice already exists for this Sales Order.'
					)
				}
				if (
					order.contact.businessId !== actor.businessId ||
					order.lines.some((line) => line.product.businessId !== actor.businessId)
				) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The Sales Order contains a dependency outside the current business.'
					)
				}
				if (
					order.contact.archivedAt ||
					(order.contact.kind !== 'CUSTOMER' && order.contact.kind !== 'BOTH')
				) {
					throw new ApplicationError(
						'ARCHIVED_DEPENDENCY',
						'The Sales Order customer is unavailable.'
					)
				}
				for (const line of order.lines) {
					const hasTax = line.taxId !== null
					if (
						hasTax !==
						(line.taxNameSnapshot !== null &&
							line.taxRateSnapshot !== null &&
							line.taxRevisionSnapshot !== null &&
							line.taxAccountIdSnapshot !== null)
					) {
						throw new ApplicationError('INVALID_STATE', 'A Sales Order tax snapshot is incomplete.')
					}
				}

				const claimed = await transaction.order.updateMany({
					where: {
						id: order.id,
						businessId: actor.businessId,
						kind: 'SALES',
						state: 'CONFIRMED',
						revision: parsed.data.expectedSalesOrderRevision
					},
					data: { revision: { increment: 1 } }
				})
				if (claimed.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Sales Order changed. Reload it and try again.'
					)
				}

				const invoiceNumber = await allocateDocumentNumber(
					transaction,
					actor.businessId,
					'CUSTOMER_INVOICE',
					parsed.data.invoiceDate,
					'INV'
				)
				const invoice = await transaction.financialDocument.create({
					data: {
						businessId: actor.businessId,
						kind: 'CUSTOMER_INVOICE',
						contactId: order.contactId,
						sourceOrderId: order.id,
						number: invoiceNumber,
						documentDate: businessDate(parsed.data.invoiceDate),
						dueDate: businessDate(parsed.data.dueDate),
						externalReference: parsed.data.reference ?? null,
						contactNameSnapshot: order.contact.name,
						sourceOrderNumberSnapshot: order.number,
						netTotal: order.netTotal,
						taxTotal: order.taxTotal,
						total: order.total,
						createdById: actor.userId
					},
					select: { id: true }
				})
				await transaction.financialDocumentLine.createMany({
					data: order.lines.map((line) => ({
						documentId: invoice.id,
						sourceOrderLineId: line.id,
						productId: line.productId,
						productNameSnapshot: line.productNameSnapshot,
						quantity: line.quantity,
						unitPriceSnapshot: line.unitPriceSnapshot,
						lineNetTotal: line.lineTotal,
						taxId: line.taxId,
						taxNameSnapshot: line.taxNameSnapshot,
						taxRateSnapshot: line.taxRateSnapshot,
						taxRevisionSnapshot: line.taxRevisionSnapshot,
						taxAccountIdSnapshot: line.taxAccountIdSnapshot,
						taxAmount: line.taxAmount,
						lineTotal: line.grossTotal,
						analyticAccountId: line.analyticAccountId,
						position: line.position
					}))
				})
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'customer_invoice.created',
						targetType: 'FinancialDocument',
						targetId: invoice.id,
						requestId: parsed.data.operationKey,
						details: { invoiceNumber, salesOrderId: order.id, salesOrderNumber: order.number }
					}
				})
				return loadCustomerInvoiceDetail(transaction, actor.businessId, invoice.id)
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function updateDraftCustomerInvoice(
	actor: Actor,
	input: UpdateDraftCustomerInvoiceInput
): Promise<ActionResult<CustomerInvoiceDetail>> {
	const parsed = updateDraftCustomerInvoiceInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:create')
				const invoice = await transaction.financialDocument.findFirst({
					where: {
						id: parsed.data.customerInvoiceId,
						businessId: actor.businessId,
						kind: 'CUSTOMER_INVOICE'
					}
				})
				if (!invoice)
					throw new ApplicationError('NOT_FOUND', 'This Customer Invoice does not exist.')
				if (invoice.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Customer Invoice changed. Reload it and try again.'
					)
				}
				if (invoice.state !== 'DRAFT') {
					throw new ApplicationError(
						'INVALID_STATE',
						'Only draft Customer Invoices can be changed.'
					)
				}
				const updated = await transaction.financialDocument.updateMany({
					where: {
						id: invoice.id,
						businessId: actor.businessId,
						kind: 'CUSTOMER_INVOICE',
						state: 'DRAFT',
						revision: parsed.data.expectedRevision
					},
					data: {
						documentDate: businessDate(parsed.data.invoiceDate),
						dueDate: businessDate(parsed.data.dueDate),
						externalReference: parsed.data.reference ?? null,
						revision: { increment: 1 }
					}
				})
				if (updated.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Customer Invoice changed. Reload it and try again.'
					)
				}
				return loadCustomerInvoiceDetail(transaction, actor.businessId, invoice.id)
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function cancelDraftCustomerInvoice(
	actor: Actor,
	input: CustomerInvoiceTransitionInput
): Promise<ActionResult<CustomerInvoiceDetail>> {
	const parsed = customerInvoiceTransitionInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation = 'customer_invoice.cancel'
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		customerInvoiceId: parsed.data.customerInvoiceId,
		expectedRevision: parsed.data.expectedRevision
	})

	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'transactions:create',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = customerInvoiceDetailSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (invoice) => invoice.id,
			command: async (transaction) => {
				const invoice = await transaction.financialDocument.findFirst({
					where: {
						id: parsed.data.customerInvoiceId,
						businessId: actor.businessId,
						kind: 'CUSTOMER_INVOICE'
					}
				})
				if (!invoice)
					throw new ApplicationError('NOT_FOUND', 'This Customer Invoice does not exist.')
				if (invoice.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Customer Invoice changed. Reload it and try again.'
					)
				}
				if (invoice.state !== 'DRAFT') {
					throw new ApplicationError(
						'INVALID_STATE',
						'Only a draft Customer Invoice can be cancelled.'
					)
				}
				const updated = await transaction.financialDocument.updateMany({
					where: {
						id: invoice.id,
						businessId: actor.businessId,
						state: 'DRAFT',
						revision: parsed.data.expectedRevision
					},
					data: { state: 'CANCELLED', revision: { increment: 1 } }
				})
				if (updated.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Customer Invoice changed. Reload it and try again.'
					)
				}
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'customer_invoice.cancelled',
						targetType: 'FinancialDocument',
						targetId: invoice.id,
						requestId: parsed.data.operationKey
					}
				})
				return loadCustomerInvoiceDetail(transaction, actor.businessId, invoice.id)
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function postCustomerInvoice(
	actor: Actor,
	input: PostCustomerInvoiceInput
): Promise<ActionResult<CustomerInvoiceDetail>> {
	const parsed = postCustomerInvoiceInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation = 'customer_invoice.post'
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		customerInvoiceId: parsed.data.customerInvoiceId,
		expectedRevision: parsed.data.expectedRevision,
		journalId: parsed.data.journalId
	})

	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'transactions:post',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = customerInvoiceDetailSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (invoice) => invoice.id,
			command: async (transaction, accountingLockDate) => {
				const invoice = await transaction.financialDocument.findFirst({
					where: {
						id: parsed.data.customerInvoiceId,
						businessId: actor.businessId,
						kind: 'CUSTOMER_INVOICE'
					},
					include: { contact: true, lines: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } }
				})
				if (!invoice)
					throw new ApplicationError('NOT_FOUND', 'This Customer Invoice does not exist.')
				if (invoice.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Customer Invoice changed. Reload it and try again.'
					)
				}
				if (invoice.state !== 'DRAFT') {
					throw new ApplicationError(
						'INVALID_STATE',
						'Only a draft Customer Invoice can be posted.'
					)
				}
				assertAccountingDateUnlocked(dateOnly(invoice.documentDate), accountingLockDate)
				if (
					invoice.contact.businessId !== actor.businessId ||
					invoice.contact.archivedAt ||
					(invoice.contact.kind !== 'CUSTOMER' && invoice.contact.kind !== 'BOTH')
				) {
					throw new ApplicationError(
						'ARCHIVED_DEPENDENCY',
						'The Customer Invoice customer is unavailable.'
					)
				}

				const journal = await transaction.journal.findFirst({
					where: { id: parsed.data.journalId, businessId: actor.businessId },
					include: { defaultIncomeAccount: true, defaultControlAccount: true }
				})
				if (!journal || journal.archivedAt || journal.type !== 'SALES') {
					throw new ApplicationError('INVALID_STATE', 'Choose an active Sales journal.')
				}
				if (
					!journal.defaultIncomeAccount ||
					journal.defaultIncomeAccount.businessId !== actor.businessId ||
					journal.defaultIncomeAccount.archivedAt ||
					journal.defaultIncomeAccount.type !== 'INCOME' ||
					journal.defaultIncomeAccount.subtype !== 'GENERAL'
				) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The Sales journal requires an active Income default account.'
					)
				}
				if (
					!journal.defaultControlAccount ||
					journal.defaultControlAccount.businessId !== actor.businessId ||
					journal.defaultControlAccount.archivedAt ||
					journal.defaultControlAccount.type !== 'ASSET' ||
					journal.defaultControlAccount.subtype !== 'RECEIVABLE'
				) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The Sales journal requires an active Receivable default account.'
					)
				}

				const analyticIds = [
					...new Set(
						invoice.lines.flatMap((line) =>
							line.analyticAccountId ? [line.analyticAccountId] : []
						)
					)
				]
				const analytics = await transaction.analyticAccount.findMany({
					where: { id: { in: analyticIds }, businessId: actor.businessId }
				})
				if (
					analytics.length !== analyticIds.length ||
					analytics.some((account) => account.archivedAt || account.type !== 'INCOME')
				) {
					throw new ApplicationError(
						'ARCHIVED_DEPENDENCY',
						'The Customer Invoice requires active Income analytic accounts.'
					)
				}

				const taxAccountIds = [
					...new Set(
						invoice.lines.flatMap((line) =>
							line.taxAccountIdSnapshot ? [line.taxAccountIdSnapshot] : []
						)
					)
				]
				const taxAccounts = await transaction.ledgerAccount.findMany({
					where: { id: { in: taxAccountIds }, businessId: actor.businessId }
				})
				if (
					taxAccounts.length !== taxAccountIds.length ||
					taxAccounts.some(
						(account) =>
							account.archivedAt || account.type !== 'LIABILITY' || account.subtype !== 'OUTPUT_TAX'
					)
				) {
					throw new ApplicationError(
						'ARCHIVED_DEPENDENCY',
						'The Customer Invoice requires active Output Tax accounts.'
					)
				}

				const incomeLines: PostedJournalLine[] = []
				const taxLines: PostedJournalLine[] = []
				for (const line of invoice.lines) {
					if (!line.lineTotal.equals(line.lineNetTotal.plus(line.taxAmount))) {
						throw new ApplicationError(
							'INVALID_STATE',
							'A Customer Invoice line total is inconsistent.'
						)
					}
					if (line.lineNetTotal.greaterThan(0)) {
						incomeLines.push({
							accountId: journal.defaultIncomeAccount.id,
							contactId: invoice.contactId,
							analyticAccountId: line.analyticAccountId,
							description: `${invoice.number}: ${line.productNameSnapshot}`,
							debit: zeroJournalAmount(),
							credit: line.lineNetTotal
						})
					}
					if (line.taxAmount.greaterThan(0)) {
						if (!line.taxAccountIdSnapshot || !line.taxNameSnapshot) {
							throw new ApplicationError(
								'INVALID_STATE',
								'A Customer Invoice tax snapshot is incomplete.'
							)
						}
						taxLines.push({
							accountId: line.taxAccountIdSnapshot,
							contactId: invoice.contactId,
							analyticAccountId: null,
							description: `${invoice.number}: ${line.taxNameSnapshot}`,
							debit: zeroJournalAmount(),
							credit: line.taxAmount
						})
					}
				}

				const netTotal = sumJournalAmounts(invoice.lines.map((line) => line.lineNetTotal))
				const taxTotal = sumJournalAmounts(invoice.lines.map((line) => line.taxAmount))
				const total = netTotal.plus(taxTotal)
				if (
					!invoice.netTotal.equals(netTotal) ||
					!invoice.taxTotal.equals(taxTotal) ||
					!invoice.total.equals(total) ||
					total.isZero()
				) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The Customer Invoice totals are invalid for posting.'
					)
				}

				const entryNumber = await allocateJournalEntryNumber(
					transaction,
					actor.businessId,
					dateOnly(invoice.documentDate)
				)
				const entry = await commitPostedJournalEntry(transaction, {
					businessId: actor.businessId,
					journalId: journal.id,
					postingDate: invoice.documentDate,
					reference: entryNumber,
					source: 'CUSTOMER_INVOICE',
					sourceReference: invoice.id,
					createdById: actor.userId,
					lines: [
						{
							accountId: journal.defaultControlAccount.id,
							contactId: invoice.contactId,
							analyticAccountId: null,
							description: invoice.number,
							debit: total,
							credit: zeroJournalAmount()
						},
						...incomeLines,
						...taxLines
					]
				})
				const updated = await transaction.financialDocument.updateMany({
					where: {
						id: invoice.id,
						businessId: actor.businessId,
						kind: 'CUSTOMER_INVOICE',
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
						'This Customer Invoice changed. Reload it and try again.'
					)
				}
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'customer_invoice.posted',
						targetType: 'FinancialDocument',
						targetId: invoice.id,
						requestId: parsed.data.operationKey,
						details: {
							invoiceNumber: invoice.number,
							entryId: entry.entryId,
							entryNumber,
							netTotal: formatJournalAmount(netTotal),
							taxTotal: formatJournalAmount(taxTotal),
							total: formatJournalAmount(total)
						}
					}
				})
				return loadCustomerInvoiceDetail(transaction, actor.businessId, invoice.id)
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function getCustomerInvoice(
	actor: Actor,
	input: GetCustomerInvoiceInput
): Promise<ActionResult<CustomerInvoiceDetail>> {
	const parsed = getCustomerInvoiceInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
			return loadCustomerInvoiceDetail(transaction, actor.businessId, parsed.data.customerInvoiceId)
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function listCustomerInvoices(
	actor: Actor,
	input: CustomerInvoiceListInput = {}
): Promise<ActionResult<CustomerInvoiceListResult>> {
	const parsed = customerInvoiceListInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				const where: Prisma.FinancialDocumentWhereInput = {
					businessId: actor.businessId,
					kind: 'CUSTOMER_INVOICE',
					...(parsed.data.state === 'ALL' ? {} : { state: parsed.data.state })
				}
				const totalCount = await transaction.financialDocument.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const invoices = await transaction.financialDocument.findMany({
					where,
					include: {
						createdBy: { select: { id: true, displayName: true } },
						journalEntry: { select: { id: true, reference: true } }
					},
					orderBy: [{ documentDate: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})
				const rows: CustomerInvoiceSummary[] = invoices.map((invoice) => ({
					id: invoice.id,
					invoiceNumber: invoice.number,
					invoiceDate: dateOnly(invoice.documentDate),
					dueDate: dateOnly(invoice.dueDate),
					reference: invoice.externalReference,
					state: invoice.state,
					netTotal: formatJournalAmount(invoice.netTotal),
					taxTotal: formatJournalAmount(invoice.taxTotal),
					total: formatJournalAmount(invoice.total),
					revision: invoice.revision,
					customer: { id: invoice.contactId, name: invoice.contactNameSnapshot },
					sourceOrder: {
						id: invoice.sourceOrderId,
						orderNumber: invoice.sourceOrderNumberSnapshot
					},
					journalEntry: invoice.journalEntry,
					createdBy: invoice.createdBy,
					createdAt: invoice.createdAt.toISOString(),
					updatedAt: invoice.updatedAt.toISOString()
				}))
				return { rows, totalCount, page, pageSize: parsed.data.pageSize, lastPage }
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getCustomerInvoiceOptions(
	actor: Actor
): Promise<ActionResult<CustomerInvoiceOptions>> {
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				const salesJournals = await transaction.journal.findMany({
					where: {
						businessId: actor.businessId,
						type: 'SALES',
						archivedAt: null,
						defaultIncomeAccount: {
							is: {
								businessId: actor.businessId,
								archivedAt: null,
								type: 'INCOME',
								subtype: 'GENERAL'
							}
						},
						defaultControlAccount: {
							is: {
								businessId: actor.businessId,
								archivedAt: null,
								type: 'ASSET',
								subtype: 'RECEIVABLE'
							}
						}
					},
					select: { id: true, code: true, name: true },
					orderBy: [{ name: 'asc' }, { id: 'asc' }]
				})
				return { salesJournals }
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
