import { InputHTMLAttributes, ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode
  variant?: 'dark' | 'light'
}

export function Input({
  icon,
  variant = 'dark',
  className = '',
  ...props
}: InputProps) {
  const variantClass = variant === 'light' ? 'input-light' : 'input-dark'

  return (
    <div className="relative">
      {icon && (
        <span
          className={`absolute left-3 top-1/2 -translate-y-1/2 ${
            variant === 'light' ? 'text-slate-400' : 'text-on-surface-variant'
          }`}
        >
          {icon}
        </span>
      )}
      <input
        className={`${variantClass} w-full ${icon ? 'pl-10' : ''} ${className}`}
        {...props}
      />
    </div>
  )
}
