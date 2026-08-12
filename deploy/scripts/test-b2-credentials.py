#!/usr/bin/env python3
"""Test Backblaze B2 credentials and upload a tiny test file."""

import json
import os
import sys
import tempfile
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def load_env(path: str):
    env = {}
    if not os.path.exists(path):
        return env
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key] = value.strip().strip('"').strip("'")
    return env


def main() -> int:
    repo_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_path = os.path.join(repo_dir, "deploy", "backup.env")

    if not os.path.exists(env_path):
        print(f"env file not found: {env_path}", file=sys.stderr)
        return 1

    env = load_env(env_path)
    key_id = env.get("BACKUP_B2_KEY_ID")
    app_key = env.get("BACKUP_B2_APP_KEY")
    endpoint = env.get("BACKUP_B2_ENDPOINT")
    bucket = env.get("BACKUP_B2_BUCKET")

    missing = [k for k, v in {
        "BACKUP_B2_KEY_ID": key_id,
        "BACKUP_B2_APP_KEY": app_key,
        "BACKUP_B2_ENDPOINT": endpoint,
        "BACKUP_B2_BUCKET": bucket,
    }.items() if not v]

    if missing:
        print(f"missing env vars: {', '.join(missing)}", file=sys.stderr)
        return 1

    print(f"endpoint: {endpoint}")
    print(f"bucket: {bucket}")
    print(f"key_id: {key_id[:4]}...")

    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=key_id,
            aws_secret_access_key=app_key,
            config=Config(signature_version="s3v4"),
        )
    except Exception as exc:
        print(f"failed to create client: {exc}", file=sys.stderr)
        return 1

    try:
        buckets = s3.list_buckets()
        print("buckets:", [b["Name"] for b in buckets.get("Buckets", [])])
    except ClientError as exc:
        print(f"list_buckets failed: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"list_buckets failed: {exc}", file=sys.stderr)
        return 1

    try:
        s3.head_bucket(Bucket=bucket)
        print(f"bucket '{bucket}' is reachable")
    except ClientError as exc:
        print(f"head_bucket failed: {exc}", file=sys.stderr)
        return 1

    test_key = f"test-{datetime.now(timezone.utc).isoformat()}.txt"
    try:
        with tempfile.NamedTemporaryFile(mode="w", delete=False) as f:
            f.write("B2 credentials test\n")
            test_path = f.name

        s3.upload_file(test_path, bucket, test_key)
        print(f"uploaded test file: {test_key}")

        s3.delete_object(Bucket=bucket, Key=test_key)
        print(f"deleted test file: {test_key}")
    except ClientError as exc:
        print(f"upload/delete failed: {exc}", file=sys.stderr)
        return 1
    finally:
        if os.path.exists(test_path):
            os.unlink(test_path)

    print("B2 credentials OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
