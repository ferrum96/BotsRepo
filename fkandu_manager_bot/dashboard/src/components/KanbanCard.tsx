'use client';

import { Lead, Page } from '@/lib/types';
import { getScoreColor } from '@/lib/utils';

interface KanbanCardProps {
  lead: Lead;
  onTouchStart?: (id: number, x: number, y: number, el: HTMLElement) => void;
  setPage?: (page: Page) => void;
}

export function KanbanCard({ lead, onTouchStart, setPage }: KanbanCardProps) {
  const uname = lead.username && lead.username !== 'Нет username'
    ? lead.username.replace('@', '')
    : '';
  
  const info = lead.product_info || '';
  const cleaned = info
    .replace(/<a\s+href=['"][^'"]*['"][^>]*>.*?<\/a>\s*\S*/gi, '')
    .replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]/g, '')
    .trim();
  const prodText = cleaned.substring(0, 100) + (cleaned.length > 100 ? '...' : '');

  function handleTouchStart(e: React.TouchEvent) {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) return;
    const t = e.touches[0];
    if (onTouchStart) {
      onTouchStart(lead.id, t.clientX, t.clientY, e.currentTarget as HTMLElement);
    }
  }

  function openLead() {
    if (setPage) {
      setPage('leads');
    }
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(lead.id));
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
          e.currentTarget.classList.add('dragging');
        }, 0);
      }}
      onDragEnd={(e) => {
        e.currentTarget.classList.remove('dragging');
      }}
      onTouchStart={handleTouchStart}
      onClick={openLead}
      className="bg-white rounded-lg p-2.5 md:p-3 mb-2 shadow-sm cursor-pointer active:cursor-grabbing md:hover:shadow-md transition-all card-in min-w-0 overflow-hidden"
      style={{ borderLeft: '4px solid ' + getScoreColor(lead.lead_score) }}
    >
      <p className="font-bold text-[12px] md:text-sm text-gray-800">{lead.full_name}</p>
      <p className="text-gray-400 mt-0.5" style={{ fontSize: '10px' }}>{lead.category}</p>
      <p className="text-gray-700 mt-1.5 break-words line-clamp-2" style={{ fontSize: '14px', lineHeight: '1.5' }}>
        {prodText}
      </p>
      <p className="font-semibold mt-1.5" style={{ fontSize: '10px' }}>
        {lead.budget} · <span className="font-normal" style={{ fontSize: '9px' }}>{lead.lead_score}</span>
      </p>
      {uname ? (
        <a
          href={'https://t.me/' + uname}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline mt-1 inline-block"
          style={{ fontSize: '9px' }}
          onClick={(e) => e.stopPropagation()}
        >
          💬 {uname}
        </a>
      ) : null}
    </div>
  );
}
