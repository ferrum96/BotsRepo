async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tierClass(tier) {
  if (!tier) return "";
  if (tier.startsWith("A")) return "a";
  if (tier.startsWith("B")) return "b";
  return "c";
}

let allDeals = [];
let dealFilter = "all";

function renderKpis(a) {
  const items = [
    { label: "Контактов в CRM", value: a.contacts_loaded, hint: "база 100 + импорт" },
    { label: "Сделок", value: a.deals_total, hint: "воронка Астро-партнёры" },
    { label: "Сообщений", value: a.messages_sent, hint: `доставка ${a.delivery_pct}%` },
    { label: "Ответы", value: `${a.reply_pct}%`, hint: `${a.replied} сделок` },
    { label: "Квалификация", value: `${a.qualified_pct}%`, hint: `${a.qualified}` },
    { label: "Интерес", value: `${a.interested_pct}%`, hint: `${a.interested}` },
    { label: "Подключены", value: `${a.connected_pct}%`, hint: `${a.connected}` },
    { label: "День демо", value: a.demo_day, hint: `лимит ${a.daily_limit}/менеджер` },
  ];
  document.getElementById("kpis").innerHTML = items
    .map(
      (x, i) =>
        `<div class="kpi" style="animation-delay:${i * 40}ms"><div class="label">${esc(x.label)}</div><div class="value">${esc(x.value)}</div><div class="hint">${esc(x.hint)}</div></div>`
    )
    .join("");
}

function renderFunnel(funnel) {
  const max = Math.max(...funnel.map((f) => f.count), 1);
  document.getElementById("funnel").innerHTML = funnel
    .map(
      (f) => `<div class="funnel-row">
        <div>${esc(f.name)}</div>
        <div class="funnel-bar"><span style="width:${(100 * f.count) / max}%"></span></div>
        <div><b>${f.count}</b></div>
      </div>`
    )
    .join("");
}

function renderDedup(result) {
  const box = document.getElementById("dedup-summary");
  const table = document.getElementById("dedup-table");
  if (!result) {
    box.innerHTML = "<p>Нет данных импорта</p>";
    table.innerHTML = "";
    return;
  }
  box.innerHTML = [
    ["Лидов импорт", result.total_leads],
    ["Новых контактов", result.created_contacts],
    ["Обогащено (дубли)", result.enriched_contacts],
    ["Новых сделок", result.created_deals],
  ]
    .map(([k, v]) => `<div class="chip"><b>${v}</b><span>${esc(k)}</span></div>`)
    .join("");

  const rows = (result.matches || [])
    .map(
      (m) => `<tr>
        <td>#${m.lead_index + 1}</td>
        <td>контакт #${m.matched_contact_id}</td>
        <td><span class="badge warn">${esc(m.matched_by)}</span></td>
        <td>${esc(m.action)}</td>
      </tr>`
    )
    .join("");
  table.innerHTML = `<table>
    <thead><tr><th>Лид</th><th>Совпадение</th><th>По полю</th><th>Действие</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">Дублей нет</td></tr>'}</tbody>
  </table>`;
}

function renderDealFilters(deals) {
  const stages = ["all", ...new Set(deals.map((d) => d.stage))];
  document.getElementById("deal-filters").innerHTML = stages
    .map((s) => {
      const label = s === "all" ? "Все" : s;
      const active = dealFilter === s ? "active" : "";
      return `<button class="tab ${active}" data-stage="${esc(s)}" type="button">${esc(label)}</button>`;
    })
    .join("");
  document.querySelectorAll("#deal-filters .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      dealFilter = btn.dataset.stage;
      renderDeals();
      renderDealFilters(allDeals);
    });
  });
}

