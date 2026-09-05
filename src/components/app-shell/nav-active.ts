// The active item is the one whose href is the longest prefix of the current
// path, so /purchases/orders/new keeps "Purchase orders" lit while a sibling
// /purchases/bills does not claim it. Selection stays mutually exclusive.
export function activeNavHref({
	pathname,
	hrefs
}: {
	pathname: string
	hrefs: readonly string[]
}): string | undefined {
	return hrefs
		.filter((href) => pathname === href || pathname.startsWith(`${href}/`))
		.sort((left, right) => right.length - left.length)[0]
}
