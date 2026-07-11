import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KanbanCard } from './KanbanCard';

const lead = {
  id: 7,
  user_id: 11,
  username: 'test_user',
  full_name: 'Test Lead',
  category: 'Категория',
  product_info: 'Описание продукта',
  budget: '50 000 ₽ и выше',
  timeline: '⚡ На этой неделе',
  lead_score: 'ГОРЯЧИЙ 🔥',
  status: '🆕 Новая',
  admin_comment: '',
  next_contact: null,
  deal_amount: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function getCardElement(): HTMLElement {
  return screen.getByText('Test Lead').closest('div[draggable="true"]') as HTMLElement;
}

describe('KanbanCard mobile/drag behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls onTouchStart on mobile screens', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    const onTouchStart = vi.fn();

    render(<KanbanCard lead={lead} onTouchStart={onTouchStart} />);
    const card = getCardElement();

    fireEvent.touchStart(card, {
      touches: [{ clientX: 120, clientY: 220 }],
    });

    expect(onTouchStart).toHaveBeenCalledTimes(1);
    const [id, x, y, el] = onTouchStart.mock.calls[0];
    expect(id).toBe(7);
    expect(x).toBe(120);
    expect(y).toBe(220);
    expect(el).toBe(card);
  });

  it('does not call onTouchStart on desktop screens', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    const onTouchStart = vi.fn();

    render(<KanbanCard lead={lead} onTouchStart={onTouchStart} />);
    const card = getCardElement();

    fireEvent.touchStart(card, {
      touches: [{ clientX: 120, clientY: 220 }],
    });

    expect(onTouchStart).not.toHaveBeenCalled();
  });

  it('adds dragging class on drag start without crashing', () => {
    vi.useFakeTimers();
    render(<KanbanCard lead={lead} />);
    const card = getCardElement();

    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: '',
    } as unknown as DataTransfer;

    fireEvent.dragStart(card, { dataTransfer });
    vi.runAllTimers();

    expect(card).toHaveClass('dragging');

    fireEvent.dragEnd(card);
    expect(card).not.toHaveClass('dragging');
    vi.useRealTimers();
  });
});
