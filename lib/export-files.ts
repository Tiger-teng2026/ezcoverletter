import { strToU8, zipSync } from 'fflate'
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { letterToParagraphs } from '@/lib/export-letter'
import type { SignOffContact } from '@/lib/sign-off'

export const DOCX_FILENAME = 'cover-letter.docx'
export const PDF_FILENAME = 'cover-letter.pdf'
export const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const PDF_CONTENT_TYPE = 'application/pdf'

const LETTER_WIDTH = 12240
const LETTER_HEIGHT = 15840

function xmlText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function paragraphXml(text: string) {
  return `<w:p><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${xmlText(text)}</w:t></w:r></w:p>`
}

/** Real OOXML package. The bytes are a zip, not renamed HTML. */
export function buildDocx(letter: string, contact?: SignOffContact): Uint8Array {
  const paragraphs = letterToParagraphs(letter, contact)
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(paragraphXml).join('')}<w:sectPr><w:pgSz w:w="${LETTER_WIDTH}" w:h="${LETTER_HEIGHT}"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style></w:styles>`
  return zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(rels),
      'word/document.xml': strToU8(document),
      'word/_rels/document.xml.rels': strToU8(documentRels),
      'word/styles.xml': strToU8(styles),
    },
    { level: 6 },
  )
}

const PDF_PAGE_WIDTH = 612
const PDF_PAGE_HEIGHT = 792
const PDF_MARGIN = 72
const PDF_FONT_SIZE = 11
const PDF_LINE = 16
const PDF_PARAGRAPH_GAP = 10

function pdfSafe(value: string) {
  return value
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA1-\xFF]/g, '')
}

function wrapPdfLine(text: string, font: PDFFont, width: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  const pushWord = (word: string) => {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, PDF_FONT_SIZE) <= width) {
      current = next
      return
    }
    if (current) lines.push(current)
    if (font.widthOfTextAtSize(word, PDF_FONT_SIZE) <= width) {
      current = word
      return
    }
    let piece = ''
    for (const char of word) {
      const expanded = piece + char
      if (font.widthOfTextAtSize(expanded, PDF_FONT_SIZE) <= width) piece = expanded
      else {
        if (piece) lines.push(piece)
        piece = char
      }
    }
    current = piece
  }
  for (const word of words) pushWord(word)
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

/** Real PDF bytes. Pages are US Letter and flow onto the next page when the text no longer fits. */
export async function buildPdf(letter: string, contact?: SignOffContact): Promise<Uint8Array> {
  const paragraphs = letterToParagraphs(letter, contact).map(pdfSafe)
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const width = PDF_PAGE_WIDTH - PDF_MARGIN * 2
  let page: PDFPage = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
  let y = PDF_PAGE_HEIGHT - PDF_MARGIN

  const nextPage = () => {
    page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
    y = PDF_PAGE_HEIGHT - PDF_MARGIN
  }

  paragraphs.forEach((paragraph, index) => {
    const lines = wrapPdfLine(paragraph, font, width)
    for (const line of lines) {
      if (y - PDF_LINE < PDF_MARGIN) nextPage()
      page.drawText(line, { x: PDF_MARGIN, y: y - PDF_FONT_SIZE, size: PDF_FONT_SIZE, font })
      y -= PDF_LINE
    }
    if (index < paragraphs.length - 1) y -= PDF_PARAGRAPH_GAP
  })

  return pdf.save()
}
