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

function runCaptured(program, args) {
	const result = spawnSync(program, args, { encoding: 'utf8' })

	if (result.error) {
		throw result.error
	}

	if (result.status !== 0) {
		const safeOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
			.split('\n')
			.filter((line) => !/(key|secret|password|token|db_url)/i.test(line))
			.join('\n')
		console.error(safeOutput.trim())
		process.exit(result.status ?? 1)
	}

	return result.stdout
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

function startLocalEnvironment() {
	ensureLoopbackNetwork()
	runCaptured('pnpm', [
		'exec',
		'supabase',
		'start',
		'--network-id',
		network,
		'--exclude',
		'analytics,edge-runtime,functions,imgproxy,realtime,studio,vector'
	])
	run('node', ['scripts/prepare-local-environment.mjs'])
	run('pnpm', ['local:seed'])
	console.log('UrbanLedger local services, database and seed data are ready.')
}

switch (command) {
	case 'start':
		startLocalEnvironment()
		break
	case 'stop':
		run('pnpm', ['exec', 'supabase', 'stop'])
		break
	case 'status':
		{
			const output = runCaptured('pnpm', ['exec', 'supabase', 'status', '--output', 'json'])
			const status = JSON.parse(output)
			console.log(`API and Storage: ${status.API_URL}`)
			console.log(`Captured email: ${status.INBUCKET_URL}`)
			console.log('PostgreSQL: 127.0.0.1:54322')
		}
		break
	case 'reset':
		{
			const confirmation = process.argv.slice(3).filter((argument) => argument !== '--')

			if (confirmation[0] !== '--confirm' || confirmation[1] !== 'urbanledger') {
				console.error('Reset refused. Use: pnpm local:reset -- --confirm urbanledger')
				process.exit(1)
			}
		}
		run('pnpm', ['exec', 'supabase', 'stop', '--no-backup'])
		startLocalEnvironment()
		break
	default:
		console.error(
			'Usage: pnpm local:start | pnpm local:stop | pnpm local:status | pnpm local:reset'
		)
		process.exit(1)
}
