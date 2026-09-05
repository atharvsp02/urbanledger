import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
	...nextVitals,
	...nextTs,
	globalIgnores([
		'.next/**',
		'out/**',
		'build/**',
		'dist/**',
		'coverage/**',
		'.worktrees/**',
		'inspiration/**',
		'docs/**',
		'src/generated/prisma/**',
		'next-env.d.ts'
	])
])
