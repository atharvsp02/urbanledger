import 'server-only'
import type { Actor, Capability } from '@/lib/contracts/access'
import { roleHasCapability } from '@/server/access/permissions'
import { ApplicationError } from '@/server/errors/application-error'

// Commands take the resolved actor so they stay directly testable, and still
// refuse a caller whose role lacks the capability.
export function assertCapability(actor: Actor, capability: Capability) {
	if (actor.role === 'CONTACT' || !roleHasCapability(actor.role, capability)) {
		throw new ApplicationError('FORBIDDEN', 'You do not have permission to perform this action.')
	}
}
