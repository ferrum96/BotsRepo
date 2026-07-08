import { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'ghost'
}

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonProps) {
  const base = 'text-label-caps px-4 py-2 rounded transition-opacity'
  const variants = {
    primary: 'bg-electric text-black hover:opacity-90',
    ghost: 'bg-transparent border border-outline-level text-on-surface hover:bg-surface-2',
  }

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
