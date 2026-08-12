#!/usr/bin/env python3
"""Upload a file to Backblaze B2 and delete old backups."""

import argparse
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import boto3
from botocore.config import Config


def _region_from_endpoint(endpoint: str) -> str:
    match = re.search(r"s3\.([^.]+)\.backblazeb2\.com", endpoint)
    return match.group(1) if match else "us-east-001"


def get_client(endpoint: str, key_id: str, app_key: str):
    region = _region_from_endpoint(endpoint)
    return boto3.client(
        "s3",
        region_name=region,
        endpoint_url=endpoint,
        aws_access_key_id=key_id,
        aws_secret_access_key=app_key,
        config=Config(signature_version="s3v4"),
    )


def upload_file(client, bucket: str, file_path: str) -> str:
    key = os.path.basename(file_path)
    client.upload_file(file_path, bucket, key)
    print(f"uploaded: {file_path} -> s3://{bucket}/{key}")
    return key


def delete_old_files(client, bucket: str, prefix: str | None, retention_days: int):
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix or ""):
        for obj in page.get("Contents", []):
            if obj["LastModified"] < cutoff:
                client.delete_object(Bucket=bucket, Key=obj["Key"])
                print(f"deleted old backup: {obj['Key']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload file to Backblaze B2")
    parser.add_argument("--file", required=True, help="path to file to upload")
    parser.add_argument("--bucket", required=True, help="B2 bucket name")
    parser.add_argument("--key-id", required=True, help="B2 application key ID")
    parser.add_argument("--app-key", required=True, help="B2 application key secret")
    parser.add_argument(
        "--endpoint", required=True, help="B2 S3 endpoint, e.g. https://s3.eu-central-003.backblazeb2.com"
    )
    parser.add_argument(
        "--retention-days", type=int, default=0, help="delete backups older than N days"
    )
    parser.add_argument("--prefix", default=None, help="only delete objects with this prefix")
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"file not found: {args.file}", file=sys.stderr)
        return 1

    try:
        client = get_client(args.endpoint, args.key_id, args.app_key)
    except Exception as exc:
        print(f"failed to create B2 client: {exc}", file=sys.stderr)
        return 1

    upload_file(client, args.bucket, args.file)

    if args.retention_days > 0:
        delete_old_files(client, args.bucket, args.prefix, args.retention_days)

    return 0


if __name__ == "__main__":
    sys.exit(main())
