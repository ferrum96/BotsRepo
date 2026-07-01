type LabelBadgeProps = {
  name: string
  color: string
}

export function LabelBadge({ name, color }: LabelBadgeProps) {
  return (
    <span
      className="inline-block px-2 py-0.5 text-xs text-white rounded-full truncate max-w-[120px]"
      style={{ backgroundColor: color }}
    >
      {name}
    </span>
  )
}
