import asyncio
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List

from telethon import TelegramClient
from telethon.errors import FloodWaitError
from telethon.tl.types import MessageService
from tqdm import tqdm

from .models import RawMessage

# --- anti-ban / pacing constants (named so they're tunable in one place) ---
SESSION_NAME = "session"      # Telethon .session file (gitignored via *.session)
SLEEP_EVERY_N = 30            # pause after every N appended messages
SLEEP_SECONDS = 0.4          # length of that pause
FLOOD_EXTRA_SECONDS = 5      # added on top of FloodWait's required wait
# Below this many seconds, Telethon auto-sleeps history-fetch floods itself;
# we only need to handle floods raised by per-message get_sender() calls.
FLOOD_SLEEP_THRESHOLD = 60


def session_exists(session_name: str = SESSION_NAME) -> bool:
    """True, если файл сессии уже создан (вход выполнялся)."""
    return Path(f"{session_name}.session").exists()


async def login(api_id: int, api_hash: str, phone: str,
                session_name: str = SESSION_NAME):
    """Интерактивный вход: Telethon запросит код (придёт в Telegram). Создаёт
    .session и возвращает данные аккаунта. Запускается человеком один раз."""
    client = TelegramClient(session_name, api_id, api_hash,
                            flood_sleep_threshold=FLOOD_SLEEP_THRESHOLD)
    await client.start(phone=phone)
    me = await client.get_me()
    await client.disconnect()
    return me


LOGIN_STATE_PATH = Path("output/.login_state.json")


def save_login_state(phone: str, phone_code_hash: str) -> None:
    """Persist the pending-login handle between --request-code and --submit-code."""
    LOGIN_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOGIN_STATE_PATH.write_text(
        json.dumps({"phone": phone, "phone_code_hash": phone_code_hash}),
        encoding="utf-8",
    )


def load_login_state():
    """Return {phone, phone_code_hash} from the pending-login file, or None."""
    if not LOGIN_STATE_PATH.exists():
        return None
    return json.loads(LOGIN_STATE_PATH.read_text(encoding="utf-8"))


def clear_login_state() -> None:
    LOGIN_STATE_PATH.unlink(missing_ok=True)


async def request_code(api_id: int, api_hash: str, phone: str,
                       session_name: str = SESSION_NAME) -> str:
    """Step 1 of the agent-driven login: ask Telegram to send the login code to
    the user, persist the phone_code_hash, and return it. Returns the literal
    'already_authorized' if a session already exists (no code needed)."""
    client = TelegramClient(session_name, api_id, api_hash,
                            flood_sleep_threshold=FLOOD_SLEEP_THRESHOLD)
    await client.connect()
    try:
        if await client.is_user_authorized():
            return "already_authorized"
        sent = await client.send_code_request(phone)
        save_login_state(phone, sent.phone_code_hash)
        return sent.phone_code_hash
    finally:
        await client.disconnect()


async def submit_code(api_id: int, api_hash: str, phone: str, code: str,
                      phone_code_hash: str, session_name: str = SESSION_NAME):
    """Step 2 of the agent-driven login: complete sign-in with the code the user
    received. Lets Telethon's errors propagate (invalid/expired code, 2FA) so the
    CLI can map them to user-friendly messages."""
    client = TelegramClient(session_name, api_id, api_hash,
                            flood_sleep_threshold=FLOOD_SLEEP_THRESHOLD)
    await client.connect()
    try:
        await client.sign_in(phone, code, phone_code_hash=phone_code_hash)
        return await client.get_me()
    finally:
        await client.disconnect()


async def submit_password(api_id: int, api_hash: str, password: str,
                          session_name: str = SESSION_NAME):
    """Final step for accounts with a cloud password (2FA): the login code has
    already been verified on this session, so only the password is missing."""
    client = TelegramClient(session_name, api_id, api_hash,
                            flood_sleep_threshold=FLOOD_SLEEP_THRESHOLD)
    await client.connect()
    try:
        await client.sign_in(password=password)
        return await client.get_me()
    finally:
        await client.disconnect()


async def _get_sender_with_retry(msg):
    """Fetch a message's sender, retrying on FloodWait so the triggering message
    is NOT dropped (the previous version advanced the iterator and lost it)."""
    while True:
        try:
            return await msg.get_sender()
        except FloodWaitError as e:
            wait = e.seconds + FLOOD_EXTRA_SECONDS
            print(f"\n⚠ FloodWait: пауза {wait} сек...")
            await asyncio.sleep(wait)


def _normalize_group(group: str):
    """A numeric --group ('3978941914') or marked id ('-1003978941914') must be
    passed to get_entity as an int — Telethon can't resolve a numeric *string*.
    Usernames / t.me links pass through unchanged."""
    g = group.strip()
    if re.fullmatch(r'-?\d+', g):
        return int(g)
    return g


