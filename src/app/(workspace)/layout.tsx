import { AppShell } from '@/components/app-shell/app-shell'
import { WORKSPACE_NAV_GROUPS } from '@/app/(workspace)/workspace-nav'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
	return (
		<AppShell productLabel="Accounting" homeHref="/contacts" groups={WORKSPACE_NAV_GROUPS}>
			{children}
		</AppShell>
	)
}
