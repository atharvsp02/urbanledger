import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	accessUserListInputSchema,
	auditEventListInputSchema,
	getAuditEventInputSchema,
	type AccessCreationOptions,
	type AccessUserListInput,
	type AccessUserListResult,
	type AuditEventDetail,
	type AuditEventListInput,
	type AuditEventListResult,
	type GetAuditEventInput
} from '@/lib/contracts/access-administration'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import { loadAccessUser } from '@/server/access/read-models'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { resolvePage } from '@/server/masters/pagination'

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the access filters.',
			z.flattenError(error).fieldErrors
		).toActionError()
	}
}

function actionFailure(error: unknown): ActionResult<never> {
	if (error instanceof ApplicationError) return { ok: false, error: error.toActionError() }
	return {
		ok: false,
		error: { code: 'DATABASE_UNAVAILABLE', message: 'The administration request failed.' }
	}
}

function auditDetail(event: {
	id: string
	action: string
	targetType: string
	targetId: string
	requestId: string
	details: Prisma.JsonValue | null
	actor: { id: string; displayName: string } | null
	occurredAt: Date
}): AuditEventDetail {
	return {
		id: event.id,
		action: event.action,
		targetType: event.targetType,
		targetId: event.targetId,
		requestId: event.requestId,
		details: event.details,
		actor: event.actor,
		occurredAt: event.occurredAt.toISOString()
	}
}

function dayAfter(value: string) {
	const date = new Date(`${value}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + 1)
	return date
}

export async function listAccessUsers(
	actor: Actor,
	input: AccessUserListInput = {}
): Promise<ActionResult<AccessUserListResult>> {
	const parsed = accessUserListInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'access:manage')
				const where: Prisma.ApplicationUserWhereInput = {
					OR: [
						{ staffGrants: { some: { businessId: actor.businessId } } },
						{ portalAccess: { businessId: actor.businessId } }
					]
				}
				const totalCount = await transaction.applicationUser.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const users = await transaction.applicationUser.findMany({
					where,
					select: { id: true },
					orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})
				const rows = await Promise.all(
					users.map((user) => loadAccessUser(transaction, actor.businessId, user.id))
				)
				return {
					rows,
					totalCount,
					page,
					pageSize: parsed.data.pageSize,
					lastPage
				}
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getAccessCreationOptions(
	actor: Actor
): Promise<ActionResult<AccessCreationOptions>> {
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'access:manage')
			const contacts = await transaction.contact.findMany({
				where: { businessId: actor.businessId, archivedAt: null, portalAccess: null },
				select: { id: true, name: true, kind: true },
				orderBy: [{ name: 'asc' }, { id: 'asc' }]
			})
			return { contacts }
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function listAuditEvents(
	actor: Actor,
	input: AuditEventListInput = {}
): Promise<ActionResult<AuditEventListResult>> {
	const parsed = auditEventListInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'audit:read')
				const where: Prisma.AuditEventWhereInput = {
					businessId: actor.businessId,
					...(parsed.data.action ? { action: { contains: parsed.data.action } } : {}),
					...(parsed.data.targetType ? { targetType: parsed.data.targetType } : {}),
					occurredAt: {
						...(parsed.data.dateFrom
							? { gte: new Date(`${parsed.data.dateFrom}T00:00:00.000Z`) }
							: {}),
						...(parsed.data.dateTo ? { lt: dayAfter(parsed.data.dateTo) } : {})
					}
				}
				const totalCount = await transaction.auditEvent.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const events = await transaction.auditEvent.findMany({
					where,
					include: { actor: { select: { id: true, displayName: true } } },
					orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})
				return {
					rows: events.map(auditDetail),
					totalCount,
					page,
					pageSize: parsed.data.pageSize,
					lastPage
				}
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getAuditEvent(
	actor: Actor,
	input: GetAuditEventInput
): Promise<ActionResult<AuditEventDetail>> {
	const parsed = getAuditEventInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'audit:read')
			const event = await transaction.auditEvent.findFirst({
				where: { id: parsed.data.auditEventId, businessId: actor.businessId },
				include: { actor: { select: { id: true, displayName: true } } }
			})
			if (!event) throw new ApplicationError('NOT_FOUND', 'This audit event does not exist.')
			return auditDetail(event)
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
