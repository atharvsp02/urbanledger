import 'server-only'

export type PageResult<Row> = {
	rows: readonly Row[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export function resolvePage(page: number, pageSize: number, totalCount: number) {
	const lastPage = Math.max(1, Math.ceil(totalCount / pageSize))
	return { page: Math.min(Math.max(page, 1), lastPage), lastPage }
}
