import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	poweredByHeader: false,
	// The development route badge sits over the sidebar account controls and
	// swallows their clicks. Compile and runtime error overlays still appear.
	devIndicators: false,
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
