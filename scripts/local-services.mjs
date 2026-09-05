import { spawnSync } from 'node:child_process'

const command = process.argv[2]
const network = process.env.URBANLEDGER_SUPABASE_NETWORK ?? 'urbanledger-local'

function run(program, args, options = {}) {
	const result = spawnSync(program, args, { stdio: 'inherit', ...options })

	if (result.error) {
		throw result.error
	}

	if (result.status !== 0) {
		process.exit(result.status ?? 1)
	}
}

function ensureLoopbackNetwork() {
	const inspection = spawnSync('docker', ['network', 'inspect', network], { stdio: 'ignore' })

	if (inspection.status === 0) {
		return
	}

	run('docker', [
		'network',
		'create',
		'-o',
		'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
		network
	])
}

switch (command) {
	case 'start':
		ensureLoopbackNetwork()
		run('pnpm', [
			'exec',
			'supabase',
			'start',
			'--network-id',
			network,
			'--exclude',
			'analytics,edge-runtime,functions,imgproxy,realtime,studio,vector'
		])
		break
	case 'stop':
		run('pnpm', ['exec', 'supabase', 'stop'])
		break
	case 'status':
		run('pnpm', ['exec', 'supabase', 'status'])
		break
	default:
		console.error('Usage: pnpm local:start | pnpm local:stop | pnpm local:status')
		process.exit(1)
}
