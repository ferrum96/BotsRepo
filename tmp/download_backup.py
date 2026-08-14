#!/usr/bin/env python3
import os, sys, tarfile, boto3
from botocore.config import Config
from botocore.exceptions import ClientError

REPO = "/Users/konstantin/Desktop/BotsRepo"
ENV_PATH = os.path.join(REPO, "deploy", "backup.env")
OUT_DIR = os.path.join(REPO, "tmp", "backup")


def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def main() -> int:
    env = load_env(ENV_PATH)

    required = ["BACKUP_B2_ENDPOINT", "BACKUP_B2_KEY_ID", "BACKUP_B2_APP_KEY", "BACKUP_B2_BUCKET"]
    missing = [k for k in required if not env.get(k)]
    if missing:
        print(f"missing env vars: {', '.join(missing)}", file=sys.stderr)
        return 1

    s3 = boto3.client(
        "s3",
        endpoint_url=env["BACKUP_B2_ENDPOINT"],
        aws_access_key_id=env["BACKUP_B2_KEY_ID"],
        aws_secret_access_key=env["BACKUP_B2_APP_KEY"],
        config=Config(signature_version="s3v4"),
    )
    bucket = env["BACKUP_B2_BUCKET"]

    try:
        s3.head_bucket(Bucket=bucket)
    except ClientError as exc:
        print(f"bucket check failed: {exc}", file=sys.stderr)
        return 1

    jobs = [j.strip() for j in env.get("BACKUP_JOBS", "kanban").split(",") if j.strip()]

    for job in jobs:
        prefix = f"{job}-db-"
        paginator = s3.get_paginator("list_objects_v2")
        backups = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.endswith(".tar.gz"):
                    backups.append((obj["LastModified"], key))

        if not backups:
            print(f"no backups found for {job}")
            continue

        backups.sort(reverse=True)
        print(f"\n{job} backups (latest first):")
        for _, key in backups[:5]:
            print(f"  {key}")

        key = backups[0][1]
        job_dir = os.path.join(OUT_DIR, job)
        os.makedirs(job_dir, exist_ok=True)
        archive_path = os.path.join(job_dir, os.path.basename(key))

        print(f"downloading latest {job} backup to {archive_path}")
        s3.download_file(bucket, key, archive_path)

        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(job_dir)

        sqlite_files = [f for f in os.listdir(job_dir) if f.endswith(".sqlite")]
        print(f"extracted: {sqlite_files}")

    print(f"\nall backups downloaded to {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
