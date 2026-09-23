from __future__ import annotations

import httpx

from app.texts import ensure_disclaimer

OPENROUTER_CHAT = "/chat/completions"


class AiError(RuntimeError):
    pass


def clip_text(text: str, limit: int = 4000) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


async def complete_chat(
    client: httpx.AsyncClient,
    *,
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    user_message: str,
) -> str:
    if not api_key:
        raise AiError("OPENROUTER_API_KEY is empty")
    response = await client.post(
        f"{base_url.rstrip('/')}{OPENROUTER_CHAT}",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "temperature": 0.7,
            "max_tokens": 400,
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_message},
            ],
        },
    )
    if response.status_code >= 400:
        raise AiError(f"openrouter {response.status_code}")
    payload = response.json()
    try:
        text = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AiError("openrouter payload has no message") from exc
    if not isinstance(text, str) or not text.strip():
        raise AiError("openrouter returned an empty message")
    return clip_text(ensure_disclaimer(text.strip()))
