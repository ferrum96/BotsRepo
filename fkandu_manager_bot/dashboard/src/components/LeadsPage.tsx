'use client';

import { useState, useEffect } from 'react';
import { Lead, STATUSES, STATUS_BG, STATUS_TEXT } from '@/lib/types';
import { saveLead, renderFiles } from '@/lib/utils';

interface LeadsPageProps {
  leads: Lead[];
  onRefresh: () => void;
}

export function LeadsPage({ leads, onRefresh }: LeadsPageProps) {
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<{
    status: string;
    admin_comment: string;
    next_contact: string;
    deal_amount: number;
  }>({
    status: '',
    admin_comment: '',
    next_contact: '',
    deal_amount: 0,
  });

  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        const el = document.getElementById('lead-' + editing);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [editing]);

  const categories = Array.from(new Set(leads.map((l) => l.category)));

  let filtered = leads;
  if (filterStatus.length) {
    filtered = filtered.filter((l) => filterStatus.includes(l.status));
  }
  if (filterCategory.length) {
    filtered = filtered.filter((l) => filterCategory.includes(l.category));
  }

  function toggleFilter(arr: string[], setArr: (val: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  }

  function startEdit(l: Lead | null) {
    if (!l) {
      setEditing(null);
      return;
    }
    setEditing(l.id);
    setForm({
      status: l.status,
      admin_comment: l.admin_comment || '',
      next_contact: l.next_contact || '',
      deal_amount: l.deal_amount || 0,
    });
  }

  function saveEdit(id: number) {
    saveLead(id, form).then(() => {
      setEditing(null);
      onRefresh();
    });
  }

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">📋 Все заявки</h1>

      <div className="flex flex-col gap-1.5 md:gap-2 mb-3 md:mb-4">
        <div className="flex flex-wrap gap-1 md:gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => toggleFilter(filterStatus, setFilterStatus, s)}
              className={`text-[9px] md:text-xs px-1.5 md:px-2 py-0.5 rounded-full border transition-all whitespace-nowrap ${
                filterStatus.includes(s) ? 'bg-rose-400 text-white border-rose-400' : 'bg-white border-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 md:gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => toggleFilter(filterCategory, setFilterCategory, c)}
              className={`text-[9px] md:text-xs px-1.5 md:px-2 py-0.5 rounded-full border transition-all whitespace-nowrap ${
                filterCategory.includes(c) ? 'bg-blue-400 text-white border-blue-400' : 'bg-white border-gray-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs md:text-sm text-gray-500 mb-2 md:mb-3">
        Найдено: <b>{filtered.length}</b>
      </p>

      <div className="space-y-2">
        {filtered.map((l) => {
          const isE = editing === l.id;
          return (
            <div key={l.id} id={'lead-' + l.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => startEdit(isE ? null : l)}
                className="w-full text-left p-2.5 md:p-3 flex items-center gap-2 md:gap-3 hover:bg-gray-50 transition-colors"
              >
                <span className="text-base md:text-lg">
                  {(l.lead_score || '').includes('ГОРЯЧИЙ')
                    ? '🔥'
                    : (l.lead_score || '').includes('Теплый')
                    ? '💛'
                    : '🧊'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-xs md:text-sm">
                    {l.full_name}{' '}
                    <span className="text-gray-400 font-normal">@{l.username || '—'}</span>
                  </p>
                  <p className="text-[10px] md:text-xs text-gray-500 truncate">
                    {l.category} · {l.budget} · {l.timeline}
                  </p>
                </div>
                <span
                  className={`text-[9px] md:text-xs px-1 md:px-1.5 py-0.5 rounded-full flex-shrink-0 max-w-[70px] truncate ${STATUS_BG[l.status] || ''} ${STATUS_TEXT[l.status] || ''}`}
                >
                  {l.status}
                </span>
                <span className="text-gray-400 text-[10px] md:text-xs flex-shrink-0">{isE ? '▲' : '▼'}</span>
              </button>

              {isE ? (
                <div className="p-3 md:p-4 bg-gray-50 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <p className="text-[10px] md:text-xs text-gray-500 mb-1">📝 О товаре</p>
                    <div className="text-xs md:text-sm">{renderFiles(l.product_info)}</div>
                    <div className="mt-2 md:mt-3 space-y-2">
                      <div>
                        <label className="text-[10px] md:text-xs text-gray-500">Статус</label>
                        <select
                          value={form.status}
                          onChange={(e) => setForm({ ...form, status: e.target.value })}
                          className="w-full mt-1 p-1.5 md:p-2 border rounded-lg text-xs md:text-sm"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] md:text-xs text-gray-500">Комментарий</label>
                        <textarea
                          value={form.admin_comment}
                          onChange={(e) => setForm({ ...form, admin_comment: e.target.value })}
                          className="w-full mt-1 p-1.5 md:p-2 border rounded-lg text-xs md:text-sm"
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] md:text-xs text-gray-500">Когда написать</label>
                      <input
                        type="date"
                        value={form.next_contact || ''}
                        onChange={(e) => setForm({ ...form, next_contact: e.target.value })}
                        className="w-full mt-1 p-1.5 md:p-2 border rounded-lg text-xs md:text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] md:text-xs text-gray-500">Сумма (₽)</label>
                      <input
                        type="number"
                        value={form.deal_amount}
                        onChange={(e) => setForm({ ...form, deal_amount: parseFloat(e.target.value) || 0 })}
                        className="w-full mt-1 p-1.5 md:p-2 border rounded-lg text-xs md:text-sm"
                      />
                    </div>
                    <div className="flex gap-2 mt-2 md:mt-3">
                      {l.username && l.username !== 'Нет username' ? (
                        <a
                          href={'https://t.me/' + l.username.replace('@', '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] md:text-xs bg-blue-500 text-white px-2 md:px-3 py-1 md:py-1.5 rounded-lg"
                        >
                          💬 ЛС
                        </a>
                      ) : null}
                      <button
                        onClick={() => saveEdit(l.id)}
                        className="text-[10px] md:text-xs bg-green-500 text-white px-3 md:px-4 py-1 md:py-1.5 rounded-lg font-semibold"
                      >
                        💾 OK
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
