'use client'

import { useEffect, useState } from 'react'
import { storedExportDocumentForLetter } from '@/lib/export-document-session'
import { letterExportUnlocked } from '@/lib/letter-export-access'
import { useProAccess } from '@/lib/pro-access'

type AccountExportStatus = {
  plan?: unknown
  purchases?: { id?: unknown }[]
}

/** Reads the current letter's server-confirmed export status. URL payment params are ignored. */
export function useLetterExportAccess(letter: string) {
  const legacyEntitled = useProAccess()
  const [subscribed, setSubscribed] = useState(false)
  const [paidDocumentIds, setPaidDocumentIds] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/account', { cache: 'no-store' })
        const data = (await res.json().catch(() => null)) as AccountExportStatus | null
        if (cancelled) return
        if (!res.ok || !data) {
          setSubscribed(false)
          setPaidDocumentIds([])
          return
        }
        setSubscribed(data.plan === 'creator' || data.plan === 'pro')
        setPaidDocumentIds(
          Array.isArray(data.purchases)
            ? data.purchases.flatMap((row) => (row && typeof row.id === 'string' && row.id.trim() ? [row.id] : []))
            : [],
        )
      } catch {
        if (!cancelled) {
          setSubscribed(false)
          setPaidDocumentIds([])
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return letterExportUnlocked({
    legacyEntitled,
    subscribed,
    documentId: letter.trim() ? storedExportDocumentForLetter(letter) : null,
    paidDocumentIds,
  })
}
