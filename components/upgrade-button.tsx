'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useProAccess } from '@/lib/pro-access'
import { startProCheckout } from '@/lib/start-checkout'

type Props = {
  size?: 'sm' | 'lg'
  className?: string
}

export function UpgradeButton({ size = 'sm', className = '' }: Props) {
  const unlocked = useProAccess()
  const [busy, setBusy] = useState(false)

  const sizeClasses =
    size === 'lg'
      ? 'px-7 py-3.5 text-[15px] shadow-[0_12px_40px_-10px_rgba(124,58,237,0.65)]'
      : 'px-4 py-2 text-[13px] shadow-[0_0_28px_-6px_rgba(168,85,247,0.7)]'

  const classNameFull =
    'group relative inline-flex items-center justify-center gap-1.5 overflow-hidden rounded-full ' +
    'bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 ' +
    'font-semibold text-white ' +
    'transition-all duration-200 ' +
    'hover:scale-[1.04] hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 ' +
    'hover:shadow-[0_14px_44px_-8px_rgba(168,85,247,0.75)] ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ' +
    'disabled:pointer-events-none disabled:opacity-70 ' +
    sizeClasses +
    (className ? ` ${className}` : '')

  if (unlocked) {
    return (
      <a href="/#generator" className={classNameFull}>
        <span className="relative">{size === 'lg' ? 'Pro unlocked — export PDF & Word' : 'Pro · Export'}</span>
      </a>
    )
  }

  async function handleClick() {
    if (busy) return
    setBusy(true)
    try {
      await startProCheckout()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" onClick={() => void handleClick()} disabled={busy} className={classNameFull}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
      <span className="relative inline-flex items-center gap-1.5">
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
        {busy ? 'Opening checkout…' : 'Pro Export — $4.99 one-time'}
      </span>
    </button>
  )
}
