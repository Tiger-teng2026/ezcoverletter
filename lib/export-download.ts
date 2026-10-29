/** Print server-issued letter HTML. This does not assemble the paid document. */
export function printHtmlDocument(html: string) {
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
      window.setTimeout(cleanup, 1000)
    }
  }

  if (frameDocument.readyState === 'complete') {
    window.setTimeout(triggerPrint, 50)
  } else {
    iframe.onload = () => window.setTimeout(triggerPrint, 50)
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
