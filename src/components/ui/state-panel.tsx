import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangle, FileQuestion, Inbox, Lock, RefreshCw, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

const panelVariants = cva('flex flex-col items-start rounded-xl border p-6 sm:p-8', {
	variants: {
		tone: {
			neutral: 'border-border bg-surface-soft',
			info: 'border-accent/20 bg-surface-tint',
			warning: 'border-warning/25 bg-warning/6',
			danger: 'border-danger/25 bg-danger/6'
		}
	},
	defaultVariants: { tone: 'neutral' }
})

const iconVariants = cva(
	'grid size-10 shrink-0 place-items-center rounded-full border bg-surface',
	{
		variants: {
			tone: {
				neutral: 'border-border text-muted-foreground',
				info: 'border-accent/20 text-accent',
				warning: 'border-warning/25 text-warning',
				danger: 'border-danger/25 text-danger'
			}
		},
		defaultVariants: { tone: 'neutral' }
	}
)

export type StatePanelTone = NonNullable<VariantProps<typeof panelVariants>['tone']>
export type StatePanelTitleTag = 'p' | 'h1' | 'h2'

export function StatePanel({
	icon: Icon,
	title,
	titleAs: Title = 'p',
	description,
	tone,
	className,
	children
}: {
	icon: LucideIcon
	title: string
	titleAs?: StatePanelTitleTag
	description?: string
	tone?: StatePanelTone
	className?: string
	children?: React.ReactNode
}) {
	return (
		<div className={cn(panelVariants({ tone }), className)}>
			<span className={iconVariants({ tone })}>
				<Icon aria-hidden="true" className="size-5" />
			</span>
			<Title className="mt-4 text-lg leading-tight font-semibold tracking-tight">{title}</Title>
			{description != null && (
				<p className="mt-2 max-w-prose text-base leading-relaxed text-muted-foreground text-pretty">
					{description}
				</p>
			)}
			{children != null && <div className="mt-6 flex flex-wrap gap-3">{children}</div>}
		</div>
	)
}

export function EmptyState({
	title,
	description,
	icon = Inbox,
	titleAs,
	className,
	children
}: {
	title: string
	description?: string
	icon?: LucideIcon
	titleAs?: StatePanelTitleTag
	className?: string
	children?: React.ReactNode
}) {
	return (
		<StatePanel
			icon={icon}
			title={title}
			titleAs={titleAs}
			description={description}
			className={className}
		>
			{children}
		</StatePanel>
	)
}

// A failed query is not an empty result; this never renders as zero activity.
export function ErrorState({
	title = 'This information could not be loaded',
	description = 'The request did not complete, so no data is shown. Try again.',
	titleAs,
	className,
	children
}: {
	title?: string
	description?: string
	titleAs?: StatePanelTitleTag
	className?: string
	children?: React.ReactNode
}) {
	return (
		<StatePanel
			icon={AlertTriangle}
			tone="danger"
			title={title}
			titleAs={titleAs}
			description={description}
			className={className}
		>
			{children}
		</StatePanel>
	)
}

export function ForbiddenState({
	title = 'You do not have access to this',
	description = 'Your current access does not include this record or action. Ask the business owner if you need it.',
	titleAs,
	className,
	children
}: {
	title?: string
	description?: string
	titleAs?: StatePanelTitleTag
	className?: string
	children?: React.ReactNode
}) {
	return (
		<StatePanel
			icon={Lock}
			tone="warning"
			title={title}
			titleAs={titleAs}
			description={description}
			className={className}
		>
			{children}
		</StatePanel>
	)
}

export function NotFoundState({
	title = 'This record does not exist',
	description = 'It may have been removed, or the address may be wrong.',
	titleAs,
	className,
	children
}: {
	title?: string
	description?: string
	titleAs?: StatePanelTitleTag
	className?: string
	children?: React.ReactNode
}) {
	return (
		<StatePanel
			icon={FileQuestion}
			title={title}
			titleAs={titleAs}
			description={description}
			className={className}
		>
			{children}
		</StatePanel>
	)
}

export function StaleRevisionState({
	title = 'This record changed while you were editing',
	description = 'Someone else saved a newer version. Reload it, review the current values and submit again.',
	titleAs,
	className,
	children
}: {
	title?: string
	description?: string
	titleAs?: StatePanelTitleTag
	className?: string
	children?: React.ReactNode
}) {
	return (
		<StatePanel
			icon={RefreshCw}
			tone="warning"
			title={title}
			titleAs={titleAs}
			description={description}
			className={className}
		>
			{children}
		</StatePanel>
	)
}