async def list_groups(api_id: int, api_hash: str,
                      session_name: str = SESSION_NAME) -> List[dict]:
    """Список групп и каналов пользователя из диалогов (для --list-groups).
    Требует уже созданной сессии. Возвращает [{name, id, username}]."""
    client = TelegramClient(session_name, api_id, api_hash,
                            flood_sleep_threshold=FLOOD_SLEEP_THRESHOLD)
    await client.connect()
    groups: List[dict] = []
    try:
        async for d in client.iter_dialogs():
            if d.is_user:
                continue
            ent = d.entity
            groups.append({
                "name": d.name,
                "id": ent.id,
                "username": getattr(ent, "username", None),
            })
    finally:
        await client.disconnect()
    return groups


async def search_messages(
    api_id: int,
    api_hash: str,
    queries: List[str],
    days: int = 14,
    limit_per_query: int = 200,
    session_name: str = SESSION_NAME,
) -> dict:
    """Поиск по словам силами Telegram: сервер сам находит сообщения с нужными
    фразами во всех чатах, где состоит аккаунт. Это адреснее полного сбора —
    качаются только те сообщения, где есть спрос.

    Возвращает {источник: [RawMessage]} — сгруппировано по чату, чтобы дальше
    отдать в тот же скоринг, что и обычный сбор.
    """
    client = TelegramClient(session_name, api_id, api_hash,
                            flood_sleep_threshold=FLOOD_SLEEP_THRESHOLD)
    await client.connect()

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    by_source: dict = {}
    seen: set = set()

    try:
        for query in queries:
            found = 0
            # entity=None → глобальный поиск Telegram по вашим чатам.
            async for msg in client.iter_messages(None, search=query,
                                                  limit=limit_per_query):
                msg_date = msg.date
                if msg_date.tzinfo is None:
                    msg_date = msg_date.replace(tzinfo=timezone.utc)
                if msg_date < cutoff:
                    continue
                if isinstance(msg, MessageService) or not msg.text:
                    continue
                key = (msg.chat_id, msg.id)
                if key in seen:
                    continue
                seen.add(key)

                sender = await _get_sender_with_retry(msg)
                if sender is None or not hasattr(sender, "id"):
                    continue

                chat = await msg.get_chat()
                source = getattr(chat, "username", None) or getattr(chat, "title", "") \
                    or str(msg.chat_id)

                by_source.setdefault(source, []).append(RawMessage(
                    id=msg.id,
                    user_id=sender.id,
                    username=getattr(sender, "username", None),
                    first_name=getattr(sender, "first_name", None) or "",
                    last_name=getattr(sender, "last_name", None) or "",
                    text=msg.text,
                    date=msg_date,
                    is_bot=bool(getattr(sender, "bot", False)),
                ))
                found += 1

            print(f"  «{query}» → сообщений за период: {found}")
            await asyncio.sleep(SLEEP_SECONDS)
    finally:
        await client.disconnect()

    return by_source


async def fetch_messages(
    api_id: int,
    api_hash: str,
    phone: str,
    group: str,
    limit: int = 2000,
    days: int = 14,
    session_name: str = SESSION_NAME,
) -> List[RawMessage]:
    client = TelegramClient(
        session_name, api_id, api_hash,
        flood_sleep_threshold=FLOOD_SLEEP_THRESHOLD,
    )
    await client.start(phone=phone)

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    messages: List[RawMessage] = []

    try:
        entity = await client.get_entity(_normalize_group(group))

        with tqdm(total=limit, desc="Сбор сообщений", unit="msg") as pbar:
            count = 0
            async for msg in client.iter_messages(entity, limit=limit):
                msg_date = msg.date
                if msg_date.tzinfo is None:
                    msg_date = msg_date.replace(tzinfo=timezone.utc)

                if msg_date < cutoff:
                    # Telethon returns messages newest-first; once we hit cutoff,
                    # all subsequent messages will be even older — safe to stop.
                    break

                if isinstance(msg, MessageService) or not msg.text:
                    continue

                # Retry-on-FloodWait so this message survives the pause.
                sender = await _get_sender_with_retry(msg)
                # Duck-typing check: Channel objects have 'id' but no 'bot' attr.
                if sender is None or not hasattr(sender, 'id'):
                    continue

                messages.append(RawMessage(
                    id=msg.id,
                    user_id=sender.id,
                    username=getattr(sender, 'username', None),
                    first_name=getattr(sender, 'first_name', None) or "",
                    last_name=getattr(sender, 'last_name', None) or "",
                    text=msg.text,
                    date=msg_date,
                    is_bot=bool(getattr(sender, 'bot', False)),
                ))

                count += 1
                pbar.update(1)

                if count % SLEEP_EVERY_N == 0:
                    await asyncio.sleep(SLEEP_SECONDS)

    finally:
        await client.disconnect()

    return messages
