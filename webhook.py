#!/usr/bin/env python3
"""Простой webhook для деплоя при git push."""

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

        # Only deploy on push to main
        ref = payload.get("ref", "")
        if ref != "refs/heads/main":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({"status": "skipped", "ref": ref}).encode())
            return

        branch = payload.get("repository", {}).get("default_branch", "main")
        push_branch = ref.replace("refs/heads/", "")
        if push_branch != branch:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({"status": "skipped", "branch": push_branch}).encode())
            return

        print(f"[webhook] Push to {branch}, running deploy...")
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
        print(f"[webhook] {args[0]}")


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), WebhookHandler)
    print(f"Webhook listening on 127.0.0.1:{PORT}")
    server.serve_forever()
