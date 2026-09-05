import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import {
	trialBalanceInputSchema,
	type TrialBalanceInput,
	type TrialBalanceResult
} from '@/lib/contracts/accounting'
import type { ActionResult } from '@/lib/contracts/errors'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import {
	formatJournalAmount,
	sumJournalAmounts,
	zeroJournalAmount
} from '@/server/accounting/money'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the report filters.',
			z.flattenError(error).fieldErrors
		).toActionError()
	}
}

function actionFailure(error: unknown): ActionResult<never> {
	if (error instanceof ApplicationError) {
		return { ok: false, error: error.toActionError() }
	}

	return {
		ok: false,
		error: {
			code: 'DATABASE_UNAVAILABLE',
			message: 'The trial balance could not be loaded.'
		}
	}
}

export async function getTrialBalance(
	actor: Actor,
	input: TrialBalanceInput
): Promise<ActionResult<TrialBalanceResult>> {
	const parsed = trialBalanceInputSchema.safeParse(input)

	if (!parsed.success) {
		return validationFailure(parsed.error)
	}

	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'reports:read')

				const totals = await transaction.journalItem.groupBy({
					by: ['accountId'],
					where: {
						entry: {
							businessId: actor.businessId,
							state: 'POSTED',
							postingDate: { lte: new Date(`${parsed.data.asOfDate}T00:00:00.000Z`) }
						}
					},
					_sum: { debit: true, credit: true }
				})

				const accounts = await transaction.ledgerAccount.findMany({
					where: {
						businessId: actor.businessId,
						id: { in: totals.map((total) => total.accountId) }
					},
					select: { id: true, code: true, name: true, type: true }
				})

				if (accounts.length !== totals.length) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The ledger contains an account outside the current business.'
					)
				}

				const totalsByAccount = new Map(totals.map((total) => [total.accountId, total]))
				const rows = accounts
					.map((account) => {
						const total = totalsByAccount.get(account.id)
						const debit = total?._sum.debit ?? zeroJournalAmount()
						const credit = total?._sum.credit ?? zeroJournalAmount()

						return {
							accountId: account.id,
							accountCode: account.code,
							accountName: account.name,
							accountType: account.type,
							debit: formatJournalAmount(debit),
							credit: formatJournalAmount(credit),
							balance: formatJournalAmount(debit.minus(credit))
						}
					})
					.sort((left, right) =>
						left.accountCode === right.accountCode
							? left.accountId.localeCompare(right.accountId)
							: left.accountCode.localeCompare(right.accountCode)
					)

				const totalDebit = sumJournalAmounts(
					totals.map((total) => total._sum.debit ?? zeroJournalAmount())
				)
				const totalCredit = sumJournalAmounts(
					totals.map((total) => total._sum.credit ?? zeroJournalAmount())
				)
				const difference = totalDebit.minus(totalCredit)

				return {
					businessId: actor.businessId,
					asOfDate: parsed.data.asOfDate,
					generatedAt: new Date().toISOString(),
					rows,
					totalDebit: formatJournalAmount(totalDebit),
					totalCredit: formatJournalAmount(totalCredit),
					difference: formatJournalAmount(difference),
					balanced: difference.isZero()
				} satisfies TrialBalanceResult
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
