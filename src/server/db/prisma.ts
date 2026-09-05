import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { getServerEnvironment } from '@/server/config/environment'

const globalDatabase = globalThis as typeof globalThis & { urbanledgerPrisma?: PrismaClient }

function createPrismaClient() {
	const environment = getServerEnvironment()
	const adapter = new PrismaPg({ connectionString: environment.DATABASE_URL }, { schema: 'app' })

	return new PrismaClient({ adapter })
}

export function getPrisma() {
	globalDatabase.urbanledgerPrisma ??= createPrismaClient()
	return globalDatabase.urbanledgerPrisma
}
