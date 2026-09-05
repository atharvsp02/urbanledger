import 'server-only'
import { createHash } from 'node:crypto'
import type { Actor, Capability } from '@/lib/contracts/access'
import { Prisma } from '@/generated/prisma/client'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'

type CommandTransaction = Prisma.TransactionClient

type AuthorizedBusiness = { accountingLockDate: Date | null; timezone: string }

const maximumTransactionAttempts = 10

export function canonicalRequestHash(payload: object) {
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function isRetryableTransactionFailure(error: unknown) {
	if (typeof error !== 'object' || error === null || !('code' in error)) return false

	const code = (error as { code?: unknown }).code
	return code === 'P2002' || code === 'P2034'
}

function waitBeforeRetry(attempt: number) {
	const delayMilliseconds = Math.min(25 * 2 ** (attempt - 1), 1000)
	return new Promise((resolve) => setTimeout(resolve, delayMilliseconds))
}

export async function executeIdempotentOperation<T>(input: {
	actor: Actor
	capability: Capability
	operationKey: string
	operation: string
	requestHash: string
	parseStoredResult: (value: unknown) => T | null
	resourceId: (result: T) => string
	authorize?: (
		transaction: CommandTransaction,
		actor: Actor,
		capability: Capability
	) => Promise<AuthorizedBusiness>
	command: (
		transaction: CommandTransaction,
		accountingLockDate: Date | null,
		businessTimezone: string
	) => Promise<T>
}) {
	const database = getPrisma()

	for (let attempt = 1; attempt <= maximumTransactionAttempts; attempt += 1) {
		try {
			return await database.$transaction(
				async (transaction) => {
					const business = input.authorize
						? await input.authorize(transaction, input.actor, input.capability)
						: await requireCurrentAccountingActor(transaction, input.actor, input.capability)
					const existing = await transaction.commandOperation.findUnique({
						where: {
							businessId_operationKey: {
								businessId: input.actor.businessId,
								operationKey: input.operationKey
							}
						}
					})

					if (existing) {
						if (
							existing.operation !== input.operation ||
							existing.requestHash !== input.requestHash
						) {
							throw new ApplicationError(
								'OPERATION_KEY_MISMATCH',
								'This operation key was already used with a different request.'
							)
						}

						const storedResult = input.parseStoredResult(existing.result)
						if (!existing.committedAt || !storedResult) {
							throw new ApplicationError(
								'CONFLICT',
								'The matching command is still being processed.'
							)
						}

						return storedResult
					}

					await transaction.commandOperation.create({
						data: {
							businessId: input.actor.businessId,
							actorUserId: input.actor.userId,
							operationKey: input.operationKey,
							operation: input.operation,
							requestHash: input.requestHash
						}
					})

					const result = await input.command(
						transaction,
						business.accountingLockDate,
						business.timezone
					)
					await transaction.commandOperation.update({
						where: {
							businessId_operationKey: {
								businessId: input.actor.businessId,
								operationKey: input.operationKey
							}
						},
						data: {
							resourceId: input.resourceId(result),
							result: result as unknown as Prisma.InputJsonObject,
							committedAt: new Date()
						}
					})

					return result
				},
				{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
			)
		} catch (error) {
			if (isRetryableTransactionFailure(error) && attempt < maximumTransactionAttempts) {
				await waitBeforeRetry(attempt)
				continue
			}

			if (isRetryableTransactionFailure(error)) {
				throw new ApplicationError(
					'CONFLICT',
					'The command could not be serialized. Retry with the same operation key.'
				)
			}

			throw error
		}
	}

	throw new ApplicationError('INTERNAL_ERROR', 'The command did not complete.')
}
