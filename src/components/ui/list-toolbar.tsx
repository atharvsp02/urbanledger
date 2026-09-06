'use client'

import { useCallback, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, X } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { fieldControlClassName } from '@/components/ui/field'
import { SelectInput } from '@/components/ui/inputs'
import { cn } from '@/lib/cn'

const SEARCH_DELAY_MS = 300

export function ListToolbar({
	action,
	hasSearch = true,
	searchName = 'q',
	searchLabel = 'Search',
	searchPlaceholder,
	searchDefaultValue = '',
	resetHref,
	children
}: {
	action: string
	hasSearch?: boolean
	searchName?: string
	searchLabel?: string
	searchPlaceholder?: string
	searchDefaultValue?: string
	resetHref?: string
	children?: React.ReactNode
}) {
	const router = useRouter()
	const formRef = useRef<HTMLFormElement>(null)
	const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const [isPending, startTransition] = useTransition()

	useEffect(
		() => () => {
			if (searchTimer.current != null) clearTimeout(searchTimer.current)
		},
		[]
	)

	const navigate = useCallback(
		(patch?: Record<string, string>) => {
			const form = formRef.current
			if (form == null) return

			const query = new URLSearchParams()
			for (const [name, value] of new FormData(form)) {
				if (typeof value === 'string' && value !== '') query.set(name, value)
			}

			for (const [name, value] of Object.entries(patch ?? {})) {
				if (value === '') query.delete(name)
				else query.set(name, value)
			}

			const sortOrder = query.get('sortOrder')
			if (sortOrder != null) {
				const [sort, direction] = sortOrder.split(':')
				query.delete('sortOrder')
				if (sort != null && direction != null) {
					query.set('sort', sort)
					query.set('dir', direction)
				}
			}

			query.delete('page')
			const queryString = query.toString()
			startTransition(() => {
				router.replace(queryString === '' ? action : `${action}?${queryString}`, {
					scroll: false
				})
			})
		},
		[action, router]
	)

	function scheduleSearch(value: string) {
		if (searchTimer.current != null) clearTimeout(searchTimer.current)
		searchTimer.current = setTimeout(() => navigate({ [searchName]: value }), SEARCH_DELAY_MS)
	}

	function applyFilters(event: React.ChangeEvent<HTMLFormElement>) {
		if (event.target instanceof HTMLInputElement && event.target.name === searchName) return
		if (searchTimer.current != null) clearTimeout(searchTimer.current)
		navigate()
	}

	function clearFilters() {
		if (searchTimer.current != null) clearTimeout(searchTimer.current)
		for (const element of Array.from(formRef.current?.elements ?? [])) {
			if (element instanceof HTMLInputElement && element.type !== 'hidden') element.value = ''
			if (element instanceof HTMLSelectElement) element.selectedIndex = 0
		}
		startTransition(() => router.replace(resetHref ?? action, { scroll: false }))
	}

	return (
		<form
			ref={formRef}
			role="search"
			aria-label={searchLabel}
			aria-busy={isPending}
			className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-end"
			onChange={applyFilters}
			onSubmit={(event) => {
				event.preventDefault()
				if (searchTimer.current != null) clearTimeout(searchTimer.current)
				navigate()
			}}
		>
			{hasSearch && (
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
							key={searchDefaultValue}
							id="list-toolbar-search"
							type="search"
							name={searchName}
							defaultValue={searchDefaultValue}
							placeholder={searchPlaceholder}
							className={cn(fieldControlClassName, 'pl-9')}
							onChange={(event) => scheduleSearch(event.target.value)}
						/>
					</span>
				</div>
			)}

			{children}

			<div className="flex min-h-11 items-center gap-2">
				{isPending && (
					<span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<Loader2
							aria-hidden="true"
							className="size-3.5 animate-spin motion-reduce:animate-none"
						/>
						Updating
					</span>
				)}
				{resetHref != null && (
					<button
						type="button"
						onClick={clearFilters}
						className={buttonVariants({ variant: 'ghost', size: 'sm' })}
					>
						<X aria-hidden="true" className="size-4" />
						Clear
					</button>
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
	const fallbackValue = options[0]?.value ?? ''

	return (
		<div className="flex flex-col gap-1.5 sm:w-44">
			<label htmlFor={id} className="text-sm font-medium text-foreground">
				{label}
			</label>
			<SelectInput
				key={defaultValue}
				id={id}
				name={name}
				defaultValue={defaultValue ?? fallbackValue}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</SelectInput>
		</div>
	)
}

export function ToolbarSort({
	defaultSort,
	defaultDirection,
	options
}: {
	defaultSort: string
	defaultDirection: 'asc' | 'desc'
	options: readonly { value: string; label: string }[]
}) {
	const valueFromProps = `${defaultSort}:${defaultDirection}`

	return (
		<div className="flex flex-col gap-1.5 sm:w-52">
			<label htmlFor="list-toolbar-sort" className="text-sm font-medium text-foreground">
				Sort
			</label>
			<SelectInput
				key={valueFromProps}
				id="list-toolbar-sort"
				name="sortOrder"
				defaultValue={valueFromProps}
			>
				{options.flatMap((option) => [
					<option key={`${option.value}:asc`} value={`${option.value}:asc`}>
						{option.label} - ascending
					</option>,
					<option key={`${option.value}:desc`} value={`${option.value}:desc`}>
						{option.label} - descending
					</option>
				])}
			</SelectInput>
		</div>
	)
}

export function ToolbarDate({
	label,
	name,
	defaultValue = ''
}: {
	label: string
	name: string
	defaultValue?: string
}) {
	const id = `list-toolbar-${name}`

	return (
		<div className="flex flex-col gap-1.5 sm:w-44">
			<label htmlFor={id} className="text-sm font-medium text-foreground">
				{label}
			</label>
			<input
				key={defaultValue}
				id={id}
				type="date"
				name={name}
				defaultValue={defaultValue}
				className={fieldControlClassName}
			/>
		</div>
	)
}
