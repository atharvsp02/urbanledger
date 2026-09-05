import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor, Capability } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	budgetArchiveInputSchema,
	budgetMutationResultSchema,
	createBudgetInputSchema,
	updateBudgetInputSchema,
	type BudgetArchiveInput,
	type BudgetMutationResult,
	type CreateBudgetInput,
	type UpdateBudgetInput
} from '@/lib/contracts/budget'
import { formatJournalAmount, parseJournalAmount } from '@/server/accounting/money'
import { ApplicationError } from '@/server/errors/application-error'
import {
	canonicalRequestHash,
	executeIdempotentOperation
} from '@/server/operations/command-operation'

type BudgetTransaction = Prisma.TransactionClient
type BudgetFields = Omit<z.output<typeof createBudgetInputSchema>, 'operationKey'>

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the budget details.',
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
			message: 'The budget change could not be completed.',
			...(requestId ? { requestId } : {})
		}
	}
}

function canonicalFields(input: BudgetFields) {
	return {
		name: input.name,
		startsOn: input.startsOn,
		endsOn: input.endsOn,
		responsibleUserId: input.responsibleUserId,
		lines: input.lines.map((line) => ({
			analyticAccountId: line.analyticAccountId,
			plannedAmount: formatJournalAmount(parseJournalAmount(line.plannedAmount))
		}))
	}
}

async function resolveDependencies(
	transaction: BudgetTransaction,
	businessId: string,
	input: BudgetFields
) {
	const now = new Date()
	const [responsible, analytics] = await Promise.all([
		transaction.applicationUser.findFirst({
			where: {
				id: input.responsibleUserId,
				status: 'ACTIVE',
				disabledAt: null,
				staffGrants: {
					some: {
						businessId,
						revokedAt: null,
						validFrom: { lte: now },
						OR: [{ validUntil: null }, { validUntil: { gt: now } }]
					}
				}
			},
			select: { id: true, displayName: true }
		}),
		transaction.analyticAccount.findMany({
			where: {
				businessId,
				archivedAt: null,
				id: { in: input.lines.map((line) => line.analyticAccountId) },
				type: { in: ['INCOME', 'EXPENSE'] }
			},
			select: { id: true }
		})
	])
	if (!responsible) {
		throw new ApplicationError('VALIDATION_ERROR', 'Choose active responsible staff.', {
			responsibleUserId: ['Choose an active staff member in this business.']
		})
	}
	if (analytics.length !== input.lines.length) {
		throw new ApplicationError('ARCHIVED_DEPENDENCY', 'Choose active Analytic Accounts.', {
			lines: ['Every planned line must use an active Income or Expense Analytic Account.']
		})
	}
	return responsible
}

async function assertUniqueBudget(
	transaction: BudgetTransaction,
	businessId: string,
	input: BudgetFields,
	excludedId?: string
) {
	const duplicate = await transaction.budget.findFirst({
		where: {
			businessId,
			name: input.name,
			startsOn: new Date(`${input.startsOn}T00:00:00.000Z`),
			endsOn: new Date(`${input.endsOn}T00:00:00.000Z`),
			...(excludedId ? { id: { not: excludedId } } : {})
		},
		select: { id: true }
	})
	if (duplicate) throw new ApplicationError('CONFLICT', 'A matching budget already exists.')
}

function storedResult(value: unknown) {
	const parsed = budgetMutationResultSchema.safeParse(value)
	return parsed.success ? parsed.data : null
}

async function executeBudgetMutation(input: {
	actor: Actor
	operationKey: string
	operation: string
	capability: Capability
	payload: object
	command: (transaction: BudgetTransaction) => Promise<BudgetMutationResult>
}) {
	return executeIdempotentOperation({
		actor: input.actor,
		capability: input.capability,
		operationKey: input.operationKey,
		operation: input.operation,
		requestHash: canonicalRequestHash(input.payload),
		parseStoredResult: storedResult,
		resourceId: (result) => result.budgetId,
		command: input.command
	})
}

