import { InputHTMLAttributes, ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode
}

export function Input({ icon, className = '', ...props }: InputProps) {
  return (
    <div className="relative">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
          {icon}
        </span>
      )}
      <input
        className={`input-dark w-full ${icon ? 'pl-10' : ''} ${className}`}
        {...props}
      />
    </div>
  )
}
