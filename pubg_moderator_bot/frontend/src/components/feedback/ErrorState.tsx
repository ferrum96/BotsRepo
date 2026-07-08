interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-stack-lg text-on-surface-variant">
      <span className="material-symbols-outlined text-4xl mb-stack-md text-error">error</span>
      <p className="text-headline-md text-on-surface">Ошибка загрузки</p>
      <p className="text-body-sm mt-stack-sm max-w-md text-center">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-primary mt-stack-md"
        >
          Повторить
        </button>
      )}
    </div>
  )
}
