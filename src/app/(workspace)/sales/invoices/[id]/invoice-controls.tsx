'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Field } from '@/components/ui/field'
import { SelectInput } from '@/components/ui/inputs'
import type { CustomerInvoiceOptions } from '@/lib/contracts/customer-invoice'
import {
	cancelDraftCustomerInvoiceAction,
	postCustomerInvoiceAction
} from '@/app/(workspace)/sales/invoices/actions'

export function DraftInvoiceControls({
	customerInvoiceId,
	invoiceNumber,
	revision,
	salesJournals
}: {
	customerInvoiceId: string
	invoiceNumber: string
	revision: number
	salesJournals: CustomerInvoiceOptions['salesJournals']
}) {
	const [postKey] = useState(() => crypto.randomUUID())
	const [cancelKey] = useState(() => crypto.randomUUID())
	const [journalId, setJournalId] = useState(salesJournals[0]?.id ?? '')

	return (
		<div className="flex flex-wrap items-end gap-3">
			<Field
				id="invoice-journalId"
				label="Sales journal"
				hint={
					salesJournals.length === 0
						? 'Configure an active sales journal before posting.'
						: 'Decides the income and receivable accounts.'
				}
				isRequired
				className="min-w-56"
			>
				{(props) => (
					<SelectInput
						{...props}
						value={journalId}
						onChange={(event) => setJournalId(event.target.value)}
						disabled={salesJournals.length === 0}
					>
						<option value="" disabled>
							Choose a journal
						</option>
						{salesJournals.map((journal) => (
							<option key={journal.id} value={journal.id}>
								{journal.code} {journal.name}
							</option>
						))}
					</SelectInput>
				)}
			</Field>

			<div className="flex flex-wrap gap-3 pb-1">
				<ConfirmDialog
					triggerLabel="Post invoice"
					triggerVariant="primary"
					isDisabled={journalId === ''}
					title={`Post ${invoiceNumber}?`}
					description="Posting recognises the revenue, any output tax and the receivable."
					consequence="A posted invoice cannot be edited or cancelled. Corrections require a linked reversal."
					confirmLabel="Post invoice"
					successMessage="Posted."
					onConfirm={() =>
						postCustomerInvoiceAction(customerInvoiceId, revision, journalId, postKey)
					}
				/>
				<ConfirmDialog
					triggerLabel="Cancel invoice"
					title={`Cancel ${invoiceNumber}?`}
					description="Cancelling closes this draft without any accounting effect."
					consequence="The sales order becomes eligible for a replacement invoice."
					confirmLabel="Cancel invoice"
					isDestructive
					successMessage="Cancelled."
					onConfirm={() => cancelDraftCustomerInvoiceAction(customerInvoiceId, revision, cancelKey)}
				/>
			</div>
		</div>
	)
}
