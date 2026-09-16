#!/usr/bin/env python3
"""Генерирует HTML-дашборд горячих лидов.
Вход: output/messages_filtered.json (кандидаты) + output/scores.json (оценка агента 0–100 + риск).
Выход: output/dashboard.html. Подвал — маркетинговая строка из brand.txt (DASHBOARD_FOOTER).
"""
import html as _html
import json
from pathlib import Path

CANDIDATES_PATH = Path("output/messages_filtered.json")
WEB_CANDIDATES_PATH = Path("output/web_candidates.json")
SCORES_PATH = Path("output/scores.json")
OUTPUT_PATH = Path("output/dashboard.html")
BRAND_PATH = Path("brand.txt")

BANDS = [
    (80, "🌋 Очень горячий"),
    (60, "🔥 Горячий"),
    (40, "☀️ Тёплый"),
    (20, "🌤 Тёплый-низкий"),
    (0,  "❄️ Холодный/нецелевой"),
]

def band_of(score: int) -> str:
    for threshold, label in BANDS:
        if score >= threshold:
            return label
    return BANDS[-1][1]

def is_red(risk: str) -> bool:
    return "🔴" in (risk or "")

def load_footer() -> str:
    if BRAND_PATH.exists():
        for line in BRAND_PATH.read_text(encoding="utf-8").splitlines():
            if line.startswith("DASHBOARD_FOOTER="):
                return line.split("=", 1)[1].strip()
    return ""

def build_rows(candidates: list, scores: dict) -> list:
    rows = []
    for c in candidates:
        s = scores.get(str(c["user_id"]))
        if not s:
            continue
        score = int(s["score"])
        rows.append({
            "name": c.get("name", ""),
            "username": c.get("username", ""),
            "source": c.get("source", ""),
            "text": c.get("text", ""),
            "score": score,
            "band": s.get("band") or band_of(score),
            "risk": s.get("risk", "🟢 Низкий"),
            "rationale": s.get("rationale", ""),
            "scenario": s.get("scenario", ""),
            # Заявки с площадок вне Telegram приходят со ссылкой на первоисточник.
            "link": c.get("link", ""),
        })
    # 🔴 — всегда вниз; в остальном — по баллу убыванию
    rows.sort(key=lambda r: (is_red(r["risk"]), -r["score"]))
    return rows

def render_html(rows: list, footer: str) -> str:
    total = len(rows)
    hot = sum(1 for r in rows if r["score"] >= 80)
    warm = sum(1 for r in rows if 60 <= r["score"] < 80)
    band_counts = {}
    for r in rows:
        band_counts[r["band"]] = band_counts.get(r["band"], 0) + 1

    def td(x): return _html.escape(str(x))

    def source_cell(r):
        link = r.get("link", "")
        if not link:
            return td(r["source"])
        return f"<a href='{td(link)}' target='_blank' rel='noopener'>{td(r['source'])} ↗</a>"

    rows_html = "\n".join(
        f"<tr class='{'red' if is_red(r['risk']) else ''}'>"
        f"<td>{i+1}</td><td>{td(r['name'])}</td><td>{td(r['username'])}</td>"
        f"<td>{source_cell(r)}</td><td class='q'>{td(r['text'])}</td>"
        f"<td class='score'>{r['score']}</td><td>{td(r['band'])}</td>"
        f"<td>{td(r['risk'])}</td><td>{td(r['rationale'])}</td><td>{td(r['scenario'])}</td></tr>"
        for i, r in enumerate(rows)
    )
    bands_html = "".join(
        f"<li>{td(label)}: <b>{band_counts.get(label,0)}</b></li>" for _, label in BANDS
    )
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Горячие лиды</title>
<style>
 body{{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#1d1d1f;background:#fafafa}}
 h1{{font-size:22px}} .kpi{{display:flex;gap:16px;margin:16px 0}}
 .card{{background:#fff;border-radius:12px;padding:14px 18px;box-shadow:0 1px 4px rgba(0,0,0,.08)}}
 .card b{{font-size:24px;display:block}} ul{{list-style:none;padding:0;display:flex;gap:14px;flex-wrap:wrap}}
 table{{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden}}
 th,td{{padding:8px 10px;text-align:left;border-bottom:1px solid #eee;font-size:13px;vertical-align:top}}
 th{{background:#f0f0f3}} td.q{{max-width:360px}} td.score{{font-weight:700}}
 tr.red{{opacity:.55;background:#fff5f5}}
 footer{{margin-top:24px;padding:16px;background:#fff;border-radius:12px;font-size:14px}}
</style></head><body>
<h1>🔥 Горячие лиды</h1>
<div class="kpi">
 <div class="card"><b>{total}</b>лидов оценено</div>
 <div class="card"><b>{hot}</b>🌋 очень горячих</div>
 <div class="card"><b>{warm}</b>🔥 горячих</div>
</div>
<h3>Распределение по бэндам</h3><ul>{bands_html}</ul>
<table><thead><tr><th>#</th><th>Имя</th><th>@username</th><th>Чат</th><th>Запрос</th>
<th>Балл</th><th>Бэнд</th><th>Риск</th><th>Почему</th><th>Что предложить</th></tr></thead>
<tbody>{rows_html}</tbody></table>
<footer>{_html.escape(footer)}</footer>
</body></html>"""

def main():  # pragma: no cover
    candidates = json.loads(CANDIDATES_PATH.read_text(encoding="utf-8")) if CANDIDATES_PATH.exists() else []
    if WEB_CANDIDATES_PATH.exists():
        candidates += json.loads(WEB_CANDIDATES_PATH.read_text(encoding="utf-8"))
    scores = json.loads(SCORES_PATH.read_text(encoding="utf-8")) if SCORES_PATH.exists() else {}
    rows = build_rows(candidates, scores)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(render_html(rows, load_footer()), encoding="utf-8")
    print(f"✅ Дашборд готов: {OUTPUT_PATH} — лидов в таблице: {len(rows)}")

if __name__ == "__main__":  # pragma: no cover
    main()
