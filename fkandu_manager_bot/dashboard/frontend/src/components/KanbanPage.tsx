'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Lead, STATUSES, Page } from '@/lib/types';
import { saveLead } from '@/lib/utils';
import { KanbanColumn } from './KanbanColumn';

interface KanbanPageProps {
  leads: Lead[];
  onRefresh: () => void;
  setPage?: (page: Page) => void;
  onOpenLead?: (id: number) => void;
}

export function KanbanPage({ leads, onRefresh, setPage, onOpenLead }: KanbanPageProps) {
  const leadsRef = useRef(leads);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragScrollRaf = useRef<number>(0);

  const [isMobile, setIsMobile] = useState(false);
  const [activeColIndex, setActiveColIndex] = useState(0);

  useEffect(() => {
    leadsRef.current = leads;
  });

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 768);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const el = scrollRef.current;
    if (!el) return;

    function onScroll() {
      const colWidth = el!.offsetWidth;
      if (colWidth > 0) {
        const centerOffset = (colWidth - el!.children[0]!.getBoundingClientRect().width) / 2;
        const idx = Math.round((el!.scrollLeft - centerOffset + colWidth / 2) / (colWidth + 16));
        setActiveColIndex(Math.max(0, Math.min(idx, STATUSES.length - 1)));
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isMobile]);

  function scrollToCol(index: number) {
    const el = scrollRef.current;
    if (!el) return;
    const col = el.children[index] as HTMLElement;
    if (!col) return;
    const elRect = el.getBoundingClientRect();
    const colRect = col.getBoundingClientRect();
    const offset = col.offsetLeft - (elRect.width - colRect.width) / 2;
    el.scrollTo({ left: offset, behavior: 'smooth' });
  }

  const [touchDrag, setTouchDrag] = useState<{
    id: number;
    offsetX: number;
    offsetY: number;
    x: number;
    y: number;
    overCol: string | null;
  } | null>(null);
  const touchStartRef = useRef<{ id: number; offsetX: number; offsetY: number; startX: number; startY: number } | null>(null);

  const handleDrop = useCallback(
    (id: number, newStatus: string) => {
      const lead = leadsRef.current.find((l) => l.id === id);
      if (!lead || lead.status === newStatus) return;
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

    function autoScroll(clientX: number) {
      const el = scrollRef.current;
      if (!el) return;
      const EDGE = 60;
      const SPEED = 8;
      const rect = el.getBoundingClientRect();
      cancelAnimationFrame(dragScrollRaf.current);
      function tick() {
        const el2 = scrollRef.current;
        if (!el2) return;
        let dx = 0;
        if (clientX < rect.left + EDGE) dx = -SPEED;
        else if (clientX > rect.right - EDGE) dx = SPEED;
        if (dx) {
          el2.scrollLeft += dx;
          dragScrollRaf.current = requestAnimationFrame(tick);
        }
      }
      if (clientX < rect.left + EDGE || clientX > rect.right - EDGE) {
        dragScrollRaf.current = requestAnimationFrame(tick);
      }
    }

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
      autoScroll(t.clientX);

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
          const lead = leadsRef.current.find((l) => l.id === id);
          if (lead && lead.status !== prev.overCol) {
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
      cancelAnimationFrame(dragScrollRaf.current);
    };
  }, [touchDrag, onRefresh]);

  const groups: Record<string, Lead[]> = {};
  STATUSES.forEach((s) => {
    groups[s] = [];
  });
  leads.forEach((l) => {
    if (groups[l.status]) groups[l.status].push(l);
  });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {touchDrag ? (
        <div
          className="touch-ghost"
          style={{
            left: touchDrag.x - touchDrag.offsetX + 'px',
            top: touchDrag.y - touchDrag.offsetY + 'px',
            width: '140px',
          }}
        >
          <div className="bg-white rounded-lg p-2 sm:p-2.5 shadow-lg" style={{ borderLeft: '4px solid #ff4b4b' }}>
            <p className="font-bold text-[10px] sm:text-xs text-gray-800">
              {(leads.find((l) => l.id === touchDrag.id) || {}).full_name || ''}
            </p>
          </div>
        </div>
      ) : null}

      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 md:mb-8 text-center md:text-left md:pl-0">🗂 Статусы заявок</h1>

      {isMobile && (
        <div className="kanban-dots mb-3">
          {STATUSES.map((s, i) => (
            <div
              key={s}
              className={`kanban-dot ${i === activeColIndex ? 'active' : ''}`}
              style={i === activeColIndex ? { background: '#3B82F6' } : undefined}
              onClick={() => scrollToCol(i)}
            />
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className={`flex gap-3 md:gap-4 overflow-x-auto pb-4 kanban-touch flex-1 min-h-0 ${isMobile ? 'kanban-slider' : ''}`}
        style={isMobile ? { WebkitOverflowScrolling: 'touch' } : undefined}
        onDragOver={(e) => {
          const el = scrollRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const EDGE = 60;
          const SPEED = 8;
          if (e.clientX < rect.left + EDGE) {
            el.scrollLeft -= SPEED;
          } else if (e.clientX > rect.right - EDGE) {
            el.scrollLeft += SPEED;
          }
        }}
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
            onOpenLead={onOpenLead}
          />
        ))}
      </div>
    </div>
  );
}
