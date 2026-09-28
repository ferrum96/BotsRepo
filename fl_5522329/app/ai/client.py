from __future__ import annotations

import httpx

from app.texts import ensure_disclaimer

OPENROUTER_CHAT = "/chat/completions"


class AiError(RuntimeError):
    pass


def _message_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text") or ""))
        return "".join(parts)
    return ""


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
    max_tokens: int = 400,
    temperature: float = 0.7,
    with_disclaimer: bool = True,
    reasoning_effort: str | None = None,
) -> str:
    if not api_key:
        raise AiError("OPENROUTER_API_KEY is empty")
    body = {
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_message},
        ],
    }
    if reasoning_effort:
        body["reasoning_effort"] = reasoning_effort
    response = await client.post(
        f"{base_url.rstrip('/')}{OPENROUTER_CHAT}",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
    )
    if response.status_code >= 400:
        raise AiError(f"openrouter {response.status_code}")
    payload = response.json()
    try:
        choice = payload["choices"][0]
        text = _message_text(choice["message"].get("content"))
    except (KeyError, IndexError, TypeError) as exc:
        raise AiError("openrouter payload has no message") from exc
    if choice.get("finish_reason") == "length":
        raise AiError("openrouter truncated the message")
    if not isinstance(text, str) or not text.strip():
        raise AiError("openrouter returned an empty message")
    cleaned = clip_text(text.strip())
    if with_disclaimer:
        cleaned = ensure_disclaimer(cleaned)
    return cleaned
