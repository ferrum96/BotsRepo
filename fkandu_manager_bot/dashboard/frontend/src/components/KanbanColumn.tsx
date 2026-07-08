'use client';

import { useState } from 'react';
import { Lead, Page } from '@/lib/types';
import { STATUS_COLORS } from '@/lib/types';
import { KanbanCard } from './KanbanCard';

interface KanbanColumnProps {
  status: string;
  leads: Lead[];
  onDrop: (id: number, status: string) => void;
  touchOver: boolean;
  onTouchStart?: (id: number, x: number, y: number, el: HTMLElement) => void;
  setPage?: (page: Page) => void;
  onOpenLead?: (id: number) => void;
}

export function KanbanColumn({ status, leads, onDrop, touchOver, onTouchStart, setPage, onOpenLead }: KanbanColumnProps) {
  const [isOver, setIsOver] = useState(false);
  const active = isOver || touchOver;

  return (
    <div
      className="flex-shrink-0 rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden flex flex-col kanban-col"
      style={{
        width: 'clamp(180px, 26vw, 250px)',
        minWidth: 'clamp(180px, 26vw, 250px)',
      }}
      data-status={status}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const id = parseInt(e.dataTransfer.getData('text/plain'));
        if (id) onDrop(id, status);
      }}
    >
      <div
        className="text-center font-semibold text-xs md:text-sm py-2 rounded-t-lg mb-3"
        style={{
          background: STATUS_COLORS[status] || '#F3F4F6',
          color: '#1F2937',
        }}
      >
        {status} ({leads.length})
      </div>
      <div className={`flex-1 min-h-[48px] md:min-h-[64px] rounded-lg transition-all min-w-0 overflow-y-auto p-1 ${active ? 'drag-over' : ''}`}>
        {leads.length === 0 ? (
          <p className="text-center text-gray-400 italic py-4 md:py-6 text-xs">
            Пусто
          </p>
        ) : null}
        {leads.map((l) => (
          <KanbanCard key={l.id} lead={l} onTouchStart={onTouchStart} setPage={setPage} onOpenLead={onOpenLead} />
        ))}
      </div>
    </div>
  );
}
