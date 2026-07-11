'use client';

import { Lead, Page } from '@/lib/types';
import { getScoreColor } from '@/lib/utils';

interface KanbanCardProps {
  lead: Lead;
  onTouchStart?: (id: number, x: number, y: number, el: HTMLElement) => void;
  setPage?: (page: Page) => void;
  onOpenLead?: (id: number) => void;
}

export function KanbanCard({ lead, onTouchStart, setPage, onOpenLead }: KanbanCardProps) {
  const uname = lead.username && lead.username !== 'Нет username'
    ? lead.username.replace('@', '')
    : '';

  const info = lead.product_info || '';
  const cleaned = info
    .replace(/<a\s+href=['"][^'"]*['"][^>]*>.*?<\/a>\s*\S*/gi, '')
    .replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]/g, '')
    .trim();
  const prodText = cleaned.substring(0, 80) + (cleaned.length > 80 ? '...' : '');

  function handleTouchStart(e: React.TouchEvent) {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) return;
    const t = e.touches[0];
    if (onTouchStart) {
      onTouchStart(lead.id, t.clientX, t.clientY, e.currentTarget as HTMLElement);
    }
  }

  function openLead() {
    if (onOpenLead) {
      onOpenLead(lead.id);
    } else if (setPage) {
      setPage('leads');
    }
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        const target = e.currentTarget;
        e.dataTransfer.setData('text/plain', String(lead.id));
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
          target?.classList.add('dragging');
        }, 0);
      }}
      onDragEnd={(e) => {
        e.currentTarget.classList.remove('dragging');
      }}
      onTouchStart={handleTouchStart}
      onClick={openLead}
      className="bg-white rounded-lg p-4 md:p-5 mb-2 md:mb-3 shadow-sm cursor-pointer active:cursor-grabbing md:hover:shadow-md transition-all card-in min-w-0 overflow-hidden"
      style={{ borderLeft: '4px solid ' + getScoreColor(lead.lead_score) }}
    >
      <p className="font-semibold text-sm text-gray-900 leading-snug">{lead.full_name}</p>
      <p className="text-xs text-gray-500 mt-1 leading-snug">{lead.category}</p>
      <p className="text-sm text-gray-700 mt-2 break-words line-clamp-2 leading-relaxed">
        {prodText}
      </p>
      <p className="text-xs font-medium text-gray-900 mt-2">
        {lead.budget} · <span className="font-normal text-gray-500">{lead.lead_score}</span>
      </p>
      {uname ? (
        <a
          href={'https://t.me/' + uname}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline mt-2 inline-block text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          💬 {uname}
        </a>
      ) : null}
    </div>
  );
}
