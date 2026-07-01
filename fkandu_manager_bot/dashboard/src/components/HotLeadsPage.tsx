'use client';

import { Lead } from '@/lib/types';
import { renderFiles } from '@/lib/utils';

interface HotLeadsPageProps {
  leads: Lead[];
}

export function HotLeadsPage({ leads }: HotLeadsPageProps) {
  const hot = leads.filter(
    (l) =>
      (l.lead_score || '').includes('ГОРЯЧИЙ') &&
      !['📢 Размещено', '❌ Отказ', '💰 Оплачено'].includes(l.status)
  );

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-bold mb-2">🔥 Горячие лиды</h1>
      <p className="text-xs md:text-sm text-gray-500 mb-3 md:mb-4">Обрабатывайте в первую очередь</p>

      {hot.length === 0 ? (
        <div className="bg-green-50 text-green-700 p-3 md:p-4 rounded-xl text-center text-sm">
          🎉 Нет необработанных горячих лидов!
        </div>
      ) : (
        <div className="space-y-2 md:space-y-3">
          {hot.map((l) => {
            const uname = (l.username || '').replace('@', '');
            return (
              <div key={l.id} className="bg-white rounded-xl border-l-4 border-red-400 p-3 md:p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm md:text-base">
                      {l.full_name}{' '}
                      <span className="text-gray-400 font-normal text-xs md:text-sm">
                        @{uname || '—'}
                      </span>
                    </p>
                    <p className="text-xs md:text-sm text-gray-600 mt-1">
                      {l.category} · {l.budget}
                    </p>
                    <div className="text-xs md:text-sm text-gray-500 mt-1">
                      {renderFiles(l.product_info)}
                    </div>
                    <p className="text-[10px] md:text-xs text-gray-400 mt-1 md:mt-2">
                      📅 {l.timeline}
                    </p>
                  </div>
                  {uname ? (
                    <a
                      href={'https://t.me/' + uname}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-red-500 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-semibold whitespace-nowrap flex-shrink-0"
                    >
                      💬 Написать
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
