import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

const badgeVariants = cva(
	'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
	{
		variants: {
			tone: {
				neutral: 'border-border bg-surface-soft text-muted-foreground',
				accent: 'border-accent/25 bg-surface-tint text-accent',
				success: 'border-success/25 bg-success/8 text-success',
				warning: 'border-warning/30 bg-warning/8 text-warning',
				danger: 'border-danger/25 bg-danger/8 text-danger'
			}
		},
		defaultVariants: { tone: 'neutral' }
	}
)

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>

// Status is never carried by colour alone: pair each tone with a distinct mark
// or a label that reads on its own.
export function Badge({
	tone,
	icon: Icon,
	className,
	children
}: {
	tone?: BadgeTone
	icon?: LucideIcon
	className?: string
	children: React.ReactNode
}) {
	return (
		<span className={cn(badgeVariants({ tone }), className)}>
			{Icon != null && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
			{children}
		</span>
	)
}
