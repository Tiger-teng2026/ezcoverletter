import {
  resolveExportContact,
  type SignOffContact,
  withExportSignOff,
} from '@/lib/sign-off'

/** Normalize letter text for Word/PDF export — single spaces, clean punctuation. */
export function normalizeExportText(letter: string): string {
  return (
    letter
      .replace(/\*\*/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/ ([,.!?;:%])/g, '$1')
      .replace(/([(\[{]) /g, '$1')
      .replace(/ ([)\]},.])/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/**
 * Prepare letter for paid PDF/Word export:
 * strip AI sign-off, then append exactly one footer with REAL contact fields.
 * Throws if contact is incomplete or still contains placeholders.
 */
export function prepareLetterForExport(letter: string, contact?: SignOffContact): string {
  const resolved = resolveExportContact(contact)
  if (!resolved) {
    throw new Error(
      'Please fill in your Full Name, Phone, Email, and LinkedIn before exporting PDF/Word.',
    )
  }
  const prepared = withExportSignOff(normalizeExportText(letter), resolved)
  // Hard guarantee: paid exports must never ship bracket placeholders.
  if (/\[[^\]]+\]/.test(prepared)) {
    throw new Error(
      'Export blocked: placeholder text was detected. Please check your sign-off details and try again.',
    )
  }
  return prepared
}

export function letterToParagraphs(letter: string, contact?: SignOffContact): string[] {
  const normalized = prepareLetterForExport(letter, contact)
  if (!normalized) return []

  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildLetterBodyHtml(letter: string, contact?: SignOffContact): string {
  return letterToParagraphs(letter, contact)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('')
}

const LETTER_DOCUMENT_STYLES = `
  @page {
    size: letter;
    margin: 1in;
  }
  * {
    box-sizing: border-box;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: auto !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    background: #ffffff !important;
    color: #000000 !important;
    overflow: visible !important;
  }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
  }
  #letter {
    margin: 0;
    padding: 0;
    width: 100%;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    page-break-after: avoid;
    page-break-inside: avoid;
    break-after: avoid;
    break-inside: avoid;
  }
  #letter p {
    margin: 0 0 10pt 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    text-align: left;
    color: #000000;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  #letter p:last-child {
    margin-bottom: 0;
  }
`

/** Standalone HTML used for iframe PDF print — letter only, no site chrome. */
export function buildPrintDocumentHtml(letter: string, contact?: SignOffContact): string {
  const body = buildLetterBodyHtml(letter, contact)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cover Letter</title>
<style>${LETTER_DOCUMENT_STYLES}</style>
</head>
<body>
<main id="letter">${body}</main>
</body>
</html>`
}

/**
 * Print a single-page PDF via a temporary iframe that contains ONLY the letter.
 * Avoids blank pages caused by printing the full app layout with visibility:hidden.
 */
export function printLetterAsPdf(letter: string, contact?: SignOffContact) {
  const html = buildPrintDocumentHtml(letter, contact)
  const iframe = document.createElement('iframe')
  iframe.setAttribute(
    'style',
    'position:fixed;left:0;top:0;width:0;height:0;border:0;opacity:0;pointer-events:none;',
  )
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  const frameWindow = iframe.contentWindow
  const frameDocument = iframe.contentDocument || frameWindow?.document
  if (!frameWindow || !frameDocument) {
    iframe.remove()
    throw new Error('Unable to create print frame')
  }

  frameDocument.open()
  frameDocument.write(html)
  frameDocument.close()

  const cleanup = () => {
    iframe.remove()
  }

  const triggerPrint = () => {
    try {
      frameWindow.focus()
      frameWindow.print()
    } finally {
      // Allow the print dialog to capture content before removing the frame.
      window.setTimeout(cleanup, 1000)
    }
  }

  // Ensure layout is ready inside the iframe before printing.
  if (frameDocument.readyState === 'complete') {
    window.setTimeout(triggerPrint, 50)
  } else {
    iframe.onload = () => window.setTimeout(triggerPrint, 50)
  }
}

/**
 * International business letter Word (.doc via HTML) — Arial 11pt, 1.5 line-height, 1" margins.
 */
export function buildWordDocumentHtml(letter: string, contact?: SignOffContact): string {
  const body = buildLetterBodyHtml(letter, contact)

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Cover Letter</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
${LETTER_DOCUMENT_STYLES}
</style>
</head>
<body>
<main id="letter">${body}</main>
</body>
</html>`
}

export function downloadWordDocument(
  letter: string,
  filename = 'cover-letter.doc',
  contact?: SignOffContact,
) {
  const html = buildWordDocumentHtml(letter, contact)
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