function renderDeals() {
  const deals = allDeals.filter((d) => dealFilter === "all" || d.stage === dealFilter);
  const rows = deals
    .map((d) => {
      const tier = d.score_tier
        ? `<span class="badge ${tierClass(d.score_tier)}">${esc(d.score_tier)} · ${d.score}</span>`
        : "—";
      const pf = d.partner_funnel ? `<div class="badge ok">${esc(d.partner_funnel)}</div>` : "";
      const auto = d.automation_stopped
        ? `<span class="badge danger">авто стоп</span>`
        : `<span class="badge">авто</span>`;
      return `<tr>
        <td>#${d.id}<br/><span class="badge">${esc(d.contact_name)}</span></td>
        <td>@${esc(d.contact_tg || "—")}</td>
        <td>${esc(d.stage)}${pf}</td>
        <td>${esc(d.manager_name || "—")}</td>
        <td>${d.messages_sent}/${d.messages_delivered}</td>
        <td>${tier}<br/>${auto}</td>
      </tr>`;
    })
    .join("");
  document.getElementById("deals").innerHTML = `<table>
    <thead><tr><th>Сделка</th><th>TG</th><th>Этап</th><th>Менеджер</th><th>MSG</th><th>Score</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderLeads(items, meta) {
  const titleHint = meta?.filename ? ` · ${meta.filename}` : "";
  const rows = items
    .map(
      (l, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(l.first_name)} ${esc(l.last_name)}</td>
        <td>@${esc(l.telegram_username || "—")}</td>
        <td>${esc(l.phone || "—")}</td>
        <td>${esc(l.city || "—")}</td>
        <td><span class="badge">${esc(l.source_found)}</span></td>
      </tr>`
    )
    .join("");
  document.getElementById("leads").innerHTML = `<div class="meta" style="color:var(--muted);font-size:12px;margin-bottom:8px">Строк: ${items.length}${esc(titleHint)}</div><table>
    <thead><tr><th>#</th><th>Имя</th><th>Username</th><th>Телефон</th><th>Город</th><th>Источник</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderInitialContacts(payload) {
  document.getElementById("initial-count").textContent = `${payload.total} контактов`;
  const rows = payload.items
    .map(
      (c) => `<tr>
        <td>#${c.id}</td>
        <td>${esc(c.first_name)} ${esc(c.last_name)}</td>
        <td>@${esc(c.telegram_username || "—")}</td>
        <td>${esc(c.phone || "—")}</td>
        <td>${esc(c.email || "—")}</td>
        <td>${esc(c.city || "—")}</td>
        <td>${esc(c.parse_source || "—")}</td>
      </tr>`
    )
    .join("");
  document.getElementById("initial-contacts").innerHTML = `<table>
    <thead><tr><th>ID</th><th>Имя</th><th>Telegram</th><th>Телефон</th><th>Email</th><th>Город</th><th>Источник парсинга</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderComms(messages, replies) {
  const blocks = [];
  for (const m of messages.slice(-12).reverse()) {
    blocks.push(`<div class="msg">
      <div class="meta">OUT · сделка #${m.deal_id} · день ${m.day} · ${esc(m.template_name)} · ${esc(m.status)}</div>
      <div>${esc(m.body)}</div>
    </div>`);
  }
  for (const r of replies) {
    blocks.unshift(`<div class="msg reply">
      <div class="meta">IN · сделка #${r.deal_id} · ответ остановил автоцепочку</div>
      <div>${esc(r.text)}</div>
    </div>`);
  }
  document.getElementById("comms").innerHTML = blocks.join("") || "<p>Нет сообщений</p>";
}

function renderTasks(items) {
  document.getElementById("tasks").innerHTML =
    items
      .map(
        (t) => `<div class="task">
          <div class="meta">${esc(t.manager_name)} · сделка #${t.deal_id}</div>
          <div>${esc(t.title)}</div>
        </div>`
      )
      .join("") || "<p>Нет задач</p>";
}

function renderLogs(items) {
  document.getElementById("logs").innerHTML = items
    .slice(0, 40)
    .map(
      (l) => `<div class="log-item">
        <div class="meta"><code>${esc(l.action)}</code> · ${esc(l.entity)} #${l.entity_id ?? "—"}</div>
        <div>${esc(l.detail)}</div>
      </div>`
    )
    .join("");
}

