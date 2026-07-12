#!/bin/sh

DB_PATH="${DB_PATH:-/app/data/kanban.db}"

# Create tables if they don't exist (ignore errors for existing tables)
node -e "
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
try {
  const db = new Database('${DB_PATH}');
  const migrations = [
    'drizzle/0000_smooth_george_stacy.sql',
    'drizzle/0001_users.sql',
  ];
  for (const file of migrations) {
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try { db.exec(stmt); } catch(e) { /* table already exists */ }
    }
  }
  db.close();
  console.log('Database tables ensured.');
} catch(e) { console.log('DB init skipped:', e.message); }
"

exec node dist/server/index.js
