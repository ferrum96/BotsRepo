'use client';

import { useState, useEffect } from 'react';
import { Lead, STATUSES, STATUS_BG, STATUS_TEXT } from '@/lib/types';
import { saveLead, renderFiles } from '@/lib/utils';

interface LeadsPageProps {
  leads: Lead[];
  onRefresh: () => void;
  openLeadId?: number | null;
  onLeadOpened?: () => void;
}

export function LeadsPage({ leads, onRefresh, openLeadId, onLeadOpened }: LeadsPageProps) {
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
    if (openLeadId && leads.length) {
      const lead = leads.find((l) => l.id === openLeadId);
      if (lead) {
        startEdit(lead);
        onLeadOpened?.();
      }
    }
  }, [openLeadId, leads]);

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
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 md:mb-8 text-center md:text-left md:pl-0">📋 Все заявки</h1>

      {/* Filters */}
      <div className="flex flex-col gap-2 mb-4 md:mb-8">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => toggleFilter(filterStatus, setFilterStatus, s)}
              className={`filter-btn ${
                filterStatus.includes(s) ? 'bg-rose-400 text-white border-rose-400' : 'bg-white border-gray-200 text-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => toggleFilter(filterCategory, setFilterCategory, c)}
              className={`filter-btn ${
                filterCategory.includes(c) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-gray-200 text-gray-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-1 md:mb-2 md:ml-2">
        Найдено: <b className="text-gray-900">{filtered.length}</b>
      </p>

      {/* Lead cards */}
      <div className="space-y-2">
        {filtered.map((l) => {
          const isE = editing === l.id;
          return (
            <div key={l.id} id={'lead-' + l.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => startEdit(isE ? null : l)}
                className="w-full text-left p-3 md:p-4 flex items-center gap-3 md:gap-4 hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[56px]"
              >
                <span className="text-xl md:text-2xl flex-shrink-0">
                  {(l.lead_score || '').includes('ГОРЯЧИЙ')
                    ? '🔥'
                    : (l.lead_score || '').includes('Теплый')
                    ? '💛'
                    : '🧊'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm md:text-base text-gray-900 leading-snug">
                    {l.full_name}{' '}
                    <span className="text-gray-400 font-normal text-xs md:text-sm">@{l.username || '—'}</span>
                  </p>
                  <p className="text-xs md:text-sm text-gray-500 truncate mt-1">
                    {l.category} · {l.budget} · {l.timeline}
                  </p>
                </div>
                <span
                  className={`text-[10px] md:text-xs px-2 py-1 rounded-full flex-shrink-0 max-w-[70px] md:max-w-[80px] truncate ${STATUS_BG[l.status] || ''} ${STATUS_TEXT[l.status] || ''}`}
                >
                  {l.status}
                </span>
                <span className="text-gray-400 text-xs md:text-sm flex-shrink-0">{isE ? '▲' : '▼'}</span>
              </button>

              {isE ? (
                <div className="p-5 md:p-6 bg-gray-50 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">📝 О товаре</p>
                    <div className="text-sm text-gray-700">{renderFiles(l.product_info)}</div>
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Статус</label>
                        <select
                          value={form.status}
                          onChange={(e) => setForm({ ...form, status: e.target.value })}
                          className="w-full p-3 border border-gray-200 rounded-lg text-sm bg-white min-h-[44px]"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Комментарий</label>
                        <textarea
                          value={form.admin_comment}
                          onChange={(e) => setForm({ ...form, admin_comment: e.target.value })}
                          className="w-full p-3 border border-gray-200 rounded-lg text-sm bg-white"
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Когда написать</label>
                      <input
                        type="date"
                        value={form.next_contact || ''}
                        onChange={(e) => setForm({ ...form, next_contact: e.target.value })}
                        className="w-full p-3 border border-gray-200 rounded-lg text-sm bg-white min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Сумма (₽)</label>
                      <input
                        type="number"
                        value={form.deal_amount}
                        onChange={(e) => setForm({ ...form, deal_amount: parseFloat(e.target.value) || 0 })}
                        className="w-full p-3 border border-gray-200 rounded-lg text-sm bg-white min-h-[44px]"
                      />
                    </div>
                    <div className="flex gap-3 mt-4">
                      {l.username && l.username !== 'Нет username' ? (
                        <a
                          href={'https://t.me/' + l.username.replace('@', '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary bg-blue-500 text-white hover:bg-blue-600"
                        >
                          💬 ЛС
                        </a>
                      ) : null}
                      <button
                        onClick={() => saveEdit(l.id)}
                        className="btn-primary bg-green-500 text-white hover:bg-green-600"
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
