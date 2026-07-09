#!/usr/bin/env python3
"""Webhook для деплоя после merge pull request в main."""

import hashlib
import hmac
import json
import os
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

SECRET = os.environ.get("WEBHOOK_SECRET", "changeme")
PORT = 9000
DEPLOY_SCRIPT = "/root/BotsRepo/deploy.sh"


class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        event = self.headers.get("X-GitHub-Event", "")

        # Verify signature
        signature = self.headers.get("X-Hub-Signature-256", "")
        if SECRET != "changeme":
            expected = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature, expected):
                self.send_response(403)
                self.end_headers()
                self.wfile.write(b"Invalid signature")
                return

        # Parse payload
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Invalid JSON")
            return

        # Only deploy when PR is merged to default branch.
        if event == "ping":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"status":"ok","event":"ping"}')
            return

        if event != "pull_request":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(
                json.dumps({"status": "skipped", "reason": "unsupported_event", "event": event}).encode()
            )
            return

        action = payload.get("action")
        pr = payload.get("pull_request") or {}
        merged = bool(pr.get("merged"))
        base_branch = (pr.get("base") or {}).get("ref", "")
        default_branch = payload.get("repository", {}).get("default_branch", "main")

        if action != "closed" or not merged:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "status": "skipped",
                        "reason": "pr_not_merged",
                        "action": action,
                        "merged": merged,
                    }
                ).encode()
            )
            return

        if base_branch != default_branch:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "status": "skipped",
                        "reason": "base_branch_mismatch",
                        "base_branch": base_branch,
                        "default_branch": default_branch,
                    }
                ).encode()
            )
            return

        pr_number = payload.get("number")
        pr_title = pr.get("title", "")
        print(f"[webhook] PR #{pr_number} merged into {base_branch}: {pr_title}. Running deploy...")
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status": "deploying"}')

        # Run deploy in background
        subprocess.Popen(
            [DEPLOY_SCRIPT],
            stdout=open("/var/log/deploy.log", "a"),
            stderr=subprocess.STDOUT,
        )

    def log_message(self, format, *args):
        print(f"[webhook] {format % args}")


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), WebhookHandler)
    print(f"Webhook listening on 127.0.0.1:{PORT}")
    server.serve_forever()
