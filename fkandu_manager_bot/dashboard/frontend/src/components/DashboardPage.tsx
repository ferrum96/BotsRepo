'use client';

import { Lead, Stats } from '@/lib/types';
import { Metric } from './Metric';
import { formatMoney, formatDate, getScoreBg } from '@/lib/utils';
import { STATUS_BG, STATUS_TEXT } from '@/lib/types';

interface DashboardPageProps {
  leads: Lead[];
  stats: Stats;
}

const CATEGORY_COLORS = ['#ff6b9d', '#c084fc', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb923c'];

export function DashboardPage({ leads, stats }: DashboardPageProps) {
  return (
    <div>
      <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold text-gray-900 mb-4 md:mb-8 text-center md:text-left md:pl-0">📊 Обзор канала</h1>
      
      {/* Metrics grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4 md:mb-8">
        <Metric icon="📥" label="Всего" value={stats.total} />
        <Metric icon="🔥" label="Горячих" value={stats.hot} />
        <Metric icon="🆕" label="Новых" value={stats.new} />
        <Metric icon="💰" label="Выручка" value={formatMoney(stats.revenue)} />
      </div>

      {/* Categories & Scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6 md:gap-4 mb-4 md:mb-8">
        <div className="bg-white rounded-xl p-5 md:p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold mb-6 md:mb-8 text-base md:text-lg text-gray-900">📦 По категориям</h3>
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 py-2">
            {stats.by_category.length ? (
              stats.by_category.map((c, i) => (
                <div key={i} className="text-center px-2">
                  <div
                    className="mx-auto mb-3"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: CATEGORY_COLORS[i % 9],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '14px',
                    }}
                  >
                    {c.count}
                  </div>
                  <p className="text-xs text-gray-600 max-w-[80px] md:max-w-[100px] truncate">
                    {c.category}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-sm">Нет данных</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 md:p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold mb-6 md:mb-8 text-base md:text-lg text-gray-900">🔥 По оценкам</h3>
          <div className="space-y-4">
            {stats.by_score.map((s) => {
              const mx = Math.max(...stats.by_score.map((x) => x.count));
              return (
                <div key={s.lead_score} className="flex items-center gap-3">
                  <span className="text-xs md:text-sm w-20 md:w-28 text-right text-gray-600 truncate">
                    {s.lead_score}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 md:h-8 overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center px-3"
                      style={{
                        background: s.lead_score.includes('ГОРЯЧИЙ')
                          ? '#EF4444'
                          : s.lead_score.includes('Теплый')
                          ? '#EAB308'
                          : '#3B82F6',
                        width: Math.max(8, (s.count / mx) * 100) + '%',
                      }}
                    >
                      <span className="text-white text-xs md:text-sm font-bold">{s.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent 5 */}
      <div className="bg-white rounded-xl p-5 md:p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold mb-6 md:mb-8 text-base md:text-lg text-gray-900">🕐 Последние 5</h3>
        
        {/* Mobile: cards */}
        <div className="md:hidden space-y-4">
          {leads.slice(0, 5).map((l) => (
            <div key={l.id} className="mobile-card pb-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900">{l.full_name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_BG[l.status] || ''} ${STATUS_TEXT[l.status] || ''}`}>
                      {l.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">{l.category}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-700">{l.budget}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${getScoreBg(l.lead_score)}`}>
                      {l.lead_score}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDate(l.created_at)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-3 px-4 font-medium">Дата</th>
                <th className="pb-3 px-4 font-medium">Имя</th>
                <th className="pb-3 px-4 font-medium">Категория</th>
                <th className="pb-3 px-4 font-medium">Бюджет</th>
                <th className="pb-3 px-4 font-medium">Оценка</th>
                <th className="pb-3 px-4 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {leads.slice(0, 5).map((l) => (
                <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 whitespace-nowrap text-gray-700">{formatDate(l.created_at)}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{l.full_name}</td>
                  <td className="py-3 px-4 truncate max-w-[120px] text-gray-700">{l.category}</td>
                  <td className="py-3 px-4 text-gray-700">{l.budget}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${getScoreBg(l.lead_score)}`}>
                      {l.lead_score}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_BG[l.status] || ''} ${STATUS_TEXT[l.status] || ''}`}>
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
