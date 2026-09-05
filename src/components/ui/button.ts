import { cva, type VariantProps } from 'class-variance-authority'

// Sizes are floors, not fixed heights: every control keeps a 44px tap target
// and shrinks only its type, so compact financial rows stay usable.
export const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60',
	{
		variants: {
			variant: {
				primary: 'bg-accent text-accent-foreground hover:bg-accent-hover',
				secondary: 'border border-border bg-surface text-foreground hover:bg-surface-hover',
				ghost: 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
				danger: 'bg-danger text-accent-foreground hover:bg-danger/90'
			},
			size: {
				sm: 'min-h-11 px-3.5 text-sm',
				md: 'min-h-11 px-5 text-sm',
				lg: 'min-h-12 px-6 text-base'
			}
		},
		defaultVariants: {
			variant: 'primary',
			size: 'md'
		}
	}
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
