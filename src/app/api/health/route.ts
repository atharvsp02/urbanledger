export function GET() {
	return Response.json(
		{
			status: 'ok',
			service: 'urbanledger',
			checks: { application: 'ok' }
		},
		{
			headers: { 'Cache-Control': 'no-store' }
		}
	)
}
