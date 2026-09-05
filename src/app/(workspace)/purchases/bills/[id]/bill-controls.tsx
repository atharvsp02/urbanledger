'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Field } from '@/components/ui/field'
import { SelectInput } from '@/components/ui/inputs'
import type { VendorBillOptions } from '@/lib/contracts/vendor-bill'
import {
	cancelDraftVendorBillAction,
	postVendorBillAction
} from '@/app/(workspace)/purchases/bills/actions'

export function DraftBillControls({
	vendorBillId,
	billNumber,
	revision,
	purchaseJournals
}: {
	vendorBillId: string
	billNumber: string
	revision: number
	purchaseJournals: VendorBillOptions['purchaseJournals']
}) {
	const [postKey] = useState(() => crypto.randomUUID())
	const [cancelKey] = useState(() => crypto.randomUUID())
	const [journalId, setJournalId] = useState(purchaseJournals[0]?.id ?? '')

	return (
		<div className="flex flex-wrap items-end gap-3">
			<Field
				id="bill-journalId"
				label="Purchase journal"
				hint={
					purchaseJournals.length === 0
						? 'Configure an active purchase journal before posting.'
						: 'Decides the expense and payable accounts.'
				}
				isRequired
				className="min-w-56"
			>
				{(props) => (
					<SelectInput
						{...props}
						value={journalId}
						onChange={(event) => setJournalId(event.target.value)}
						disabled={purchaseJournals.length === 0}
					>
						<option value="" disabled>
							Choose a journal
						</option>
						{purchaseJournals.map((journal) => (
							<option key={journal.id} value={journal.id}>
								{journal.code} {journal.name}
							</option>
						))}
					</SelectInput>
				)}
			</Field>

			<div className="flex flex-wrap gap-3 pb-1">
				<ConfirmDialog
					triggerLabel="Post bill"
					triggerVariant="primary"
					isDisabled={journalId === ''}
					title={`Post ${billNumber}?`}
					description="Posting records the purchase expense, any recoverable input tax and the payable."
					consequence="A posted bill cannot be edited or cancelled. Corrections require a linked reversal."
					confirmLabel="Post bill"
					successMessage="Posted."
					onConfirm={() => postVendorBillAction(vendorBillId, revision, journalId, postKey)}
				/>
				<ConfirmDialog
					triggerLabel="Cancel bill"
					title={`Cancel ${billNumber}?`}
					description="Cancelling closes this draft without any accounting effect."
					consequence="The purchase order becomes eligible for a replacement bill."
					confirmLabel="Cancel bill"
					isDestructive
					successMessage="Cancelled."
					onConfirm={() => cancelDraftVendorBillAction(vendorBillId, revision, cancelKey)}
				/>
			</div>
		</div>
	)
}
