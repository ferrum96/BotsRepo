type Block =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'funnel'; items: string[] }
  | { type: 'quote'; text: string };

interface TzSection {
  num: string;
  title: string;
  blocks: Block[];
}

const HIGHLIGHT = new Set(['12', '20']);

function splitSections(text: string): { title: string; intro: string; sections: TzSection[]; footer?: TzSection } {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  let title = 'Техническое задание';
  const intro: string[] = [];
  let i = 0;

  while (i < lines.length && !(lines[i] ?? '').match(/^\d+\.\s+\S/)) {
    const line = (lines[i] ?? '').trim();
    if (line && !title.includes('автоматизац') && /^ТЗ[:.]/i.test(line)) title = line.replace(/^ТЗ:\s*/i, '');
    else if (line && !/^ТЗ[:.]/i.test(line)) intro.push(line);
    i += 1;
  }

  const chunks: TzSection[] = [];
  while (i < lines.length) {
    const head = (lines[i] ?? '').match(/^(\d+)\.\s+(.+)$/);
    if (head) {
      i += 1;
      const body: string[] = [];
      while (i < lines.length && !(lines[i] ?? '').match(/^\d+\.\s+\S/) && !(lines[i] ?? '').startsWith('Короткая формулировка')) {
        body.push(lines[i] ?? '');
        i += 1;
      }
      chunks.push({ num: head[1] ?? '', title: head[2] ?? '', blocks: parseBody(body) });
      continue;
    }
    break;
  }

  let footer: TzSection | undefined;
  if (i < lines.length && (lines[i] ?? '').startsWith('Короткая формулировка')) {
    const heading = (lines[i] ?? '').trim();
    i += 1;
    footer = { num: '', title: heading, blocks: parseBody(lines.slice(i)) };
  }

  return { title, intro: intro.join(' '), sections: chunks, footer };
}

function parseBody(raw: string[]): Block[] {
  const lines = raw.map((line) => line.trim()).filter((line) => line && line !== '↓');
  const blocks: Block[] = [];
  let i = 0;

  const pushList = (items: string[]) => {
    if (items.length) blocks.push({ type: 'list', items });
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (line.startsWith('«') || line.startsWith('"')) {
      blocks.push({ type: 'quote', text: line.replace(/^«|»$/g, '').replace(/^"|"$/g, '') });
      i += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line) || isStageLine(line, lines[i + 1], lines[i - 1])) {
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? '';
        if (!/^\d+\.\s+/.test(current) && !isStageLine(current, lines[i + 1], items[items.length - 1])) break;
        items.push(current.replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      if (items.length > 1) {
        blocks.push({ type: 'funnel', items });
        continue;
      }
      if (items.length === 1) {
        blocks.push({ type: 'p', text: items[0] ?? '' });
        continue;
      }
    }

    if (line.endsWith(':') && !looksLikeListItem(line)) {
      blocks.push({ type: 'p', text: line });
      i += 1;
      const items: string[] = [];
      while (i < lines.length && looksLikeListItem(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/[;.,]$/, ''));
        i += 1;
      }
      pushList(items);
      continue;
    }

    if (looksLikeListItem(line)) {
      const items: string[] = [];
      while (i < lines.length && looksLikeListItem(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/[;.,]$/, ''));
        i += 1;
      }
      pushList(items);
      continue;
    }

    blocks.push({ type: 'p', text: line });
    i += 1;
  }

  return blocks;
}

function looksLikeListItem(line: string): boolean {
  if (!line) return false;
  if (line.endsWith(';')) return true;
  if (/^[+\-–]\d/.test(line) || /\+\d+$/.test(line)) return true;
  if (/^[A-C]\s[—–-]/.test(line)) return true;
  if (/^(да|нет|регулярно|иногда|высокий|средний|низкий)\b/i.test(line)) return true;
  if (/^да\s*\/\s*нет/i.test(line)) return true;
  if (line.length < 42 && !/[.!?]$/.test(line) && !line.includes(' — ') && !line.endsWith(':')) {
    return /^(парсинг|telegram|vk|youtube|seo|рекомендац|конференц|исходящ|другое)/i.test(line);
  }
  if (/^\d+[–-]\d+/.test(line) || /^\d+\+$/.test(line)) return true;
  return false;
}

function isStageLine(line: string, next?: string, prev?: string): boolean {
  if (!line) return false;
  const short = line.length < 48 && !line.endsWith('.') && !line.endsWith(';');
  const named =
    /партнёр|касание|прогрев|ответил|квалифиц|интерес|созвон|думает|подключ|рекомендац|клиент|продаж|материал/i.test(
      line,
    );
  return short && named && (!!prev || !!next);
}

function BlockView({ block }: { block: Block }) {
  if (block.type === 'p') return <p>{block.text}</p>;
  if (block.type === 'quote') return <blockquote>«{block.text}»</blockquote>;
  if (block.type === 'funnel') {
    return (
      <ol className="funnel">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }
  return (
    <ul>
      {block.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function TzBrief({ text }: { text: string }) {
  const doc = splitSections(text);

  return (
    <div className="stack">
      <article className="card">
        <h2>Исходник ТЗ</h2>
        <p className="lead">{doc.title}. Как написал заказчик — 20 пунктов, от загрузки базы до продажи.</p>
        {doc.intro ? <p>{doc.intro}</p> : null}
      </article>

      {doc.sections.map((section) => (
        <article
          className={`card risk-card tz-card${HIGHLIGHT.has(section.num) ? ' important' : ''}`}
          key={section.num}
        >
          <div className="risk-head">
            <span className="risk-num">{section.num}</span>
            <h3>{section.title}</h3>
          </div>
          {HIGHLIGHT.has(section.num) ? (
            <div className="risk-pills">
              <span className="pill warn">На это смотрим отдельно</span>
            </div>
          ) : null}
          {section.blocks.map((block, index) => (
            <BlockView key={`${section.num}-${index}`} block={block} />
          ))}
        </article>
      ))}

      {doc.footer ? (
        <article className="card tz-card">
          <h3>{doc.footer.title}</h3>
          {doc.footer.blocks.map((block, index) => (
            <BlockView key={`f-${index}`} block={block} />
          ))}
        </article>
      ) : null}
    </div>
  );
}
