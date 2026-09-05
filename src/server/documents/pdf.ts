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

// Base-14 fonts are embedded by the renderer itself, so nothing is fetched at
// request time.
export async function renderDocumentPdf(input: PdfDocumentInput): Promise<Uint8Array> {
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
