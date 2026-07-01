'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lead, Stats, Page, PAGES } from '@/lib/types';
import { api } from '@/lib/utils';
import { Sidebar } from '@/components/Sidebar';
import { DashboardPage } from '@/components/DashboardPage';
import { KanbanPage } from '@/components/KanbanPage';
import { LeadsPage } from '@/components/LeadsPage';
import { HotLeadsPage } from '@/components/HotLeadsPage';
import { AnalyticsPage } from '@/components/AnalyticsPage';

export default function Home() {
  const validPages: Page[] = ['dashboard', 'kanban', 'leads', 'hot', 'analytics'];
  const hash = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '').split('?')[0];
  const initial: Page = validPages.includes(hash as Page) ? (hash as Page) : 'kanban';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const setPage = (p: Page) => {
    window.location.hash = p;
    setPageRaw(p);
  };

  const refresh = useCallback(() => {
    Promise.all([api('/api/leads'), api('/api/stats')])
      .then(([leadsData, statsData]) => {
        setLeads(leadsData);
        setStats(statsData);
        setLoading(false);
      })
      .catch(() => {
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
      if (validPages.includes(h as Page)) {
        setPageRaw(h as Page);
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-4xl mb-4">🌸</p>
          <p className="text-gray-500">Загрузка...</p>
        </div>
      </div>
    );
  }

  const currentPage = PAGES.find((p) => p.k === page);

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
        className="flex-1"
        style={
          typeof window !== 'undefined' && window.innerWidth >= 768
            ? { marginLeft: collapsed ? '40px' : '224px', transition: 'margin .3s' }
            : {}
        }
      >
        <div className="md:hidden sticky top-0 z-40 bg-white border-b border-gray-100 px-3 py-2.5 flex items-center gap-3 shadow-sm">
          <button onClick={() => setMenuOpen(true)} className="text-gray-600 text-xl">
            ☰
          </button>
          <span className="font-bold text-sm">
            {currentPage ? currentPage.i + ' ' + currentPage.l : 'CRM'}
          </span>
        </div>

        <div className="p-3 md:p-6">
          {page === 'dashboard' && <DashboardPage leads={leads} stats={stats} />}
          {page === 'kanban' && <KanbanPage leads={leads} onRefresh={refresh} setPage={setPage} />}
          {page === 'leads' && <LeadsPage leads={leads} onRefresh={refresh} />}
          {page === 'hot' && <HotLeadsPage leads={leads} />}
          {page === 'analytics' && <AnalyticsPage stats={stats} />}
        </div>
      </main>
    </div>
  );
}
