export function TopBar() {
  return (
    <header className="h-16 fixed top-0 right-0 w-full md:w-[calc(100%-theme(spacing.sidebar))] bg-surface-1 border-b border-outline-level flex items-center justify-between px-container z-40">
      <div className="flex items-center">
        <div className="md:hidden mr-stack-md">
          <span className="material-symbols-outlined text-electric cursor-pointer">menu</span>
        </div>
        <h2 className="text-headline-md text-electric">Clan Command</h2>
      </div>
      <div className="flex items-center gap-stack-md">
        <button className="btn-ghost">
          <span className="material-symbols-outlined text-[20px]">notifications</span>
        </button>
        <button className="btn-ghost">
          <span className="material-symbols-outlined text-[20px]">settings</span>
        </button>
        <div className="w-8 h-8 rounded-full border border-outline-level overflow-hidden bg-surface-2 flex items-center justify-center text-label-caps">
          AD
        </div>
      </div>
    </header>
  )
}
