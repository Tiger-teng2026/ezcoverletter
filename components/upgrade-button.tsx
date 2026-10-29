'use client'

import { useProAccess } from '@/lib/pro-access'

type Props = {
  size?: 'sm' | 'lg'
  className?: string
}

export function UpgradeButton({ size = 'sm', className = '' }: Props) {
  const unlocked = useProAccess()

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

  return (
    <a href={size === 'lg' ? '/cover-letter#generator' : '/pricing'} className={classNameFull}>
      <span className="relative">{size === 'lg' ? 'Choose a letter to export' : 'Plans'}</span>
    </a>
  )
}
