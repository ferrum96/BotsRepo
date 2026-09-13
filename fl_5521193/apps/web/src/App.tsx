import { useEffect, useMemo, useState } from 'react';
import { api, type DemoSources, type DemoState, type ReplyVariant } from './api';
import { AUTOMATION, ELIGIBILITY, ROW_STATUS, STAGE } from './labels';
import { CriticalBrief } from './CriticalBrief';
import { TzBrief } from './TzBrief';

type Tab = 'stand' | 'tz' | 'critical' | 'import' | 'deals';

function parseCsv(text: string): string[][] {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => line.split(','));
}

const nameOf = (row: DemoState['pipeline'][number]) =>
  [row.firstName, row.lastName].filter(Boolean).join(' ') || 'без имени';

export function App() {
  const [tab, setTab] = useState<Tab>('stand');
  const [state, setState] = useState<DemoState | null>(null);
  const [sources, setSources] = useState<DemoSources | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = async () => {
    const next = await api.state();
    setState(next);
    return next;
  };

  useEffect(() => {
    void refresh().catch((err: Error) => setError(err.message));
    void api.sources().then(setSources).catch((err: Error) => setError(err.message));
    const id = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  const csvRows = useMemo(() => (sources ? parseCsv(sources.csv.text) : []), [sources]);
  const csvHead = csvRows[0] ?? [];
  const csvBody = csvRows.slice(1);

  const demoDeal = useMemo(() => {
    if (!state) return null;
    return (
      state.pipeline.find((row) => row.automationStatus === 'STOPPED_BY_REPLY') ??
      state.pipeline.find((row) => row.lastMessageAt && row.eligibility === 'AUTO_OK') ??
      state.pipeline.find((row) => row.eligibility === 'AUTO_OK') ??
      null
    );
  }, [state]);

  const selectedDeal = state?.pipeline.find((row) => row.dealId === selected) ?? demoDeal;

  const waitBatch = async () => {
    for (let i = 0; i < 40; i += 1) {
      const next = await refresh();
      if (next.batch?.status === 'DONE') break;
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.runSample();
      await waitBatch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прогнать демо');
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await api.upload(file);
      await waitBatch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить файл');
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка действия');
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return <div className="shell">{error ?? 'Подключаюсь к API…'}</div>;
  }

  return (
    <div className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">AstroStone · демо стенд</p>
          <h1>Воронка партнёров без живой рассылки</h1>
          <p className="lead">
            Импорт спарсенной базы, дедуп, первое касание и стоп по любому ответу. Сообщения идут в
            stub. amoCRM: {state.amocrm}
            {state.amocrm === 'live'
              ? ` · live: поиск дубля в amoCRM, затем create/update. Ушло ${state.stats.amocrmContacts} контактов / ${state.stats.amocrmDeals} сделок.`
              : ' в stub — заказчик видит правила, не спам.'}
          </p>
        </div>
        <div className="banner">
          Канал: {state.messaging}. amoCRM: {state.amocrm}. Telegram-бот первым не пишет — в проде
          Telethon / MTProto с живого аккаунта, не шлюз.
        </div>
      </header>

      <nav className="tabs">
        {(
          [
            ['stand', 'Стенд'],
            ['tz', 'ТЗ'],
            ['critical', 'Критика'],
            ['import', 'Файл базы'],
            ['deals', 'Сделки'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <section className="kpis">
        <div className="kpi">
          <b>{state.stats.contacts}</b>
          <span>контактов</span>
        </div>
        <div className="kpi">
          <b>{state.stats.deals}</b>
          <span>сделок</span>
        </div>
        <div className="kpi">
          <b>{state.stats.messagesSent}</b>
          <span>сообщений ушло</span>
        </div>
        <div className="kpi">
          <b>{state.stats.replied}</b>
          <span>ответов</span>
        </div>
        <div className="kpi">
          <b>{state.stats.openTasks}</b>
          <span>задач менеджеру</span>
        </div>
        <div className="kpi">
          <b>{state.stats.amocrmContacts}/{state.stats.amocrmDeals}</b>
          <span>amo контакты/сделки</span>
        </div>
      </section>

      {error ? <p className="error">{error}</p> : null}

      {tab === 'stand' ? (
        <div className="grid">
          <article className="card">
            <h2>Сценарий на встрече</h2>
            <ol className="script">
              <li>
                <i>1</i>
                <span>Прогнать демо-базу — 20 строк, дубли и мусор внутри.</span>
              </li>
              <li>
                <i>2</i>
                <span>Анна Иванова склеится: +7 916… и 8(916)… один контакт.</span>
              </li>
              <li>
                <i>3</i>
                <span>Кому можно писать автоматически — уйдёт первое касание-вопрос.</span>
              </li>
              <li>
                <i>4</i>
                <span>Ответ останавливает серию. Отказ — в suppression. Анкета даёт рейтинг A/B/C.</span>
              </li>
            </ol>
            <div className="actions">
              <button className="primary" disabled={busy} onClick={() => void run()}>
                {busy ? 'Гоню…' : 'Прогнать демо-базу'}
              </button>
              <button className="ghost" disabled={busy} onClick={() => void act(() => api.reset())}>
                Сбросить
              </button>
              <label className="ghost file-btn">
                Свой CSV / XLSX
                <input
                  type="file"
                  accept=".csv,.txt,.xlsx,.xlsm"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    void uploadFile(file);
                  }}
                />
              </label>
            </div>
            {state.amocrm === 'live' ? (
              <p className="lead">
                Сброс чистит только локальную базу. Повторный прогон бьёт в тот же trial amoCRM:
                дубль не создаётся, пустые поля дописываются, активная сделка не плодится.
              </p>
            ) : null}
            {state.batch ? (
              <p className="lead">
                Файл {state.batch.filename}: {state.batch.status}. Строк {state.batch.totalRows},
                новых {state.batch.successRows}, дублей {state.batch.duplicateRows}, ручных{' '}
                {state.batch.manualRows}, ошибок {state.batch.failedRows}.
              </p>
            ) : (
              <p className="lead">База пустая. Нажми кнопку — поднимется образец из fixtures.</p>
            )}
          </article>

          <article className="card">
            <h2>Карточка для показа</h2>
            {selectedDeal ? (
              <>
                <p>
                  <b>{nameOf(selectedDeal)}</b>
                  {selectedDeal.city ? `, ${selectedDeal.city}` : ''}
                  <br />
                  {STAGE[selectedDeal.stage] ?? selectedDeal.stage} ·{' '}
                  {AUTOMATION[selectedDeal.automationStatus]}
                  {selectedDeal.managerName ? ` · ${selectedDeal.managerName}` : ''}
                  {selectedDeal.rating ? ` · рейтинг ${selectedDeal.rating}` : ''}
                  {selectedDeal.isVedicAstrologer ? ' · Джйотиш' : ''}
                  {selectedDeal.amocrmContactId ? ` · amo ${selectedDeal.amocrmContactId}` : ''}
                </p>
                {selectedDeal.scoreReasons?.length ? (
                  <p className="lead">{selectedDeal.scoreReasons.join('. ')}</p>
                ) : null}
                <div className="actions">
                  {(['interested', 'later', 'refuse'] as ReplyVariant[]).map((variant) => (
                    <button
                      key={variant}
                      className={variant === 'refuse' ? 'danger' : 'ghost'}
                      disabled={busy}
                      onClick={() => void act(() => api.reply(selectedDeal.dealId, variant))}
                    >
                      {variant === 'interested'
                        ? 'Ответ: интересно'
                        : variant === 'later'
                          ? 'Напишите позже'
                          : 'Отказ'}
                    </button>
                  ))}
                  <button
                    className="sage"
                    disabled={busy}
                    onClick={() => void act(() => api.qualify(selectedDeal.dealId))}
                  >
                    Заполнить анкету
                  </button>
                </div>
              </>
            ) : (
              <p className="lead">Сначала прогони базу — появится сделка с автоканалом.</p>
            )}
          </article>
        </div>
      ) : null}

      {tab === 'tz' ? (
        sources?.tz.text ? <TzBrief text={sources.tz.text} /> : <article className="card">Загружаю ТЗ…</article>
      ) : null}

      {tab === 'critical' ? <CriticalBrief /> : null}

      {tab === 'import' ? (
        <div className="stack">
          <article className="card">
            <h2>Импортируемый файл</h2>
            <p className="lead">
              {sources?.csv.filename ?? 'astro-base-sample.csv'}
              {csvBody.length ? ` · ${csvBody.length} строк` : ''}
              . Свой файл — кнопка на вкладке «Стенд».
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {csvHead.map((cell) => (
                      <th key={cell}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvBody.map((row, index) => (
                    <tr key={`${row[0] ?? 'row'}-${index}`}>
                      {csvHead.map((_, col) => (
                        <td key={`${index}-${col}`}>{row[col] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          <article className="card">
            <h2>Как система разобрала строки</h2>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Статус</th>
                  <th>Ошибка</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{ROW_STATUS[row.status] ?? row.status}</td>
                    <td>{row.errorMessage ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {state.rows.length === 0 ? <p className="lead">Прогони демо-базу — появятся статусы разбора.</p> : null}
          </article>
        </div>
      ) : null}

      {tab === 'deals' ? (
        <div className="grid">
          <article className="card">
            <h2>Сделки</h2>
            <table>
              <thead>
                <tr>
                  <th>Контакт</th>
                  <th>Этап</th>
                  <th>Авто</th>
                  <th>Канал</th>
                  <th>amo</th>
                </tr>
              </thead>
              <tbody>
                {state.pipeline.map((row) => (
                  <tr key={row.dealId} onClick={() => setSelected(row.dealId)} style={{ cursor: 'pointer' }}>
                    <td>
                      {nameOf(row)}
                      <div className="lead">{row.schoolName ?? row.telegram ?? ''}</div>
                    </td>
                    <td>{STAGE[row.stage] ?? row.stage}</td>
                    <td>
                      <span
                        className={`pill ${
                          row.automationStatus.startsWith('STOPPED') ? 'stop' : 'ok'
                        }`}
                      >
                        {AUTOMATION[row.automationStatus]}
                      </span>
                    </td>
                    <td>{ELIGIBILITY[row.eligibility] ?? row.eligibility}</td>
                    <td>{row.amocrmDealId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
          <article className="card">
            <h2>Фактический текст</h2>
            {state.recentMessages.map((message) => (
              <div className="msg" key={message.id}>
                <div className="meta">
                  {message.direction === 'OUTBOUND' ? 'Исходящее' : 'Входящее'} · {message.status}
                  {message.step ? ` · ${message.step}` : ''}
                </div>
                {message.body}
              </div>
            ))}
            {state.recentMessages.length === 0 ? <p className="lead">Пока пусто.</p> : null}
          </article>
        </div>
      ) : null}

    </div>
  );
}
