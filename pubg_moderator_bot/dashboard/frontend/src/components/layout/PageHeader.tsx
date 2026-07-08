import { Input } from '../ui/Input'

interface PageHeaderProps {
  title: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}

export function PageHeader({ title, placeholder, value, onChange }: PageHeaderProps) {
  return (
    <div className="mb-stack-lg flex flex-col sm:flex-row sm:items-center justify-between gap-stack-md">
      <h2 className="text-[32px] leading-tight font-bold text-[#dae2fd] tracking-tight shrink-0">
        {title}
      </h2>
      <Input
        variant="light"
        icon={<span className="material-symbols-outlined text-[20px]">search</span>}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full sm:w-72"
      />
    </div>
  )
}
