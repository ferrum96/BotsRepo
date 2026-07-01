'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Lead, STATUSES, Page } from '@/lib/types';
import { saveLead } from '@/lib/utils';
import { KanbanColumn } from './KanbanColumn';

interface KanbanPageProps {
  leads: Lead[];
  onRefresh: () => void;
  setPage?: (page: Page) => void;
}

export function KanbanPage({ leads, onRefresh, setPage }: KanbanPageProps) {
  const ref = useRef(leads);
  const [localLeads, setLocalLeads] = useState(leads);
  const [touchDrag, setTouchDrag] = useState<{
    id: number;
    offsetX: number;
    offsetY: number;
    x: number;
    y: number;
    overCol: string | null;
  } | null>(null);
  const touchStartRef = useRef<{ id: number; offsetX: number; offsetY: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    setLocalLeads(leads);
    ref.current = leads;
  }, [leads]);

  const handleDrop = useCallback(
    (id: number, newStatus: string) => {
      const lead = ref.current.find((l) => l.id === id);
      if (!lead || lead.status === newStatus) return;

      setLocalLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l))
      );
      saveLead(id, { status: newStatus }).then(() => onRefresh());
    },
    [onRefresh]
  );

  function onTouchStart(id: number, x: number, y: number, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    touchStartRef.current = {
      id,
      offsetX: x - r.left,
      offsetY: y - r.top,
      startX: x,
      startY: y,
    };
  }

  useEffect(() => {
    if (!touchDrag) return;

    function onMove(e: TouchEvent) {
      e.preventDefault();
      const t = e.touches[0];

      if (!touchDrag && touchStartRef.current) {
        const dx = Math.abs(t.clientX - touchStartRef.current.startX);
        const dy = Math.abs(t.clientY - touchStartRef.current.startY);
        if (dx < 10 && dy < 10) return;

        const s = touchStartRef.current;
        setTouchDrag({
          id: s.id,
          offsetX: s.offsetX,
          offsetY: s.offsetY,
          x: s.startX,
          y: s.startY,
          overCol: null,
        });
        touchStartRef.current = null;
        return;
      }

      setTouchDrag((prev) => (prev ? { ...prev, x: t.clientX, y: t.clientY } : prev));

      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (!el) return;
      const col = el.closest('[data-status]');
      setTouchDrag((prev) =>
        prev
          ? {
              ...prev,
              overCol: col ? col.getAttribute('data-status') : null,
            }
          : prev
      );
    }

    function onEnd() {
      setTouchDrag((prev) => {
        if (prev && prev.overCol) {
          const id = prev.id;
          const lead = ref.current.find((l) => l.id === id);
          if (lead && lead.status !== prev.overCol) {
            setLocalLeads((pp) =>
              pp.map((l) => (l.id === id ? { ...l, status: prev.overCol! } : l))
            );
            saveLead(id, { status: prev.overCol }).then(() => onRefresh());
          }
        }
        return null;
      });
      touchStartRef.current = null;
    }

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);

    return () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [touchDrag, onRefresh]);

  const groups: Record<string, Lead[]> = {};
  STATUSES.forEach((s) => {
    groups[s] = [];
  });
  localLeads.forEach((l) => {
    if (groups[l.status]) groups[l.status].push(l);
  });

  return (
    <div>
      {touchDrag ? (
        <div
          className="touch-ghost"
          style={{
            left: touchDrag.x - touchDrag.offsetX + 'px',
            top: touchDrag.y - touchDrag.offsetY + 'px',
            width: '150px',
          }}
        >
          <div className="bg-white rounded-lg p-2.5 shadow-lg" style={{ borderLeft: '4px solid #ff4b4b' }}>
            <p className="font-bold text-xs text-gray-800">
              {(localLeads.find((l) => l.id === touchDrag.id) || {}).full_name || ''}
            </p>
          </div>
        </div>
      ) : null}

      <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">🗂 Статусы заявок</h1>

      <div
        className="flex gap-2 md:gap-2 md:overflow-x-auto pb-4 kanban-touch"
        style={{ minHeight: '400px', WebkitOverflowScrolling: 'touch' }}
      >
        {STATUSES.map((s) => (
          <KanbanColumn
            key={s}
            status={s}
            leads={groups[s] || []}
            onDrop={handleDrop}
            touchOver={touchDrag?.overCol === s}
            onTouchStart={onTouchStart}
            setPage={setPage}
          />
        ))}
      </div>
    </div>
  );
}
