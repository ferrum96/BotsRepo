import asyncio
from typing import List, Optional

from telethon import TelegramClient
from telethon.errors import ChannelPrivateError, FloodWaitError
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.tl.functions.contacts import SearchRequest
from telethon.tl.types import Channel

from .telegram_fetcher import (FLOOD_EXTRA_SECONDS, FLOOD_SLEEP_THRESHOLD,
                               SESSION_NAME)

SEARCH_LIMIT = 50            # сколько результатов просить у Telegram на одно слово
SEARCH_PAUSE_SECONDS = 1.0   # пауза между запросами (анти-бан)


async def _with_flood_retry(call):
    """Выполнить запрос, пережидая FloodWait вместо падения."""
    while True:
        try:
            return await call()
        except FloodWaitError as e:
            wait = e.seconds + FLOOD_EXTRA_SECONDS
            print(f"\n⚠ FloodWait: пауза {wait} сек...")
            await asyncio.sleep(wait)


def _username_of(chat: Channel) -> str:
    if getattr(chat, "username", None):
        return chat.username
    # Каналы с «коллекционными» именами держат их в usernames, а не в username.
    for u in getattr(chat, "usernames", None) or []:
        if getattr(u, "active", False):
            return u.username
    return ""


def _is_lead_group(chat) -> bool:
    """Нужны публичные группы-обсуждения: в каналах-вещалках диалога нет,
    а помеченные Telegram как scam/fake/restricted нам не нужны совсем."""
    if not isinstance(chat, Channel) or not chat.megagroup or chat.broadcast:
        return False
    if any(getattr(chat, flag, False) for flag in ("scam", "fake", "restricted")):
        return False
    return bool(_username_of(chat))


async def search_public_groups(
    api_id: int,
    api_hash: str,
    queries: List[str],
    min_participants: int = 300,
    max_details: int = 60,
    session_name: str = SESSION_NAME,
) -> List[dict]:
    """Глобальный поиск Telegram по ключевым словам → публичные группы, где можно
    искать лидов. Возвращает [{title, username, id, participants, about, joined,
    queries}], отсортированные по числу участников (по убыванию).

    Telegram не отдаёт число участников в результатах поиска, поэтому по каждому
    чату приходится делать отдельный запрос — их количество ограничено max_details,
    а между запросами выдерживается пауза.
    """
    client = TelegramClient(session_name, api_id, api_hash,
                            flood_sleep_threshold=FLOOD_SLEEP_THRESHOLD)
    await client.connect()
    found: dict = {}
    try:
        for query in queries:
            res = await _with_flood_retry(
                lambda q=query: client(SearchRequest(q=q, limit=SEARCH_LIMIT))
            )
            for chat in res.chats:
                if not _is_lead_group(chat):
                    continue
                entry = found.setdefault(chat.id, {
                    "title": chat.title,
                    "username": _username_of(chat),
                    "id": chat.id,
                    "participants": None,
                    "about": "",
                    # left=False → аккаунт уже состоит в этой группе.
                    "joined": getattr(chat, "left", True) is False,
                    "queries": [],
                    "_entity": chat,
                })
                if query not in entry["queries"]:
                    entry["queries"].append(query)
            print(f"  «{query}» → найдено групп всего: {len(found)}")
            await asyncio.sleep(SEARCH_PAUSE_SECONDS)

        for entry in list(found.values())[:max_details]:
            try:
                full = await _with_flood_retry(
                    lambda e=entry: client(GetFullChannelRequest(e["_entity"]))
                )
            except (ChannelPrivateError, ValueError):
                continue
            entry["participants"] = full.full_chat.participants_count
            entry["about"] = (full.full_chat.about or "").replace("\n", " ")[:200]
            await asyncio.sleep(SEARCH_PAUSE_SECONDS)
    finally:
        await client.disconnect()

    groups = []
    for entry in found.values():
        entry.pop("_entity", None)
        count: Optional[int] = entry["participants"]
        if count is None or count < min_participants:
            continue
        groups.append(entry)

    groups.sort(key=lambda g: g["participants"], reverse=True)
    return groups
