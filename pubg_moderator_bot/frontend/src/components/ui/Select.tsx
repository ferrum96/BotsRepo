import { SelectHTMLAttributes } from 'react'

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`input-dark appearance-none pr-8 ${className}`} {...props}>
      {children}
    </select>
  )
}
