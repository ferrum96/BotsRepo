"""Источники лидов вне Telegram.

Работаем только через официальные открытые каналы: RSS-ленты и публичные API.
Никакого обхода защиты и авторизации — если площадка закрыла доступ, источник
просто не используется.

Доступные источники:
  • FL.ru            — RSS всех новых заказов (русский рынок)
  • Freelancehunt    — RSS проектов (СНГ / международный)
  • Remote OK        — публичный API удалённых вакансий
  • Remotive         — публичный API remote-jobs
  • We Work Remotely — публичный RSS programming-вакансий
  • Reddit           — Atom-лента поиска (сабреддиты с прямым спросом)
  • Hacker News      — публичный API поиска Algolia
"""
import hashlib
import html as _html
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import List, Optional
from xml.etree import ElementTree as ET

USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
              "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")
REQUEST_TIMEOUT = 25
PAUSE_SECONDS = 1.0        # пауза между запросами к одной площадке
REDDIT_PAUSE_SECONDS = 6.0  # Reddit жёстко ограничивает частоту и отдаёт 429
RETRY_PAUSE_SECONDS = 25.0
TEXT_MAX_CHARS = 700

# На Reddit и Hacker News упоминание темы почти всегда означает обсуждение,
# а не заказ. Поэтому оставляем только записи, где кто-то ищет исполнителя.
DEMAND_MARKERS = [
    "seeking", "looking for", "look for", "hiring", "hire", "need someone",
    "need a", "needed", "who can build", "can someone build", "recommend a",
    "recommendation for", "anyone know a", "willing to pay", "budget",
    "freelancer", "for hire", "quote",
]

# Обратная сторона: на тех же площадках исполнители сами предлагают услуги.
# Такие посты помечены [FOR HIRE] / [OFFER] — это конкуренты, а не клиенты.
OFFER_MARKERS = [
    "for hire", "offer", "offering", "portfolio", "my services",
    "available", "hourly rate",
]

FL_RU_FEED = "https://www.fl.ru/rss/all.xml"
FREELANCEHUNT_FEED = "https://freelancehunt.com/projects.rss"
REMOTEOK_API = "https://remoteok.com/api"
REMOTIVE_API = "https://remotive.com/api/remote-jobs"
WWR_FEED = "https://weworkremotely.com/categories/remote-programming-jobs.rss"
REDDIT_SEARCH = "https://www.reddit.com/search.rss"
REDDIT_SUB_SEARCH = "https://www.reddit.com/r/{sub}/search.rss"
HN_SEARCH = "https://hn.algolia.com/api/v1/search_by_date"

ATOM_NS = "{http://www.w3.org/2005/Atom}"

# У Python на macOS часто нет собственного набора корневых сертификатов,
# поэтому берём его из certifi — иначе любой HTTPS-запрос падает на проверке.
try:
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover
    _SSL_CONTEXT = ssl.create_default_context()


def _get(url: str) -> Optional[bytes]:
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept-Language": "ru,en;q=0.8",
    })
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT,
                                        context=_SSL_CONTEXT) as response:
                return response.read()
        except urllib.error.HTTPError as e:
            # 429 — превышена частота запросов: единственное, что помогает, — подождать.
            if e.code == 429 and attempt == 1:
                time.sleep(RETRY_PAUSE_SECONDS)
                continue
            print(f"  ⚠ не удалось загрузить {url.split('?')[0]}: {e}")
            return None
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"  ⚠ не удалось загрузить {url.split('?')[0]}: {e}")
            return None
    return None


def _strip_html(raw: str) -> str:
    return " ".join(_html.unescape(re.sub(r"<[^>]+>", " ", raw or "")).split())


def _matches(text: str, queries: List[str]) -> bool:
    """Сравнение по целым словам, а не по подстроке: иначе фраза «бота»
    находилась бы внутри слова «работа» и лента забивалась бы мусором."""
    lowered = text.lower()
    return any(
        re.search(r"(?<!\w)" + re.escape(q.lower()) + r"(?!\w)", lowered)
        for q in queries
    )


def _lead_id(link: str) -> int:
    """Стабильный числовой id из ссылки — чтобы оценки в scores.json
    не «отваливались» при повторных прогонах."""
    return int(hashlib.sha1(link.encode("utf-8")).hexdigest()[:12], 16)


def _lead(source: str, title: str, author: str, text: str,
          link: str, date: datetime) -> dict:
    return {
        "user_id": _lead_id(link),
        "username": author,
        "name": title[:160],
        "source": source,
        "text": text[:TEXT_MAX_CHARS],
        "link": link,
        "date": date.isoformat(),
    }


