export type ListQuery = {
	search: string
	includeArchived: boolean
	page: number
	pageSize: number
}

export type ListResult<Row> = {
	rows: readonly Row[]
	totalCount: number
	page: number
	lastPage: number
}

export function paginate<Row>(
	rows: readonly Row[],
	page: number,
	pageSize: number
): ListResult<Row> {
	const lastPage = Math.max(1, Math.ceil(rows.length / pageSize))
	const safePage = Math.min(Math.max(page, 1), lastPage)
	return {
		rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
		totalCount: rows.length,
		page: safePage,
		lastPage
	}
}

export function nextId(prefix: string, existing: readonly { id: string }[]): string {
	const highest = existing.reduce((maximum, row) => {
		const numeric = Number(row.id.replace(`${prefix}-`, ''))
		return Number.isFinite(numeric) && numeric > maximum ? numeric : maximum
	}, 0)
	return `${prefix}-${String(highest + 1).padStart(3, '0')}`
}