function renderArchitecture(bp) {
  document.getElementById("arch-principle").textContent = bp.principle;
  document.getElementById("arch-start").textContent = bp.start_with;

  document.getElementById("arch-pipeline").innerHTML = bp.pipeline
    .map((p, i) => {
      const arrow = i < bp.pipeline.length - 1 ? '<span class="pipe-arrow">→</span>' : "";
      return `<span class="pipe-node">${esc(p)}</span>${arrow}`;
    })
    .join("");

  document.getElementById("arch-components").innerHTML = `<table>
    <thead><tr><th>Компонент</th><th>Назначение</th><th>Инструменты</th></tr></thead>
    <tbody>${bp.components
      .map(
        (c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.role)}</td><td>${esc(c.tools)}</td></tr>`
      )
      .join("")}</tbody>
  </table>`;

  document.getElementById("arch-gap").innerHTML = `<table>
    <thead><tr><th>Область</th><th>Демо сейчас</th><th>Прод</th></tr></thead>
    <tbody>${bp.demo_vs_prod
      .map(
        (r) => `<tr><td>${esc(r.area)}</td><td>${esc(r.demo)}</td><td>${esc(r.prod)}</td></tr>`
      )
      .join("")}</tbody>
  </table>`;

  document.getElementById("arch-stack").innerHTML = Object.entries(bp.stack)
    .map(([k, v]) => `<div class="stack-item"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`)
    .join("");

  document.getElementById("plan-phases").innerHTML = bp.phases
    .map(
      (p) => `<div class="phase">
        <span class="badge ${p.demo_covers ? "ok" : "c"} tag">${p.demo_covers ? "частично в демо" : "после MVP"}</span>
        <h3>Фаза ${p.id}. ${esc(p.title)}</h3>
        <ul>${p.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      </div>`
    )
    .join("");

  document.getElementById("plan-stages").innerHTML = bp.stages
    .map(
      (s) => `<div class="stage-card">
        <span class="badge tag">Этап ${s.id}</span>
        <h3>${esc(s.title)}</h3>
        <div class="meta" style="color:var(--accent-2);font-size:12px;margin-bottom:6px">${esc(s.outcome)}</div>
        <ul>${(s.items || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      </div>`
    )
    .join("");

  document.getElementById("plan-epics").innerHTML = bp.epics
    .map(
      (e) => `<div class="epic">
        <h3>${esc(e.id)} · ${esc(e.title)}</h3>
        <ul>${e.tasks.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </div>`
    )
    .join("");

  const sc = bp.scoring;
  document.getElementById("plan-scoring").innerHTML = `
    <p style="color:var(--muted);font-size:13px;margin:0 0 10px">Пороги: A ${esc(sc.tiers.A)} · B ${esc(sc.tiers.B)} · C ${esc(sc.tiers.C)}</p>
    <div class="stack-grid">${Object.entries(sc.weights)
      .map(([k, v]) => `<div class="stack-item"><div class="k">${esc(k)}</div><div class="v">+${v}</div></div>`)
      .join("")}</div>`;

  document.getElementById("risks-list").innerHTML = bp.risks
    .map(
      (r) => `<div class="risk"><h3>${esc(r.title)}</h3><div class="detail">${esc(r.detail)}</div></div>`
    )
    .join("");
}

function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.add("active");
  document.querySelector(`.nav-btn[data-view="${name}"]`).classList.add("active");
}

async function loadAll() {
  const [overview, dedup, deals, leads, messages, replies, tasks, logs, arch, initial] = await Promise.all([
    api("/api/overview"),
    api("/api/dedup"),
    api("/api/deals"),
    api("/api/leads"),
    api("/api/messages"),
    api("/api/replies"),
    api("/api/tasks"),
    api("/api/logs"),
    api("/api/architecture"),
    api("/api/contacts?scope=initial&limit=200"),
  ]);

  document.getElementById("goal-text").textContent = overview.goal;
  document.getElementById("legal-note").textContent = overview.analytics.legal_note;
  renderKpis(overview.analytics);
  renderFunnel(overview.analytics.funnel);
  renderDedup(dedup.result);
  allDeals = deals.items;
  renderDealFilters(allDeals);
  renderDeals();
  renderLeads(leads.items, leads.meta);
  renderInitialContacts(initial);
  renderComms(messages.items, replies.items);
  renderTasks(tasks.items);
  renderLogs(logs.items);
  renderArchitecture(arch);
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

document.getElementById("btn-reset").addEventListener("click", async () => {
  await api("/api/reset-demo", { method: "POST" });
  dealFilter = "all";
  document.getElementById("import-status").textContent = "";
  await loadAll();
});

document.getElementById("excel-file").addEventListener("change", async (ev) => {
  const input = ev.target;
  const file = input.files && input.files[0];
  if (!file) return;
  const status = document.getElementById("import-status");
  status.classList.remove("err");
  status.textContent = `Импорт «${file.name}»…`;
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/import/excel", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.detail?.message || data.detail || res.statusText;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    const r = data.result;
    status.textContent = `Готово: +${r.created_contacts} контактов, обогащено ${r.enriched_contacts}, сделок ${r.created_deals}, skip ${r.skipped_duplicate_deals}`;
    dealFilter = "all";
    await loadAll();
  } catch (err) {
    status.classList.add("err");
    status.textContent = `Ошибка: ${err.message}`;
  } finally {
    input.value = "";
  }
});

loadAll().catch((err) => {
  document.getElementById("goal-text").textContent = `Ошибка загрузки: ${err.message}`;
});
