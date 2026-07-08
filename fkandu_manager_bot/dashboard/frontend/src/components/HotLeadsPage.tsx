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
      <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold text-gray-900 text-center md:text-left md:pl-0">🔥 Горячие лиды</h1>
      <p className="text-sm text-gray-500 mb-4 md:mb-8 pl-12 text-center md:text-left md:pl-12">Обрабатывайте в первую очередь</p>

      {hot.length === 0 ? (
        <div className="bg-green-50 text-green-700 p-6 md:p-8 rounded-xl text-center text-sm md:text-base">
          🎉 Нет необработанных горячих лидов!
        </div>
      ) : (
        <div className="space-y-4">
          {hot.map((l) => {
            const uname = (l.username || '').replace('@', '');
            return (
              <div key={l.id} className="bg-white rounded-xl border-l-4 border-red-400 p-5 md:p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm md:text-base text-gray-900 leading-snug">
                      {l.full_name}{' '}
                      <span className="text-gray-400 font-normal text-xs md:text-sm">
                        @{uname || '—'}
                      </span>
                    </p>
                    <p className="text-xs md:text-sm text-gray-600 mt-1">
                      {l.category} · {l.budget}
                    </p>
                    <div className="text-xs md:text-sm text-gray-500 mt-2 line-clamp-2">
                      {renderFiles(l.product_info)}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      📅 {l.timeline}
                    </p>
                  </div>
                  {uname ? (
                    <a
                      href={'https://t.me/' + uname}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary bg-red-500 text-white hover:bg-red-600 whitespace-nowrap flex-shrink-0"
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