def _parse_pub_date(raw_date: Optional[str]) -> Optional[datetime]:
    if not raw_date:
        return None
    try:
        published = parsedate_to_datetime(raw_date)
    except (TypeError, ValueError):
        return None
    if published.tzinfo is None:
        published = published.replace(tzinfo=timezone.utc)
    return published


def _fetch_rss_board(feed_url: str, source: str, queries: List[str],
                     days: int) -> List[dict]:
    """Общий разбор RSS-бирж вроде FL.ru / Freelancehunt / WWR."""
    body = _get(feed_url)
    if not body:
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    leads = []
    for item in ET.fromstring(body).iterfind("./channel/item"):
        title = (item.findtext("title") or "").strip()
        description = _strip_html(item.findtext("description") or "")
        categories = [
            (c.text or "").strip()
            for c in item.findall("category")
            if (c.text or "").strip()
        ]
        category = ", ".join(categories)
        link = (item.findtext("link") or "").strip()
        published = _parse_pub_date(item.findtext("pubDate"))
        if not link or not published or published < cutoff:
            continue
        blob = f"{title} {description} {category}"
        if not _matches(blob, queries):
            continue
        leads.append(_lead(
            source=source,
            title=title,
            author="",
            text=f"[{category}] {description}" if category else description,
            link=link,
            date=published,
        ))
    print(f"  {source} → подходящих заказов: {len(leads)}")
    return leads


def fetch_fl_ru(queries: List[str], days: int = 7) -> List[dict]:
    """Новые заказы с FL.ru по вашим фразам в теме, описании или категории."""
    return _fetch_rss_board(FL_RU_FEED, "FL.ru", queries, days)


def fetch_freelancehunt(queries: List[str], days: int = 7) -> List[dict]:
    """Проекты с Freelancehunt (СНГ и зарубежные заказчики) по вашим фразам."""
    return _fetch_rss_board(FREELANCEHUNT_FEED, "Freelancehunt", queries, days)


def fetch_weworkremotely(queries: List[str], days: int = 7) -> List[dict]:
    """Публичный RSS We Work Remotely (programming) — международный рынок."""
    return _fetch_rss_board(WWR_FEED, "We Work Remotely", queries, days)


def fetch_remoteok(queries: List[str], days: int = 7) -> List[dict]:
    """Публичный API Remote OK: удалённые вакансии и контракты по миру."""
    body = _get(REMOTEOK_API)
    if not body:
        return []
    try:
        rows = json.loads(body)
    except json.JSONDecodeError:
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    leads = []
    for row in rows:
        if not isinstance(row, dict) or not row.get("id"):
            continue
        title = (row.get("position") or "").strip()
        company = (row.get("company") or "").strip()
        description = _strip_html(row.get("description") or "")
        tags = " ".join(row.get("tags") or [])
        link = (row.get("url") or row.get("apply_url")
                or f"https://remoteok.com/remote-jobs/{row.get('slug') or row['id']}")
        published = None
        raw_date = row.get("date")
        if isinstance(raw_date, str) and raw_date:
            try:
                published = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
            except ValueError:
                published = None
        if published is None and row.get("epoch") is not None:
            try:
                published = datetime.fromtimestamp(int(row["epoch"]), timezone.utc)
            except (TypeError, ValueError, OSError):
                continue
        if published is None:
            continue
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
        if published < cutoff:
            continue
        if not _matches(f"{title} {description} {tags}", queries):
            continue
        leads.append(_lead(
            source="Remote OK",
            title=f"{company}: {title}" if company else title,
            author=company,
            text=description or tags,
            link=link,
            date=published,
        ))
    print(f"  Remote OK → подходящих вакансий: {len(leads)}")
    return leads


def fetch_remotive(queries: List[str], days: int = 7) -> List[dict]:
    """Публичный API Remotive — международные remote-вакансии."""
    body = _get(REMOTIVE_API)
    if not body:
        return []
    try:
        jobs = json.loads(body).get("jobs", [])
    except json.JSONDecodeError:
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    leads = []
    for job in jobs:
        title = (job.get("title") or "").strip()
        company = (job.get("company_name") or "").strip()
        description = _strip_html(job.get("description") or "")
        tags = " ".join(job.get("tags") or [])
        category = (job.get("category") or "").strip()
        link = (job.get("url") or "").strip()
        raw_date = job.get("publication_date") or ""
        if not link or not raw_date:
            continue
        try:
            published = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
        except ValueError:
            continue
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
        if published < cutoff:
            continue
        if not _matches(f"{title} {description} {tags} {category}", queries):
            continue
        leads.append(_lead(
            source="Remotive",
            title=f"{company}: {title}" if company else title,
            author=company,
            text=description or f"{category} {tags}".strip(),
            link=link,
            date=published,
        ))
    print(f"  Remotive → подходящих вакансий: {len(leads)}")
    return leads


