import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
	title: {
		default: 'UrbanLedger | Accounting',
		template: '%s | UrbanLedger'
	},
	description: 'An accounting workspace for purchases, sales, payments, budgets and reports.',
	robots: {
		index: false,
		follow: false
	}
}

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				<a
					href="#main-content"
					className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:text-foreground"
				>
					Skip to content
				</a>
				{children}
			</body>
		</html>
	)
}
