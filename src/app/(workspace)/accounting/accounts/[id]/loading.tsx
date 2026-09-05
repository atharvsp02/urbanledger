import {
	LoadingRegion,
	SkeletonCard,
	SkeletonPageHeader,
	SkeletonTable
} from '@/components/ui/skeleton'

export default function LedgerAccountDetailLoading() {
	return (
		<LoadingRegion label="Loading account activity.">
			<SkeletonPageHeader hasAction />
			<div className="grid gap-4 sm:grid-cols-3">
				<SkeletonCard rows={1} />
				<SkeletonCard rows={1} />
				<SkeletonCard rows={1} />
			</div>
			<SkeletonTable rows={6} columns={7} />
		</LoadingRegion>
	)
}
