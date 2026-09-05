import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { fieldControlClassName } from '@/components/ui/field'

export function TextInput({
	className,
	...props
}: React.ComponentPropsWithoutRef<'input'> & { className?: string }) {
	return <input {...props} className={cn(fieldControlClassName, className)} />
}

// Amounts and quantities are entered and displayed in lining, fixed-width
// figures so columns of digits line up.
export function AmountInput({
	className,
	...props
}: React.ComponentPropsWithoutRef<'input'> & { className?: string }) {
	return (
		<input
			inputMode="decimal"
			{...props}
			className={cn(fieldControlClassName, 'text-right tabular-nums', className)}
		/>
	)
}

export function TextArea({
	className,
	...props
}: React.ComponentPropsWithoutRef<'textarea'> & { className?: string }) {
	return <textarea {...props} className={cn(fieldControlClassName, 'min-h-24 py-2', className)} />
}

export function SelectInput({
	className,
	children,
	...props
}: React.ComponentPropsWithoutRef<'select'> & { className?: string }) {
	return (
		<span className="relative block">
			<select {...props} className={cn(fieldControlClassName, 'appearance-none pr-10', className)}>
				{children}
			</select>
			<ChevronDown
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
			/>
		</span>
	)
}

export function CheckboxField({
	label,
	description,
	className,
	...props
}: React.ComponentPropsWithoutRef<'input'> & { label: string; description?: string }) {
	return (
		<label className={cn('flex min-h-11 items-start gap-3 py-2', className)}>
			<input
				type="checkbox"
				{...props}
				className="mt-0.5 size-5 shrink-0 rounded border-border accent-accent"
			/>
			<span className="min-w-0">
				<span className="block text-sm font-medium text-foreground">{label}</span>
				{description != null && (
					<span className="block text-sm text-muted-foreground">{description}</span>
				)}
			</span>
		</label>
	)
}

export function RadioField({
	label,
	description,
	className,
	...props
}: React.ComponentPropsWithoutRef<'input'> & { label: string; description?: string }) {
	return (
		<label className={cn('flex min-h-11 items-start gap-3 py-2', className)}>
			<input
				type="radio"
				{...props}
				className="mt-0.5 size-5 shrink-0 border-border accent-accent"
			/>
			<span className="min-w-0">
				<span className="block text-sm font-medium text-foreground">{label}</span>
				{description != null && (
					<span className="block text-sm text-muted-foreground">{description}</span>
				)}
			</span>
		</label>
	)
}
