#!/usr/bin/env python3
"""Webhook для деплоя после merge PR или прямого push в default branch."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import subprocess
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

REPO_DIR = os.path.dirname(os.path.abspath(__file__))
SECRET = os.environ.get("WEBHOOK_SECRET", "changeme")
PORT = int(os.environ.get("PORT_DEPLOY_WEBHOOK", "9000"))
DEPLOY_SCRIPT = os.path.join(REPO_DIR, "deploy.sh")
DEPLOY_LOG = "/var/log/deploy.log"
DEPLOY_LOCK = "/var/run/botsrepo-deploy.lock"
DEPLOY_COOLDOWN_SEC = int(os.environ.get("DEPLOY_COOLDOWN_SEC", "120"))


def _default_branch(payload: dict) -> str:
    return payload.get("repository", {}).get("default_branch", "main")


def _should_deploy_push(payload: dict) -> tuple[bool, str | None, dict]:
    if payload.get("deleted"):
        return False, "push_deleted", {"ref": payload.get("ref", "")}

    ref = payload.get("ref", "")
    branch = _default_branch(payload)
    expected_ref = f"refs/heads/{branch}"
    if ref != expected_ref:
        return False, "push_ref_mismatch", {"ref": ref, "expected_ref": expected_ref}

    head_commit = payload.get("head_commit") or {}
    return True, None, {
        "branch": branch,
        "trigger": "push",
        "pusher": (payload.get("pusher") or {}).get("login"),
        "commit": (head_commit.get("id") or "")[:8],
        "message": (head_commit.get("message") or "").splitlines()[0][:120],
    }


def _should_deploy_pull_request(payload: dict) -> tuple[bool, str | None, dict]:
    action = payload.get("action")
    pr = payload.get("pull_request") or {}
    merged = bool(pr.get("merged"))
    base_branch = (pr.get("base") or {}).get("ref", "")
    default_branch = _default_branch(payload)

    if action != "closed" or not merged:
        return (
            False,
            "pr_not_merged",
            {"action": action, "merged": merged},
        )

    if base_branch != default_branch:
        return (
            False,
            "base_branch_mismatch",
            {"base_branch": base_branch, "default_branch": default_branch},
        )

    return (
        True,
        None,
        {
            "trigger": "pull_request",
            "pr_number": payload.get("number") or pr.get("number"),
            "pr_title": pr.get("title", ""),
            "branch": base_branch,
        },
    )


def _recent_deploy_running() -> bool:
    try:
        with open(DEPLOY_LOCK, encoding="utf-8") as lock_file:
            last_started = float(lock_file.read().strip())
    except (OSError, ValueError):
        return False
    return (time.time() - last_started) < DEPLOY_COOLDOWN_SEC


def _mark_deploy_started() -> None:
    os.makedirs(os.path.dirname(DEPLOY_LOCK), exist_ok=True)
    with open(DEPLOY_LOCK, "w", encoding="utf-8") as lock_file:
        lock_file.write(str(time.time()))


def _run_deploy(reason: str, details: dict) -> None:
    if _recent_deploy_running():
        print(
            f"[webhook] Skip duplicate deploy ({reason}) — "
            f"cooldown {DEPLOY_COOLDOWN_SEC}s active"
        )
        return

    print(f"[webhook] Deploy triggered ({reason}): {details}")
    _mark_deploy_started()
    os.makedirs(os.path.dirname(DEPLOY_LOG), exist_ok=True)
    log_file = open(DEPLOY_LOG, "a", encoding="utf-8")
    subprocess.Popen(
        [DEPLOY_SCRIPT],
        stdout=log_file,
        stderr=subprocess.STDOUT,
        cwd=REPO_DIR,
        start_new_session=True,
    )


class WebhookHandler(BaseHTTPRequestHandler):
    def _write_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        event = self.headers.get("X-GitHub-Event", "")

        signature = self.headers.get("X-Hub-Signature-256", "")
        if SECRET != "changeme":
            expected = "sha256=" + hmac.new(
                SECRET.encode(), body, hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(signature, expected):
                self.send_response(403)
                self.end_headers()
                self.wfile.write(b"Invalid signature")
                return

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Invalid JSON")
            return

        if event == "ping":
            self._write_json(200, {"status": "ok", "event": "ping"})
            return

        should_deploy = False
        skip_reason = "unsupported_event"
        skip_details: dict = {"event": event}
        deploy_details: dict = {}

        if event == "push":
            should_deploy, skip_reason, deploy_details = _should_deploy_push(payload)
        elif event == "pull_request":
            should_deploy, skip_reason, deploy_details = _should_deploy_pull_request(
                payload
            )
        else:
            self._write_json(
                200,
                {"status": "skipped", "reason": skip_reason, **skip_details},
            )
            return

        if not should_deploy:
            self._write_json(
                200,
                {"status": "skipped", "reason": skip_reason, **deploy_details},
            )
            return

        self._write_json(200, {"status": "deploying", **deploy_details})
        _run_deploy(event, deploy_details)

    def log_message(self, format: str, *args) -> None:
        print(f"[webhook] {format % args}")


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), WebhookHandler)
    print(f"Webhook listening on 127.0.0.1:{PORT}")
    print(f"Deploy script: {DEPLOY_SCRIPT}")
    server.serve_forever()