export async function createBudget(
	actor: Actor,
	input: CreateBudgetInput
): Promise<ActionResult<BudgetMutationResult>> {
	const parsed = createBudgetInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const fields = canonicalFields(parsed.data)
	try {
		const result = await executeBudgetMutation({
			actor,
			operationKey: parsed.data.operationKey,
			operation: 'budget.create',
			capability: 'masters:create',
			payload: fields,
			command: async (transaction) => {
				const responsible = await resolveDependencies(transaction, actor.businessId, fields)
				await assertUniqueBudget(transaction, actor.businessId, fields)
				const budget = await transaction.budget.create({
					data: {
						businessId: actor.businessId,
						name: fields.name,
						startsOn: new Date(`${fields.startsOn}T00:00:00.000Z`),
						endsOn: new Date(`${fields.endsOn}T00:00:00.000Z`),
						responsibleUserId: responsible.id,
						responsibleNameSnapshot: responsible.displayName,
						lines: {
							create: fields.lines.map((line) => ({
								analyticAccountId: line.analyticAccountId,
								plannedAmount: line.plannedAmount
							}))
						}
					}
				})
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'budget.created',
						targetType: 'Budget',
						targetId: budget.id,
						requestId: parsed.data.operationKey
					}
				})
				return { budgetId: budget.id, revision: budget.revision, archivedAt: null }
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function updateBudget(
	actor: Actor,
	input: UpdateBudgetInput
): Promise<ActionResult<BudgetMutationResult>> {
	const parsed = updateBudgetInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const fields = canonicalFields(parsed.data)
	try {
		const result = await executeBudgetMutation({
			actor,
			operationKey: parsed.data.operationKey,
			operation: 'budget.update',
			capability: 'masters:update',
			payload: {
				budgetId: parsed.data.budgetId,
				expectedRevision: parsed.data.expectedRevision,
				...fields
			},
			command: async (transaction) => {
				await transaction.$queryRaw(
					Prisma.sql`SELECT id FROM app.budgets WHERE id = ${parsed.data.budgetId}::uuid FOR UPDATE`
				)
				const budget = await transaction.budget.findFirst({
					where: { id: parsed.data.budgetId, businessId: actor.businessId }
				})
				if (!budget) throw new ApplicationError('NOT_FOUND', 'This budget does not exist.')
				if (budget.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError('STALE_REVISION', 'Reload the budget and try again.')
				}
				if (budget.archivedAt) {
					throw new ApplicationError('INVALID_STATE', 'Restore this budget before editing it.')
				}
				const responsible = await resolveDependencies(transaction, actor.businessId, fields)
				await assertUniqueBudget(transaction, actor.businessId, fields, budget.id)
				await transaction.budget.update({
					where: { id: budget.id },
					data: {
						name: fields.name,
						startsOn: new Date(`${fields.startsOn}T00:00:00.000Z`),
						endsOn: new Date(`${fields.endsOn}T00:00:00.000Z`),
						responsibleUserId: responsible.id,
						responsibleNameSnapshot: responsible.displayName,
						revision: { increment: 1 },
						lines: {
							deleteMany: {},
							create: fields.lines.map((line) => ({
								analyticAccountId: line.analyticAccountId,
								plannedAmount: line.plannedAmount
							}))
						}
					}
				})
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'budget.updated',
						targetType: 'Budget',
						targetId: budget.id,
						requestId: parsed.data.operationKey
					}
				})
				return { budgetId: budget.id, revision: budget.revision + 1, archivedAt: null }
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

async function setBudgetArchived(
	actor: Actor,
	input: BudgetArchiveInput,
	isArchived: boolean
): Promise<ActionResult<BudgetMutationResult>> {
	const parsed = budgetArchiveInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await executeBudgetMutation({
			actor,
			operationKey: parsed.data.operationKey,
			operation: isArchived ? 'budget.archive' : 'budget.restore',
			capability: 'masters:archive',
			payload: {
				budgetId: parsed.data.budgetId,
				expectedRevision: parsed.data.expectedRevision
			},
			command: async (transaction) => {
				await transaction.$queryRaw(
					Prisma.sql`SELECT id FROM app.budgets WHERE id = ${parsed.data.budgetId}::uuid FOR UPDATE`
				)
				const budget = await transaction.budget.findFirst({
					where: { id: parsed.data.budgetId, businessId: actor.businessId }
				})
				if (!budget) throw new ApplicationError('NOT_FOUND', 'This budget does not exist.')
				if (budget.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError('STALE_REVISION', 'Reload the budget and try again.')
				}
				const archivedAt = isArchived ? new Date() : null
				await transaction.budget.update({
					where: { id: budget.id },
					data: { archivedAt, revision: { increment: 1 } }
				})
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: isArchived ? 'budget.archived' : 'budget.restored',
						targetType: 'Budget',
						targetId: budget.id,
						requestId: parsed.data.operationKey
					}
				})
				return {
					budgetId: budget.id,
					revision: budget.revision + 1,
					archivedAt: archivedAt?.toISOString() ?? null
				}
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export function archiveBudget(actor: Actor, input: BudgetArchiveInput) {
	return setBudgetArchived(actor, input, true)
}

export function restoreBudget(actor: Actor, input: BudgetArchiveInput) {
	return setBudgetArchived(actor, input, false)
}
