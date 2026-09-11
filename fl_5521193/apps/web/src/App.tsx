import { useEffect, useMemo, useState } from 'react';
import { api, type DemoState, type ReplyVariant } from './api';
import { AUTOMATION, ELIGIBILITY, ROW_STATUS, STAGE } from './labels';

type Tab = 'stand' | 'import' | 'deals' | 'risks';

const nameOf = (row: DemoState['pipeline'][number]) =>
  [row.firstName, row.lastName].filter(Boolean).join(' ') || 'без имени';

export function App() {
  const [tab, setTab] = useState<Tab>('stand');
  const [state, setState] = useState<DemoState | null>(null);
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
    const id = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

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

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.runSample();
      for (let i = 0; i < 20; i += 1) {
        const next = await refresh();
        if (next.batch?.status === 'DONE' && next.stats.messagesSent > 0) break;
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прогнать демо');
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
              ? ` · в CRM ушло ${state.stats.amocrmContacts} контактов / ${state.stats.amocrmDeals} сделок.`
              : ' в stub — заказчик видит правила, не спам.'}
          </p>
        </div>
        <div className="banner">
          Канал: {state.messaging}. amoCRM: {state.amocrm}. Telegram-бот первым не пишет — в проде
          шлюз Wazzup/Radist.
        </div>
      </header>

      <nav className="tabs">
        {(
          [
            ['stand', 'Стенд'],
            ['import', 'Импорт'],
            ['deals', 'Сделки'],
            ['risks', 'Почему так'],
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
            </div>
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

      {tab === 'import' ? (
        <article className="card">
          <h2>Строки файла</h2>
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
        </article>
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

      {tab === 'risks' ? (
        <article className="card risks">
          <h2>Три разговора с заказчиком</h2>
          <dl>
            <dt>Telegram-бот не пишет первым</dt>
            <dd>
              Username в базе не даёт права начать чат. На проде — шлюз amoCRM (Wazzup/Radist) с
              тарифом исходящего. Иначе менеджер шлёт руками из очереди «только вручную».
            </dd>
            <dt>Дедуп не в amoCRM</dt>
            <dd>
              Поиск amoCRM не нормализует телефоны и упирается в 7 rps. Истина — PostgreSQL,
              UNIQUE по идентификатору, advisory lock. amoCRM остаётся рабочим столом менеджера.
            </dd>
            <dt>Любой ответ гасит серию</dt>
            <dd>
              Отменить джобу мало: она уже может выполняться. Перед send — FOR UPDATE по сделке.
              «Не интересно» и «напишите через месяц» — разные исходы, не один флаг.
            </dd>
          </dl>
        </article>
      ) : null}
    </div>
  );
}
