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
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">📊 Обзор канала</h1>
      
      <div className="grid grid-cols-2 gap-2 md:gap-4 mb-4 md:mb-6">
        <Metric icon="📥" label="Всего" value={stats.total} />
        <Metric icon="🔥" label="Горячих" value={stats.hot} />
        <Metric icon="🆕" label="Новых" value={stats.new} />
        <Metric icon="💰" label="Выручка" value={formatMoney(stats.revenue)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm border border-gray-100">
          <h3 className="font-semibold mb-3 text-sm md:text-base">📦 По категориям</h3>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 py-2">
            {stats.by_category.length ? (
              stats.by_category.map((c, i) => (
                <div key={i} className="text-center px-1">
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: CATEGORY_COLORS[i % 9],
                      margin: '0 auto 2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '11px',
                    }}
                  >
                    {c.count}
                  </div>
                  <p className="text-[9px] md:text-xs text-gray-600 max-w-[80px] md:max-w-[100px] truncate">
                    {c.category}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-gray-400">Нет данных</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm border border-gray-100">
          <h3 className="font-semibold mb-3 text-sm md:text-base">🔥 По оценкам</h3>
          <div className="space-y-2">
            {stats.by_score.map((s) => {
              const mx = Math.max(...stats.by_score.map((x) => x.count));
              return (
                <div key={s.lead_score} className="flex items-center gap-2">
                  <span className="text-[10px] md:text-xs w-20 md:w-28 text-right text-gray-600 truncate">
                    {s.lead_score}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 md:h-6 overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center px-2"
                      style={{
                        background: s.lead_score.includes('ГОРЯЧИЙ')
                          ? '#ff4b4b'
                          : s.lead_score.includes('Теплый')
                          ? '#ffc107'
                          : '#4a90e2',
                        width: Math.max(8, (s.count / mx) * 100) + '%',
                      }}
                    >
                      <span className="text-white text-[10px] md:text-xs font-bold">{s.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm border border-gray-100">
        <h3 className="font-semibold mb-3 text-sm md:text-base">🕐 Последние 5</h3>
        <div className="overflow-x-auto -mx-3 md:mx-0">
          <table className="w-full text-xs md:text-sm" style={{ minWidth: '380px' }}>
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 px-2 md:px-3">Дата</th>
                <th className="pb-2 px-2 md:px-3">Имя</th>
                <th className="pb-2 px-2 md:px-3">Категория</th>
                <th className="pb-2 px-2 md:px-3">Бюджет</th>
                <th className="pb-2 px-2 md:px-3 hidden md:table-cell">Оценка</th>
                <th className="pb-2 px-2 md:px-3 hidden md:table-cell">Статус</th>
              </tr>
            </thead>
            <tbody>
              {leads.slice(0, 5).map((l) => (
                <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-2 md:px-3 whitespace-nowrap">{formatDate(l.created_at)}</td>
                  <td className="py-2 px-2 md:px-3 font-medium">{l.full_name}</td>
                  <td className="py-2 px-2 md:px-3 truncate max-w-[100px]">{l.category}</td>
                  <td className="py-2 px-2 md:px-3">{l.budget}</td>
                  <td className="py-2 px-2 md:px-3 hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getScoreBg(l.lead_score)}`}>
                      {l.lead_score}
                    </span>
                  </td>
                  <td className="py-2 px-2 md:px-3 hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BG[l.status] || ''} ${STATUS_TEXT[l.status] || ''}`}>
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
