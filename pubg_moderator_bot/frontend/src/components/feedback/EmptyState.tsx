interface EmptyStateProps {
  title?: string
  subtitle?: string
}

export function EmptyState({
  title = 'Ничего не найдено',
  subtitle = 'Попробуй изменить фильтры или поисковый запрос.',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-stack-lg text-on-surface-variant">
      <span className="material-symbols-outlined text-4xl mb-stack-md">inbox</span>
      <p className="text-headline-md text-on-surface">{title}</p>
      <p className="text-body-sm mt-stack-sm">{subtitle}</p>
    </div>
  )
}
