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
}

export function KanbanColumn({ status, leads, onDrop, touchOver, onTouchStart, setPage }: KanbanColumnProps) {
  const [isOver, setIsOver] = useState(false);
  const active = isOver || touchOver;

  return (
    <div
      className="flex-shrink-0 rounded-xl p-1 md:p-1.5 bg-white shadow-sm border border-gray-100 overflow-hidden"
      style={{
        width: '185px',
        minWidth: '185px',
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
        className="text-center font-bold text-[10px] md:text-xs py-1.5 md:py-2 rounded-lg mb-1 md:mb-1.5"
        style={{
          background: STATUS_COLORS[status] || '#f5f5f5',
          color: '#333',
        }}
      >
        {status} ({leads.length})
      </div>
      <div className={`min-h-[40px] md:min-h-[60px] rounded-lg transition-all min-w-0 ${active ? 'drag-over' : ''}`}>
        {leads.length === 0 ? (
          <p className="text-center text-gray-300 italic py-4 md:py-6" style={{ fontSize: '9px' }}>
            Пусто
          </p>
        ) : null}
        {leads.map((l) => (
          <KanbanCard key={l.id} lead={l} onTouchStart={onTouchStart} setPage={setPage} />
        ))}
      </div>
    </div>
  );
}
