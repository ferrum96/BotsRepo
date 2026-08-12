#!/usr/bin/env python3
"""Upload a file to Google Drive using a service account or OAuth refresh token."""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

from google.auth.transport.requests import Request
from google.oauth2 import credentials as oauth_credentials, service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def load_credentials(credentials_path: str):
    with open(credentials_path, "r") as f:
        info = json.load(f)

    if info.get("type") == "service_account":
        return service_account.Credentials.from_service_account_file(
            credentials_path, scopes=SCOPES
        )

    if "refresh_token" not in info:
        raise ValueError(
            "credentials file must contain either 'type': 'service_account' "
            "or an OAuth 'refresh_token'"
        )

    creds = oauth_credentials.Credentials(
        token=None,
        refresh_token=info["refresh_token"],
        token_uri=info.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=info["client_id"],
        client_secret=info["client_secret"],
        scopes=SCOPES,
    )
    creds.refresh(Request())
    return creds


def get_drive_service(credentials_path: str):
    credentials = load_credentials(credentials_path)
    return build("drive", "v3", credentials=credentials, static_discovery=False)


def upload_file(service, file_path: str, folder_id: str) -> str:
    file_name = os.path.basename(file_path)
    body = {"name": file_name, "parents": [folder_id]}
    media = MediaFileUpload(file_path, resumable=True)
    file = (
        service.files()
        .create(
            body=body,
            media_body=media,
            supportsAllDrives=True,
            fields="id,name,createdTime",
        )
        .execute()
    )
    return file["id"]


def delete_old_files(service, folder_id: str, retention_days: int, prefix: str | None):
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    query = f"'{folder_id}' in parents and trashed=false"
    if prefix:
        # Google Drive query uses 'contains' for substring matching.
        query += f" and name contains '{prefix}'"

    page_token = None
    while True:
        response = (
            service.files()
            .list(
                q=query,
                spaces="drive",
                fields="nextPageToken, files(id, name, createdTime)",
                pageToken=page_token,
                pageSize=100,
            )
            .execute()
        )
        for f in response.get("files", []):
            created_time = f["createdTime"].replace("Z", "+00:00")
            created = datetime.fromisoformat(created_time)
            if created < cutoff:
                service.files().delete(fileId=f["id"], supportsAllDrives=True).execute()
                print(f"deleted old backup: {f['name']} ({f['id']})")
        page_token = response.get("nextPageToken")
        if not page_token:
            break


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload file to Google Drive folder")
    parser.add_argument("--file", required=True, help="path to file to upload")
    parser.add_argument("--folder-id", required=True, help="Google Drive folder ID")
    parser.add_argument(
        "--credentials", required=True, help="path to service account JSON or OAuth credentials JSON"
    )
    parser.add_argument(
        "--retention-days", type=int, default=0, help="delete backups older than N days"
    )
    parser.add_argument(
        "--prefix", default=None, help="only delete files whose name contains this prefix"
    )
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"file not found: {args.file}", file=sys.stderr)
        return 1
    if not os.path.exists(args.credentials):
        print(f"credentials not found: {args.credentials}", file=sys.stderr)
        return 1

    try:
        service = get_drive_service(args.credentials)
    except Exception as exc:
        print(f"failed to load credentials: {exc}", file=sys.stderr)
        return 1

    file_id = upload_file(service, args.file, args.folder_id)
    print(f"uploaded: {args.file} -> {file_id}")

    if args.retention_days > 0:
        delete_old_files(service, args.folder_id, args.retention_days, args.prefix)

    return 0


if __name__ == "__main__":
    sys.exit(main())
