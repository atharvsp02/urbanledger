import { z } from 'zod'
import { contactInputSchema } from '@/lib/masters/contact'

export const portalProfileInputSchema = contactInputSchema.omit({ kind: true }).extend({
	revision: z.number().int().positive()
})

export type PortalProfileInput = z.input<typeof portalProfileInputSchema>

export type PortalProfile = {
	id: string
	name: string
	email: string | null
	mobile: string | null
	street: string | null
	city: string | null
	state: string | null
	pincode: string | null
	revision: number
}
