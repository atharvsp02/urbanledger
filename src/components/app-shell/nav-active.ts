// Longest matching prefix wins, so a child route lights its own item rather
// than every ancestor whose href prefixes it.
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
