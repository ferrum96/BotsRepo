#!/usr/bin/env python3
"""Restore SQLite DB from a Backblaze B2 backup.

Examples:
  python3 deploy/scripts/restore-from-b2.py kanban           # latest backup
  python3 deploy/scripts/restore-from-b2.py kanban --date 2026-08-12
  python3 deploy/scripts/restore-from-b2.py kanban --force    # no confirmation
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone

import boto3
from botocore.config import Config


def load_env(path: str) -> dict:
    env = {}
    if not os.path.exists(path):
        return env
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def get_var(env: dict, job: str, suffix: str) -> str | None:
    """Read job-specific variable, fall back to generic BACKUP_* default."""
    job_prefix = f"{job.upper()}_BACKUP_"
    return env.get(f"{job_prefix}{suffix}") or env.get(f"BACKUP_{suffix}")


def get_b2_client(env: dict):
    return boto3.client(
        "s3",
        endpoint_url=env["BACKUP_B2_ENDPOINT"],
        aws_access_key_id=env["BACKUP_B2_KEY_ID"],
        aws_secret_access_key=env["BACKUP_B2_APP_KEY"],
        config=Config(signature_version="s3v4"),
    )


def find_backups(client, bucket: str, prefix: str):
    backups = []
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith(".tar.gz"):
                backups.append((obj["LastModified"], key))
    backups.sort(reverse=True)
    return [key for _, key in backups]


def service_name(job: str) -> str:
    return job.replace("_", "-")


def stop_service(service: str):
    subprocess.run(["systemctl", "stop", service], check=True)


def start_service(service: str):
    subprocess.run(["systemctl", "start", service], check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore SQLite DB from Backblaze B2")
    parser.add_argument("job", choices=["kanban", "bb_clan"], help="backup job name")
    parser.add_argument("--date", help="restore backup from date YYYY-MM-DD (default: latest)")
    parser.add_argument("--force", action="store_true", help="do not ask for confirmation")
    args = parser.parse_args()

    repo_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_path = os.path.join(repo_dir, "deploy", "backup.env")
    env = load_env(env_path)

    required = ["BACKUP_B2_ENDPOINT", "BACKUP_B2_KEY_ID", "BACKUP_B2_APP_KEY", "BACKUP_B2_BUCKET"]
    missing = [k for k in required if not env.get(k)]
    if missing:
        print(f"missing env vars: {', '.join(missing)}", file=sys.stderr)
        return 1

    db_path = get_var(env, args.job, "DB_PATH")
    if not db_path:
        print(f"missing {args.job.upper()}_BACKUP_DB_PATH", file=sys.stderr)
        return 1

    service = service_name(args.job)
    prefix = f"{args.job}-db-"
    client = get_b2_client(env)
    backups = find_backups(client, env["BACKUP_B2_BUCKET"], prefix)

    if not backups:
        print(f"no backups found for {args.job}", file=sys.stderr)
        return 1

    if args.date:
        pattern = re.compile(re.escape(args.date))
        selected = [key for key in backups if pattern.search(key)]
        if not selected:
            print(f"no backup found for date {args.date}", file=sys.stderr)
            print(f"available: {backups[:5]}", file=sys.stderr)
            return 1
        key = selected[0]
    else:
        key = backups[0]

    print(f"restoring {args.job} from {key}")
    print(f"target DB: {db_path}")

    if not args.force:
        answer = input("continue? [y/N] ")
        if answer.lower() != "y":
            print("aborted")
            return 0

    with tempfile.TemporaryDirectory() as tmpdir:
        archive_path = os.path.join(tmpdir, "backup.tar.gz")
        client.download_file(env["BACKUP_B2_BUCKET"], key, archive_path)

        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(path=tmpdir)

        dump_files = [f for f in os.listdir(tmpdir) if f.endswith(".sqlite")]
        if not dump_files:
            print("no .sqlite dump found inside archive", file=sys.stderr)
            return 1
        dump_path = os.path.join(tmpdir, dump_files[0])

        print(f"stopping {service}...")
        stop_service(service)

        try:
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            backup_path = f"{db_path}.before-restore-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
            if os.path.exists(db_path):
                shutil.move(db_path, backup_path)
                print(f"old DB saved as {backup_path}")
            shutil.move(dump_path, db_path)
            os.chmod(db_path, 0o644)
            print(f"restored {db_path}")
        finally:
            print(f"starting {service}...")
            start_service(service)

    return 0


if __name__ == "__main__":
    sys.exit(main())
