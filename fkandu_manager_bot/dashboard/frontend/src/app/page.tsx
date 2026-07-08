'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Lead, Stats, Page, PAGES } from '@/lib/types';
import { api } from '@/lib/utils';
import { Sidebar } from '@/components/Sidebar';
import { DashboardPage } from '@/components/DashboardPage';
import { KanbanPage } from '@/components/KanbanPage';
import { LeadsPage } from '@/components/LeadsPage';
import { HotLeadsPage } from '@/components/HotLeadsPage';
import { AnalyticsPage } from '@/components/AnalyticsPage';

const VALID_PAGES: Page[] = ['dashboard', 'kanban', 'leads', 'hot', 'analytics'];

export default function Home() {
  const hash = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '').split('?')[0];
  const initial: Page = VALID_PAGES.includes(hash as Page) ? (hash as Page) : 'kanban';

  const [page, setPageRaw] = useState<Page>(initial);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    hot: 0,
    new: 0,
    revenue: 0,
    by_category: [],
    by_score: [],
    by_status: [],
    monthly_revenue: [],
    category_revenue: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [openLeadId, setOpenLeadId] = useState<number | null>(null);

  const isMobile = useSyncExternalStore(
    (callback) => {
      const mq = window.matchMedia('(max-width: 767px)');
      mq.addEventListener('change', callback);
      return () => mq.removeEventListener('change', callback);
    },
    () => window.matchMedia('(max-width: 767px)').matches,
    () => false
  );

  const setPage = (p: Page) => {
    window.location.hash = p;
    setPageRaw(p);
  };

  const refresh = useCallback(() => {
    Promise.all([api<Lead[]>('/api/leads'), api<Stats>('/api/stats')])
      .then(([leadsData, statsData]) => {
        setLeads(leadsData);
        setStats(statsData);
        setError(null);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || 'Не удалось загрузить данные');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const handler = () => {
      const h = (window.location.hash || '').replace('#', '').split('?')[0];
      if (VALID_PAGES.includes(h as Page)) {
        setPageRaw(h as Page);
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen safe-top">
        <div className="text-center max-w-md px-4">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-gray-800 font-medium mb-2">Ошибка загрузки данных</p>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-pink-500 text-white rounded-lg text-sm"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen safe-top">
        <div className="text-center">
          <p className="text-4xl mb-4">🌸</p>
          <p className="text-gray-500 text-sm">Загрузка...</p>
        </div>
      </div>
    );
  }

  const currentPage = PAGES.find((p) => p.k === page);

  const getMarginLeft = () => {
    if (typeof window === 'undefined') return '0px';
    if (isMobile) return '0';
    return collapsed ? '40px' : '224px';
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar
        page={page}
        setPage={setPage}
        open={menuOpen}
        collapsed={collapsed}
        onClose={() => setMenuOpen(false)}
        onToggle={() => setCollapsed(!collapsed)}
      />

      <main
        className="flex-1 transition-all duration-300 min-w-0"
        style={{ marginLeft: getMarginLeft() }}
      >
        {/* Mobile hamburger - absolute positioned */}
        {!menuOpen && (
          <div className="md:hidden fixed top-3 pl-4 z-50">
            <button
              onClick={() => setMenuOpen(true)}
              className="text-gray-600 text-xl w-11 h-11 flex items-center justify-center active:bg-gray-100 rounded-lg transition-colors bg-white/80 backdrop-blur-sm shadow-sm"
            >
              ☰
            </button>
          </div>
        )}

        {/* 8pt grid padding: 16px mobile, 24px tablet, 32px desktop, 48px large */}
        <div className="p-2 md:p-4 lg:p-6 xl:p-8 safe-bottom flex flex-col" style={{ minHeight: 'calc(100vh - 0px)' }}>
          <div key={page} className={`page-enter ${page === 'kanban' ? 'flex flex-col flex-1 min-h-0' : ''}`}>
            {page === 'dashboard' && <DashboardPage leads={leads} stats={stats} />}
            {page === 'kanban' && <KanbanPage leads={leads} onRefresh={refresh} setPage={setPage} onOpenLead={(id) => { setOpenLeadId(id); setPage('leads'); }} />}
            {page === 'leads' && <LeadsPage leads={leads} onRefresh={refresh} openLeadId={openLeadId} onLeadOpened={() => setOpenLeadId(null)} />}
            {page === 'hot' && <HotLeadsPage leads={leads} />}
            {page === 'analytics' && <AnalyticsPage stats={stats} />}
          </div>
        </div>
      </main>
    </div>
  );
}
