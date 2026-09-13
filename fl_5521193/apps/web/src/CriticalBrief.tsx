import { CUSTOMER_RISKS, LEVEL_LABEL, OWNER_LABEL } from './critical-customer';

export function CriticalBrief() {
  const rank = { blocker: 0, important: 1, ok: 2 };
  const risks = [...CUSTOMER_RISKS].sort((a, b) => rank[a.level] - rank[b.level]);
  const blockers = CUSTOMER_RISKS.filter((risk) => risk.level === 'blocker').length;

  return (
    <div className="stack">
      <article className="card">
        <h2>Что важно понять до договора</h2>
        <p className="lead">
          Восемь развилок. Три без вашего решения не стартуют — они сверху и подсвечены. Остальное
          закрываем в продукте, вам достаточно сути.
        </p>
        <p className="brief-count">
          <b>{blockers}</b> решения за вами · остальное — наша зона
        </p>
      </article>

      {risks.map((risk) => (
        <article className={`card risk-card ${risk.level}`} key={risk.id}>
          <div className="risk-head">
            <span className="risk-num">{risk.id}</span>
            <h3>{risk.title}</h3>
          </div>
          <div className="risk-pills">
            <span className={`pill ${risk.level === 'blocker' ? 'stop' : risk.level === 'ok' ? 'ok' : 'warn'}`}>
              {LEVEL_LABEL[risk.level]}
            </span>
            <span className={`pill ${risk.owner === 'you' ? 'you' : 'ok'}`}>{OWNER_LABEL[risk.owner]}</span>
          </div>
          <p>{risk.gist}</p>
          <dl className="risk-split">
            <div>
              <dt>Мы</dt>
              <dd>{risk.weDo}</dd>
            </div>
            {risk.youDo ? (
              <div className="you-box">
                <dt>Вы</dt>
                <dd>{risk.youDo}</dd>
              </div>
            ) : null}
          </dl>
        </article>
      ))}
    </div>
  );
}
