import { Input } from '../ui/Input'

interface PageHeaderProps {
  title: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}

export function PageHeader({ title, placeholder, value, onChange }: PageHeaderProps) {
  return (
    <div className="mb-stack-md sm:mb-stack-lg flex flex-col gap-stack-md sm:flex-row sm:items-center sm:justify-between">
      <h2 className="min-w-0 text-[22px] sm:text-[28px] lg:text-[32px] leading-tight font-bold text-[#dae2fd] tracking-tight">
        {title}
      </h2>
      <Input
        variant="light"
        icon={<span className="material-symbols-outlined text-[20px]">search</span>}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full sm:w-72 shrink-0"
      />
    </div>
  )
}
