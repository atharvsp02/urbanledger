import 'server-only'

export type InspectedImage = {
	mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
	width: number
	height: number
}

function readPng(bytes: Buffer): InspectedImage | null {
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

	if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null
	if (bytes.subarray(12, 16).toString('latin1') !== 'IHDR') return null

	return { mimeType: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

function readJpeg(bytes: Buffer): InspectedImage | null {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

	let offset = 2

	while (offset + 9 < bytes.length) {
		if (bytes[offset] !== 0xff) {
			offset += 1
			continue
		}

		const marker = bytes[offset + 1]
		const length = bytes.readUInt16BE(offset + 2)
		const isStartOfFrame =
			marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

		if (isStartOfFrame) {
			return {
				mimeType: 'image/jpeg',
				height: bytes.readUInt16BE(offset + 5),
				width: bytes.readUInt16BE(offset + 7)
			}
		}

		offset += 2 + length
	}

	return null
}

function readWebp(bytes: Buffer): InspectedImage | null {
	if (bytes.length < 30) return null
	if (bytes.subarray(0, 4).toString('latin1') !== 'RIFF') return null
	if (bytes.subarray(8, 12).toString('latin1') !== 'WEBP') return null

	const chunk = bytes.subarray(12, 16).toString('latin1')

	if (chunk === 'VP8 ') {
		if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null
		return {
			mimeType: 'image/webp',
			width: bytes.readUInt16LE(26) & 0x3fff,
			height: bytes.readUInt16LE(28) & 0x3fff
		}
	}

	if (chunk === 'VP8L') {
		if (bytes[20] !== 0x2f) return null
		const header = bytes.readUInt32LE(21)
		return {
			mimeType: 'image/webp',
			width: (header & 0x3fff) + 1,
			height: ((header >> 14) & 0x3fff) + 1
		}
	}

	if (chunk === 'VP8X') {
		return {
			mimeType: 'image/webp',
			width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
			height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1
		}
	}

	return null
}

// The declared MIME type is browser input; only the actual bytes decide what is
// stored, so a renamed script can never reach the private bucket.
export function inspectImage(bytes: Buffer): InspectedImage | null {
	return readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes)
}
