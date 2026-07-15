import { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  className?: string
}

export function Badge({ children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-block border px-2 py-1 rounded text-[10px] uppercase text-label-caps font-mono ${className}`}>
      {children}
    </span>
  )
}
