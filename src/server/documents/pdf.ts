import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const INK = rgb(0.13, 0.15, 0.15)
const MUTED = rgb(0.37, 0.41, 0.39)
const RULE = rgb(0.87, 0.87, 0.85)

export type PdfColumn = { header: string; width: number; align?: 'left' | 'right' }
export type PdfRow = readonly string[]

export type PdfDocumentInput = {
	title: string
	documentNumber: string
	businessName: string
	businessAddressLines: readonly string[]
	partyLabel: string
	partyName: string
	facts: readonly { label: string; value: string }[]
	columns: readonly PdfColumn[]
	rows: readonly PdfRow[]
	totals: readonly { label: string; value: string; emphasis?: boolean }[]
	notes: readonly string[]
}

const WIN_ANSI_SUBSTITUTES: Record<string, string> = {
	'\u20b9': 'INR ',
	'\u2013': '-',
	'\u2014': '-',
	'\u2018': "'",
	'\u2019': "'",
	'\u201c': '"',
	'\u201d': '"',
	'\u2022': '-',
	'\u00a0': ' '
}

// The base-14 fonts encode WinAnsi only, so anything outside it would make
// pdf-lib throw while drawing a document that must always render.
function winAnsi(value: string) {
	return Array.from(value, (character) => {
		const substitute = WIN_ANSI_SUBSTITUTES[character]
		if (substitute != null) return substitute
		const code = character.codePointAt(0) ?? 0
		return code >= 0x20 && code <= 0xff ? character : '?'
	}).join('')
}

// Base-14 fonts are embedded by the renderer itself, so nothing is fetched at
// request time.
export async function renderDocumentPdf(raw: PdfDocumentInput): Promise<Uint8Array> {
	const input: PdfDocumentInput = {
		...raw,
		title: winAnsi(raw.title),
		documentNumber: winAnsi(raw.documentNumber),
		businessName: winAnsi(raw.businessName),
		businessAddressLines: raw.businessAddressLines.map(winAnsi),
		partyLabel: winAnsi(raw.partyLabel),
		partyName: winAnsi(raw.partyName),
		facts: raw.facts.map((fact) => ({ label: winAnsi(fact.label), value: winAnsi(fact.value) })),
		columns: raw.columns.map((column) => ({ ...column, header: winAnsi(column.header) })),
		rows: raw.rows.map((row) => row.map(winAnsi)),
		totals: raw.totals.map((total) => ({
			...total,
			label: winAnsi(total.label),
			value: winAnsi(total.value)
		})),
		notes: raw.notes.map(winAnsi)
	}
	const pdf = await PDFDocument.create()
	pdf.setTitle(`${input.title} ${input.documentNumber}`)
	pdf.setProducer('UrbanLedger')
	pdf.setCreator('UrbanLedger')

	const regular = await pdf.embedFont(StandardFonts.Helvetica)
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

	let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
	let cursor = PAGE_HEIGHT - MARGIN

	const contentWidth = PAGE_WIDTH - MARGIN * 2

	function newPage() {
		page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
		cursor = PAGE_HEIGHT - MARGIN
	}

	function ensure(space: number) {
		if (cursor - space < MARGIN) newPage()
	}

	function text(
		value: string,
		options: { x: number; size: number; font: PDFFont; color?: ReturnType<typeof rgb> }
	) {
		page.drawText(value, {
			x: options.x,
			y: cursor,
			size: options.size,
			font: options.font,
			color: options.color ?? INK
		})
	}

	function rule(target: PDFPage = page) {
		target.drawLine({
			start: { x: MARGIN, y: cursor },
			end: { x: PAGE_WIDTH - MARGIN, y: cursor },
			thickness: 0.75,
			color: RULE
		})
	}

	text(input.businessName, { x: MARGIN, size: 16, font: bold })
	text(input.title, {
		x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(input.title, 16),
		size: 16,
		font: bold
	})
	cursor -= 18

	for (const line of input.businessAddressLines) {
		text(line, { x: MARGIN, size: 9, font: regular, color: MUTED })
		cursor -= 12
	}

	const numberWidth = regular.widthOfTextAtSize(input.documentNumber, 11)
	page.drawText(input.documentNumber, {
		x: PAGE_WIDTH - MARGIN - numberWidth,
		y: PAGE_HEIGHT - MARGIN - 18,
		size: 11,
		font: regular,
		color: MUTED
	})

	cursor -= 10
	rule()
	cursor -= 20

	text(input.partyLabel.toUpperCase(), { x: MARGIN, size: 8, font: bold, color: MUTED })
	cursor -= 13
	text(input.partyName, { x: MARGIN, size: 11, font: bold })
	cursor -= 22

	const factColumnWidth = contentWidth / Math.max(input.facts.length, 1)
	for (const [index, fact] of input.facts.entries()) {
		const x = MARGIN + index * factColumnWidth
		page.drawText(fact.label.toUpperCase(), {
			x,
			y: cursor,
			size: 7.5,
			font: bold,
			color: MUTED
		})
		page.drawText(fact.value, { x, y: cursor - 12, size: 10, font: regular, color: INK })
	}
	cursor -= 34
	rule()
	cursor -= 16

	const totalWeight = input.columns.reduce((sum, column) => sum + column.width, 0)
	const positions = input.columns.map((column, index) => {
		const before = input.columns.slice(0, index).reduce((sum, previous) => sum + previous.width, 0)
		return {
			column,
			x: MARGIN + (before / totalWeight) * contentWidth,
			width: (column.width / totalWeight) * contentWidth
		}
	})

	function drawHeaderRow() {
		for (const { column, x, width } of positions) {
			const label = column.header.toUpperCase()
			const offset = column.align === 'right' ? width - bold.widthOfTextAtSize(label, 7.5) - 4 : 0
			page.drawText(label, { x: x + offset, y: cursor, size: 7.5, font: bold, color: MUTED })
		}
		cursor -= 10
		rule()
		cursor -= 12
	}

	drawHeaderRow()

	for (const row of input.rows) {
		ensure(26)
		if (cursor === PAGE_HEIGHT - MARGIN) drawHeaderRow()

		for (const [index, { column, x, width }] of positions.entries()) {
			const value = row[index] ?? ''
			const offset = column.align === 'right' ? width - regular.widthOfTextAtSize(value, 9) - 4 : 0
			page.drawText(value, { x: x + offset, y: cursor, size: 9, font: regular, color: INK })
		}

		cursor -= 14
	}

	cursor -= 4
	rule()
	cursor -= 18

	for (const total of input.totals) {
		ensure(20)
		const font = total.emphasis === true ? bold : regular
		const size = total.emphasis === true ? 11 : 9.5
		const valueWidth = font.widthOfTextAtSize(total.value, size)
		page.drawText(total.label, {
			x: PAGE_WIDTH - MARGIN - 200,
			y: cursor,
			size,
			font,
			color: total.emphasis === true ? INK : MUTED
		})
		page.drawText(total.value, {
			x: PAGE_WIDTH - MARGIN - valueWidth,
			y: cursor,
			size,
			font,
			color: INK
		})
		cursor -= total.emphasis === true ? 18 : 14
	}

	if (input.notes.length > 0) {
		cursor -= 10
		rule()
		cursor -= 16

		for (const note of input.notes) {
			ensure(16)
			text(note, { x: MARGIN, size: 8.5, font: regular, color: MUTED })
			cursor -= 12
		}
	}

	return pdf.save()
}

export function pdfResponse(bytes: Uint8Array, filename: string) {
	return new Response(bytes as unknown as BodyInit, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'private, no-store'
		}
	})
}
