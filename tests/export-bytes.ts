import { inflateSync } from 'node:zlib'
import { strFromU8, unzipSync } from 'fflate'
import { PDFDocument } from 'pdf-lib'

export async function responseBytes(response: Response) {
  return new Uint8Array(await response.arrayBuffer())
}

export function docxDocumentXml(bytes: Uint8Array) {
  const entries = unzipSync(bytes)
  const xml = entries['word/document.xml']
  if (!xml) throw new Error('DOCX is missing word/document.xml')
  return strFromU8(xml)
}

export function docxContentTypes(bytes: Uint8Array) {
  const entries = unzipSync(bytes)
  const xml = entries['[Content_Types].xml']
  if (!xml) throw new Error('DOCX is missing content types')
  return strFromU8(xml)
}

export async function pdfPageCount(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes)
  return pdf.getPageCount()
}

export function pdfText(bytes: Uint8Array) {
  const source = Buffer.from(bytes).toString('latin1')
  const chunks: string[] = []
  const pattern = /stream\r?\n/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    const start = match.index + match[0].length
    const end = source.indexOf('endstream', start)
    if (end < 0) break
    let inflated: Buffer
    try {
      inflated = inflateSync(Buffer.from(source.slice(start, end), 'latin1'))
    } catch {
      continue
    }
    const text = inflated.toString('latin1')
    for (const part of text.match(/\((?:\\.|[^\\)])*\)/g) || []) {
      chunks.push(part.slice(1, -1).replace(/\\([()\\])/g, '$1'))
    }
    for (const hex of text.match(/<([0-9A-Fa-f\s]+)>/g) || []) {
      const raw = hex.slice(1, -1).replace(/\s+/g, '')
      let decoded = ''
      for (let index = 0; index + 1 < raw.length; index += 2) {
        decoded += String.fromCharCode(Number.parseInt(raw.slice(index, index + 2), 16))
      }
      chunks.push(decoded)
    }
  }
  return chunks.join('\n')
}
