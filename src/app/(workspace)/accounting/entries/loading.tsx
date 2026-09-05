import {
	LoadingRegion,
	SkeletonCard,
	SkeletonPageHeader,
	SkeletonTable
} from '@/components/ui/skeleton'

export default function JournalEntriesLoading() {
	return (
		<LoadingRegion label="Loading journal entries.">
			<SkeletonPageHeader hasAction />
			<SkeletonCard rows={2} />
			<SkeletonTable rows={6} columns={6} />
		</LoadingRegion>
	)
}
