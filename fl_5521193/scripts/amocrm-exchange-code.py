#!/usr/bin/env python3
"""One-shot: authorization_code → tokens. Reads .env, writes data/amocrm-tokens.json."""

from __future__ import annotations

import json
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def main() -> int:
    env = load_env(ROOT / ".env")
    code = env.get("AMOCRM_AUTHORIZATION_CODE", "")
    base = env.get("AMOCRM_BASE_URL", "").rstrip("/")
    if not code:
        print("нет AMOCRM_AUTHORIZATION_CODE в .env", file=sys.stderr)
        return 1
    if not base.startswith("https://"):
        print("некорректный AMOCRM_BASE_URL", file=sys.stderr)
        return 1

    payload = {
        "client_id": env["AMOCRM_CLIENT_ID"],
        "client_secret": env["AMOCRM_CLIENT_SECRET"],
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": env["AMOCRM_REDIRECT_URI"],
    }
    request = urllib.request.Request(
        f"{base}/oauth2/access_token",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    ctx = ssl.create_default_context()
    try:
        import certifi

        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass
    try:
        with urllib.request.urlopen(request, timeout=30, context=ctx) as response:
            body = json.loads(response.read().decode())
            status = response.status
    except urllib.error.HTTPError as error:
        print(f"HTTP {error.code}", file=sys.stderr)
        print(error.read().decode()[:800], file=sys.stderr)
        return 3

    out = ROOT / "data" / "amocrm-tokens.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {
                "token_type": body.get("token_type"),
                "expires_in": body.get("expires_in"),
                "server_time": body.get("server_time"),
                "access_token": body.get("access_token"),
                "refresh_token": body.get("refresh_token"),
            },
            indent=2,
        )
        + "\n"
    )
    print(f"OK HTTP {status} expires_in={body.get('expires_in')} file={out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
