import 'server-only'
import type { Actor } from '@/lib/contracts/access'
import { currentBusinessDate } from '@/server/business/dates'
import { getBusinessSettings } from '@/server/business/settings'

// Date defaults follow the business timezone, never the server locale.
export async function getBusinessToday(actor: Actor) {
	const settings = await getBusinessSettings(actor)
	return settings.ok
		? currentBusinessDate(settings.data.timezone)
		: currentBusinessDate('Asia/Kolkata')
}
