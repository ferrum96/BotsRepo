'use client';

import { PAGES, Page } from '@/lib/types';

interface SidebarProps {
  page: Page;
  setPage: (page: Page) => void;
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggle: () => void;
}

export function Sidebar({ page, setPage, open, collapsed, onClose, onToggle }: SidebarProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (isMobile && !open) return null;

  if (!isMobile && collapsed) {
    return (
      <div className="fixed left-0 top-0 bottom-0 w-10 z-50 flex flex-col items-center bg-gradient-to-b from-rose-400 to-peach-400 text-white shadow-xl pt-4">
        <button
          onClick={onToggle}
          className="text-white text-lg mb-4 hover:bg-white/20 rounded-lg w-8 h-8 flex items-center justify-center transition-all"
        >
          ☰
        </button>
        {PAGES.map((pg) => (
          <button
            key={pg.k}
            onClick={() => setPage(pg.k as Page)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg mb-1 hover:bg-white/20 transition-all text-lg ${page === pg.k ? ' bg-white/20' : ''}`}
          >
            {pg.i}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={isMobile ? 'fixed inset-0 z-50 flex' : 'fixed left-0 top-0 bottom-0 w-56 z-50 flex flex-col transition-all duration-300'}>
      {isMobile && (
        <div className="overlay absolute inset-0 bg-black/40" onClick={onClose} />
      )}
      <div className={`${isMobile ? 'absolute left-0 top-0 bottom-0 w-56 sidebar-open ' : ''}bg-gradient-to-b from-rose-400 to-peach-400 text-white shadow-xl flex flex-col h-full`}>
        <div className="p-4 border-b border-white/20 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">🌸 CRM @fkandu</h1>
            <p className="text-xs opacity-80 mt-1">Дети и Желания</p>
          </div>
          <div className="flex items-center gap-2">
            {isMobile ? (
              <button onClick={onClose} className="text-white text-xl">✕</button>
            ) : (
              <button onClick={onToggle} className="text-white text-lg hover:bg-white/20 rounded-lg w-8 h-8 flex items-center justify-center transition-all">
                ◀
              </button>
            )}
          </div>
        </div>
        <nav className="sidebar-nav flex-1 py-2">
          {PAGES.map((pg) => (
            <button
              key={pg.k}
              onClick={() => {
                setPage(pg.k as Page);
                isMobile ? onClose() : onToggle();
              }}
              className={`sidebar-item w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${page === pg.k ? 'active font-semibold' : ''}`}
            >
              <span className="text-lg">{pg.i}</span> {pg.l}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/20 text-xs opacity-70">
          Данные из Telegram-бота
        </div>
      </div>
    </div>
  );
}
