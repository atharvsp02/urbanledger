import { config as loadEnvironment } from 'dotenv'
import { defineConfig } from 'prisma/config'

loadEnvironment({ path: '.env.local', quiet: true })

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations',
		seed: 'node --conditions=react-server --import tsx prisma/seed.ts'
	},
	datasource: {
		url:
			process.env.DIRECT_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres?schema=app'
	}
})
