import { redirect } from 'next/navigation'

export default function PortalLoginPage() {
	redirect('/login?next=%2Fportal')
}
