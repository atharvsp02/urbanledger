import { defineConfig, devices } from '@playwright/test'
import { config as loadEnvironment } from 'dotenv'

loadEnvironment({ path: '.env.local', quiet: true })

const baseURL = process.env.APP_URL ?? 'http://127.0.0.1:3000'
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

export default defineConfig({
	testDir: './tests/e2e',
	timeout: 60_000,
	fullyParallel: false,
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'line' : 'list',
	expect: { timeout: 20_000 },
	use: {
		baseURL,
		actionTimeout: 20_000,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {})
			}
		}
	],
	webServer: {
		command: 'pnpm dev --hostname 127.0.0.1 --port 3000',
		url: `${baseURL}/api/health`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
})
