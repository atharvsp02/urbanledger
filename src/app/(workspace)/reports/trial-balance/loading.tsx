import {
	LoadingRegion,
	SkeletonCard,
	SkeletonPageHeader,
	SkeletonTable
} from '@/components/ui/skeleton'

export default function TrialBalanceLoading() {
	return (
		<LoadingRegion label="Loading the Trial Balance.">
			<SkeletonPageHeader />
			<div className="grid gap-4 sm:grid-cols-3">
				<SkeletonCard rows={1} />
				<SkeletonCard rows={1} />
				<SkeletonCard rows={1} />
			</div>
			<SkeletonTable rows={6} columns={6} />
		</LoadingRegion>
	)
}
