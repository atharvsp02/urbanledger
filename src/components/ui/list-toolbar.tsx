import Link from 'next/link'
import { Search } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { fieldControlClassName } from '@/components/ui/field'
import { SelectInput } from '@/components/ui/inputs'
import { cn } from '@/lib/cn'

export function ListToolbar({
	action,
	searchName = 'q',
	searchLabel = 'Search',
	searchPlaceholder,
	searchDefaultValue,
	resetHref,
	children
}: {
	action: string
	searchName?: string
	searchLabel?: string
	searchPlaceholder?: string
	searchDefaultValue?: string
	resetHref?: string
	children?: React.ReactNode
}) {
	return (
		<form
			method="get"
			action={action}
			role="search"
			aria-label={searchLabel}
			className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-end"
		>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-56">
				<label htmlFor="list-toolbar-search" className="text-sm font-medium text-foreground">
					{searchLabel}
				</label>
				<span className="relative block">
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<input
						id="list-toolbar-search"
						type="search"
						name={searchName}
						defaultValue={searchDefaultValue}
						placeholder={searchPlaceholder}
						className={cn(fieldControlClassName, 'pl-9')}
					/>
				</span>
			</div>

			{children}

			<div className="flex flex-wrap gap-2">
				<button type="submit" className={buttonVariants({ size: 'sm' })}>
					Apply
				</button>
				{resetHref != null && (
					<Link href={resetHref} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
						Clear
					</Link>
				)}
			</div>
		</form>
	)
}

export function ToolbarFilter({
	label,
	name,
	defaultValue,
	options
}: {
	label: string
	name: string
	defaultValue?: string
	options: readonly { value: string; label: string }[]
}) {
	const id = `list-toolbar-${name}`

	return (
		<div className="flex flex-col gap-1.5 sm:w-44">
			<label htmlFor={id} className="text-sm font-medium text-foreground">
				{label}
			</label>
			<SelectInput id={id} name={name} defaultValue={defaultValue}>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</SelectInput>
		</div>
	)
}
