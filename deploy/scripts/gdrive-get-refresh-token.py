#!/usr/bin/env python3
"""Get a Google Drive OAuth refresh token and save it for unattended uploads.

Run this on a machine with a browser (e.g. your laptop). After auth, copy the
output credentials file to the VPS.

1. In Google Cloud Console create OAuth 2.0 credentials with type "Desktop app".
2. Download client_secret.json.
3. Run:
   python3 deploy/scripts/gdrive-get-refresh-token.py \
     --client-secrets client_secret.json \
     --output deploy/secrets/gdrive-oauth.json
4. Copy deploy/secrets/gdrive-oauth.json to the VPS.
"""

import argparse
import json
import os
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-secrets", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    if not os.path.exists(args.client_secrets):
        print(f"client secrets not found: {args.client_secrets}", file=sys.stderr)
        return 1

    flow = InstalledAppFlow.from_client_secrets_file(args.client_secrets, SCOPES)
    creds = flow.run_local_server(port=0)

    info = {
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "scopes": creds.scopes,
    }

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(info, f, indent=2)

    print(f"saved credentials to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
