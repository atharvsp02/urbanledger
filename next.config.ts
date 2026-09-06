import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	poweredByHeader: false,
	experimental: {
		serverActions: {
			bodySizeLimit: '6mb'
		}
	},
	turbopack: {
		root: process.cwd()
	}
}

export default nextConfig
