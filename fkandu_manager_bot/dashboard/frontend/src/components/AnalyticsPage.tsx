'use client';

import { Stats } from '@/lib/types';
import { formatMoney } from '@/lib/utils';

interface AnalyticsPageProps {
  stats: Stats;
}

export function AnalyticsPage({ stats }: AnalyticsPageProps) {
  const maxRevenue = Math.max(
    ...(stats.monthly_revenue || []).map((m) => m.revenue || 0),
    1
  );
  const maxCategoryRevenue = Math.max(
    ...(stats.category_revenue || []).map((c) => c.revenue || 0),
    1
  );

  return (
    <div>
      <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold text-gray-900 mb-4 md:mb-8 text-center md:text-left md:pl-0">📈 Аналитика</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-4 mb-8 md:mb-4">
        <div className="bg-white rounded-xl p-5 md:p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold mb-6 md:mb-8 text-base md:text-lg text-gray-900">💰 Выручка по месяцам</h3>
          {(stats.monthly_revenue || []).length ? (
            <div className="space-y-4">
              {stats.monthly_revenue.map((m) => (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-xs md:text-sm w-14 md:w-16 text-right text-gray-500">
                    {m.month}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 md:h-8 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-400 to-[var(--color-peach-400)] flex items-center px-3"
                      style={{ width: Math.max(8, (m.revenue / maxRevenue) * 100) + '%' }}
                    >
                      <span className="text-white text-xs md:text-sm font-bold">
                        {formatMoney(m.revenue)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center mt-12 md:mt-20 text-sm">Нет данных</p>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 md:p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold mb-6 md:mb-8 text-base md:text-lg text-gray-900">📊 Воронка</h3>
          <div className="space-y-4">
            {(stats.by_status || []).map((s) => {
              const max = Math.max(...stats.by_status.map((x) => x.count));
              return (
                <div key={s.status} className="flex items-center gap-3">
                  <span className="text-xs md:text-sm w-20 md:w-28 text-right text-gray-600 truncate">
                    {s.status}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 md:h-8 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-purple-400 flex items-center px-3"
                      style={{ width: Math.max(8, (s.count / max) * 100) + '%' }}
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

      <div className="bg-white rounded-xl p-5 md:p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold mb-6 md:mb-8 text-base md:text-lg text-gray-900">📦 Топ по выручке</h3>
        {(stats.category_revenue || []).length ? (
          <div className="space-y-4">
            {stats.category_revenue.map((c) => (
              <div key={c.category} className="flex items-center gap-3">
                <span className="text-xs md:text-sm w-28 md:w-40 text-right text-gray-600 truncate">
                  {c.category}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 md:h-8 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-400 flex items-center px-3"
                    style={{ width: Math.max(8, (c.revenue / maxCategoryRevenue) * 100) + '%' }}
                  >
                    <span className="text-white text-xs md:text-sm font-bold">
                      {formatMoney(c.revenue)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center mt-8 md:mt-12 text-sm">Нет данных</p>
        )}
      </div>
    </div>
  );
}