def fetch_reddit(queries: List[str], days: int = 7,
                 subreddits: Optional[List[str]] = None,
                 limit: int = 25) -> List[dict]:
    """Поиск по Reddit через Atom-ленту: либо по всему сайту, либо внутри
    указанных сабреддитов (r/forhire и подобные дают самый прямой спрос).

    Несколько фраз склеиваются через OR в один запрос на сабреддит — так
    меньше шансов поймать 429 от Reddit.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    leads: dict = {}
    targets = subreddits or [None]
    combined = " OR ".join(f'"{q}"' if " " in q else q for q in queries)

    for sub in targets:
        params = urllib.parse.urlencode({
            "q": combined, "sort": "new", "limit": limit,
            **({"restrict_sr": 1} if sub else {}),
        })
        url = (REDDIT_SUB_SEARCH.format(sub=sub) if sub else REDDIT_SEARCH) + "?" + params
        body = _get(url)
        time.sleep(REDDIT_PAUSE_SECONDS)
        if not body:
            continue
        for entry in ET.fromstring(body).iterfind(f"{ATOM_NS}entry"):
            link_el = entry.find(f"{ATOM_NS}link")
            link = (link_el.get("href") if link_el is not None else "") or ""
            raw_date = entry.findtext(f"{ATOM_NS}updated") or ""
            if not link or not raw_date:
                continue
            try:
                published = datetime.fromisoformat(raw_date)
            except ValueError:
                continue
            if published < cutoff or link in leads:
                continue
            author = (entry.findtext(f"{ATOM_NS}author/{ATOM_NS}name") or "").lstrip("/")
            title = (entry.findtext(f"{ATOM_NS}title") or "").strip()
            text = _strip_html(entry.findtext(f"{ATOM_NS}content") or "")
            if _matches(title, OFFER_MARKERS):
                continue
            if not _matches(f"{title} {text}", DEMAND_MARKERS):
                continue
            leads[link] = _lead(
                source=f"Reddit r/{sub}" if sub else "Reddit",
                title=title,
                author=author,
                text=text,
                link=link,
                date=published,
            )
    print(f"  Reddit → подходящих постов: {len(leads)}")
    return list(leads.values())


def fetch_hacker_news(queries: List[str], days: int = 7,
                      limit: int = 30) -> List[dict]:
    """Поиск по Hacker News (Algolia API): истории и комментарии. В комментариях
    живут ежемесячные треды «Freelancer? Seeking freelancer?» — прямой спрос."""
    cutoff_ts = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())
    leads: dict = {}

    for query in queries:
        # Ищем только по комментариям: обсуждения-статьи на HN — это техническая
        # дискуссия, а заказы живут в комментариях тредов про фриланс и найм.
        params = urllib.parse.urlencode({
            "query": query, "tags": "comment", "hitsPerPage": limit,
            "numericFilters": f"created_at_i>{cutoff_ts}",
        })
        body = _get(f"{HN_SEARCH}?{params}")
        time.sleep(PAUSE_SECONDS)
        if not body:
            continue
        try:
            hits = json.loads(body).get("hits", [])
        except json.JSONDecodeError:
            continue
        for hit in hits:
            object_id = hit.get("objectID")
            if not object_id:
                continue
            link = f"https://news.ycombinator.com/item?id={object_id}"
            if link in leads:
                continue
            text = _strip_html(hit.get("comment_text") or "")
            story = (hit.get("story_title") or "").strip()
            if not text or not _matches(text, DEMAND_MARKERS):
                continue
            # Algolia иногда тянет слабые совпадения — оставляем только явный запрос.
            if not _matches(f"{story} {text}", queries):
                continue
            leads[link] = _lead(
                source="Hacker News",
                title=f"комментарий в «{story}»" if story else "комментарий",
                author=hit.get("author") or "",
                text=text,
                link=link,
                date=datetime.fromtimestamp(hit.get("created_at_i", cutoff_ts),
                                            timezone.utc),
            )
    print(f"  Hacker News → подходящих записей: {len(leads)}")
    return list(leads.values())
