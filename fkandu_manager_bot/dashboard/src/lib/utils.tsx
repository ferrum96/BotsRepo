import { Lead } from './types';

export function getScoreColor(score: string): string {
  if (!score) return '#4a90e2';
  if (score.includes('ГОРЯЧИЙ')) return '#ff4b4b';
  if (score.includes('Теплый')) return '#ffc107';
  return '#4a90e2';
}

export function getScoreBg(score: string): string {
  if (!score) return 'bg-blue-100';
  if (score.includes('ГОРЯЧИЙ')) return 'bg-red-100';
  if (score.includes('Теплый')) return 'bg-yellow-100';
  return 'bg-blue-100';
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('ru-RU').format(amount || 0) + ' ₽';
}

export function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function fileIcon(name: string): string {
  if (!name) return '📄';
  const n = name.toLowerCase();
  if (n.match(/\.(jpg|jpeg|png|gif|webp)$/)) return '🖼';
  if (n.match(/\.pdf$/)) return '📕';
  if (n.match(/\.(doc|docx)$/)) return '📘';
  if (n.match(/\.(xls|xlsx|csv)$/)) return '📊';
  if (n.match(/\.(zip|rar|7z)$/)) return '📦';
  if (n.match(/\.(mp4|avi|mov)$/)) return '🎬';
  if (n.match(/\.(mp3|wav)$/)) return '🎵';
  return '📎';
}

export function renderTextWithLinks(text: string, key: string): React.ReactNode[] {
  const urlRe = /https?:\/\/[^\s<>"')\]]+/g;
  const result: React.ReactNode[] = [];
  let last = 0;
  let m;

  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) {
      result.push(<span key={key + '_t' + last}>{text.substring(last, m.index)}</span>);
    }
    const url = m[0];
    result.push(
      <a
        key={key + '_a' + m.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline break-all"
      >
        {url}
      </a>
    );
    last = urlRe.lastIndex;
  }

  if (last < text.length) {
    result.push(<span key={key + '_t' + last}>{text.substring(last)}</span>);
  }

  return result;
}

export function renderFiles(text: string | null, compact: boolean = false): React.ReactNode {
  if (!text) return null;

  const parts = text.split(/(<a\s+href=['"][^'"]*['"][^>]*>[\s\S]*?<\/a>)/gi);
  const textParts: React.ReactNode[] = [];
  const fileParts: React.ReactNode[] = [];

  parts.forEach((part, i) => {
    const m = part.match(/<a\s+href=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/a>/i);
    if (m) {
      const url = m[1];
      const content = m[2].trim();
      fileParts.push(
        <a
          key={'f' + i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
        >
          {content}
        </a>
      );
    } else if (part.trim()) {
      const cleaned = part.trim().replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]/g, '').trim();
      if (cleaned) {
        textParts.push(renderTextWithLinks(cleaned, 't' + i));
      }
    }
  });

  const result: React.ReactNode[] = [];

  if (textParts.length > 0) {
    result.push(
      <div key="txt" className={compact ? 'text-gray-600 line-clamp-2 break-words' : 'text-gray-600 whitespace-pre-wrap'}>
        {textParts}
      </div>
    );
  }

  if (fileParts.length > 0) {
    result.push(
      <div key="files" className="flex flex-wrap gap-1 mt-1">
        {fileParts}
      </div>
    );
  }

  return result.length > 0 ? <>{result}</> : null;
}

export async function api(path: string, options?: RequestInit): Promise<any> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return response.json();
}

export async function saveLead(id: number, data: Partial<Lead>): Promise<any> {
  return api('/api/leads/' + id, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
