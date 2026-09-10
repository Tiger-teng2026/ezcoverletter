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

export function grantProAccess(checkoutId?: string) {
  if (!canUseStorage()) return

  const record: ProRecord = {
    unlocked: true,
    checkoutId,
    at: Date.now(),
  }

  try {
    window.localStorage.setItem(PRO_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // ignore
  }

  window.dispatchEvent(new Event(PRO_EVENT))
}

export function useProAccess() {
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    const sync = () => setUnlocked(readProAccess())
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener(PRO_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(PRO_EVENT, sync)
    }
  }, [])

  return unlocked
}
