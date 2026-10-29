'use client'

import { useEffect, useState } from 'react'

export const PRO_STORAGE_KEY = 'ezcl_pro_export_v1'
export const PRO_EVENT = 'ezcl-pro'

type ProRecord = {
  unlocked: true
  checkoutId?: string
  at: number
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

/** Bumped when display state is written locally so an older entitlement response cannot undo it. */
let displayEpoch = 0

/** Browser display cache only. Paid export is authorized by the server cookie. */
export function readProAccess(): boolean {
  if (!canUseStorage()) return false

  try {
    const raw = window.localStorage.getItem(PRO_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as Partial<ProRecord>
    return parsed.unlocked === true
  } catch {
    return false
  }
}

function writeDisplay(checkoutId?: string) {
  const record: ProRecord = {
    unlocked: true,
    checkoutId,
    at: Date.now(),
  }
  window.localStorage.setItem(PRO_STORAGE_KEY, JSON.stringify(record))
}

export function grantProAccess(checkoutId?: string): boolean {
  if (!canUseStorage()) return false

  try {
    writeDisplay(checkoutId)
    const raw = window.localStorage.getItem(PRO_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as Partial<ProRecord>
    if (parsed.unlocked !== true) return false
  } catch {
    return false
  }

  displayEpoch += 1
  window.dispatchEvent(new Event(PRO_EVENT))
  return true
}

export function clearProDisplay() {
  displayEpoch += 1
  if (!canUseStorage()) return
  try {
    window.localStorage.removeItem(PRO_STORAGE_KEY)
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(PRO_EVENT))
}

/** Ask the server whether the signed entitlement cookie is valid. */
export async function refreshEntitlement(): Promise<boolean> {
  const epoch = displayEpoch
  try {
    const res = await fetch('/api/entitlement', { cache: 'no-store' })
    if (displayEpoch !== epoch) return readProAccess()
    const data = (await res.json().catch(() => null)) as { entitled?: boolean } | null
    const entitled = res.ok && data?.entitled === true
    if (canUseStorage()) {
      if (entitled) {
        if (!readProAccess()) {
          try {
            writeDisplay()
          } catch {
            // The cookie can still authorize export when local display storage is blocked.
          }
        }
      } else if (readProAccess()) {
        try {
          window.localStorage.removeItem(PRO_STORAGE_KEY)
        } catch {
          // ignore
        }
      }
    }
    window.dispatchEvent(new Event(PRO_EVENT))
    return entitled
  } catch {
    if (displayEpoch !== epoch) return readProAccess()
    return false
  }
}

export function useProAccess() {
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    let cancelled = false
    const syncDisplay = () => {
      if (!cancelled) setUnlocked(readProAccess())
    }

    syncDisplay()
    void refreshEntitlement().then((entitled) => {
      if (!cancelled) setUnlocked(entitled)
    })

    window.addEventListener('storage', syncDisplay)
    window.addEventListener(PRO_EVENT, syncDisplay)
    return () => {
      cancelled = true
      window.removeEventListener('storage', syncDisplay)
      window.removeEventListener(PRO_EVENT, syncDisplay)
    }
  }, [])

  return unlocked
}
