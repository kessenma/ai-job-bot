/**
 * job-app-bot devtools — local SQLite browser
 *
 * Opens the job-app-bot.db file read-only and serves a web UI at
 * http://localhost:4000.
 *
 * Usage:
 *   cd devtools && npm install && npm start
 *
 * You can keep this server running while the web app is open —
 * reads are non-blocking and the DB is opened in read-only mode.
 */

import http from 'http';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import Database from 'better-sqlite3';

const PORT = 4000;
const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Database discovery
// ---------------------------------------------------------------------------

function findDb() {
  // Check DATA_DIR env first, then default locations
  const candidates = [
    process.env.DATA_DIR && resolve(process.env.DATA_DIR, 'job-app-bot.db'),
    resolve(__dirname, '..', 'data', 'job-app-bot.db'),
    resolve(__dirname, '..', 'apps', 'web', 'data', 'job-app-bot.db'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Database queries
// ---------------------------------------------------------------------------

let _db = null;
let _dbPath = null;

function getDb() {
  const path = findDb();
  if (!path) return null;

  // Re-open if path changed
  if (!_db || path !== _dbPath) {
    if (_db) { try { _db.close(); } catch {} }
    _db = new Database(path, { readonly: true, fileMustExist: true });
    _dbPath = path;
    console.log(`[db] Opened: ${path}`);
  }

  return _db;
}

function listTables(db) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`
    )
    .all()
    .map((r) => r.name);
}

function tableInfo(db, table) {
  const count = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
  const columns = db
    .prepare(`PRAGMA table_info("${table}")`)
    .all()
    .map((c) => c.name);
  return { count, columns };
}

function tableRows(db, table, limit = 200, offset = 0) {
  return db
    .prepare(`SELECT * FROM "${table}" ORDER BY rowid DESC LIMIT ? OFFSET ?`)
    .all(limit, offset);
}

function runQuery(db, sql) {
  // Only allow SELECT for safety
  const trimmed = sql.trim().toLowerCase();
  if (!trimmed.startsWith('select') && !trimmed.startsWith('pragma')) {
    throw new Error('Only SELECT and PRAGMA statements are allowed.');
  }
  return db.prepare(sql).all();
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function error(res, message, status = 500) {
  json(res, { error: message }, status);
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');

  // -- API routes --

  if (path === '/api/status') {
    const dbPath = findDb();
    return json(res, { found: !!dbPath, path: dbPath ?? null });
  }

  if (path === '/api/tables') {
    const db = getDb();
    if (!db) return error(res, 'Database not found. Run the web app first to create the DB.', 404);
    try {
      const tables = listTables(db);
      const result = tables.map((name) => {
        try {
          return { name, ...tableInfo(db, name) };
        } catch {
          return { name, count: -1, columns: [] };
        }
      });
      return json(res, result);
    } catch (e) {
      return error(res, e.message);
    }
  }

  const tableMatch = path.match(/^\/api\/table\/(.+)$/);
  if (tableMatch) {
    const table = decodeURIComponent(tableMatch[1]);
    const limit = Math.min(500, parseInt(url.searchParams.get('limit') ?? '100', 10));
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const db = getDb();
    if (!db) return error(res, 'Database not found.', 404);
    try {
      const rows = tableRows(db, table, limit, offset);
      const { count } = tableInfo(db, table);
      return json(res, { rows, total: count, limit, offset });
    } catch (e) {
      return error(res, e.message);
    }
  }

  if (path === '/api/query' && req.method === 'POST') {
    const db = getDb();
    if (!db) return error(res, 'Database not found.', 404);
    const body = await new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => resolve(data));
    });
    try {
      const { sql } = JSON.parse(body);
      const rows = runQuery(db, sql);
      return json(res, { rows });
    } catch (e) {
      return error(res, e.message, 400);
    }
  }

  // -- UI --

  if (path === '/' || path === '/index.html') {
    const html = await readFile(join(__dirname, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
  }

  res.writeHead(404);
  res.end('Not found');
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((e) => {
    console.error(e);
    res.writeHead(500);
    res.end('Internal server error');
  });
});

server.listen(PORT, () => {
  console.log(`\n  job-app-bot devtools — SQLite browser`);
  console.log(`  http://localhost:${PORT}\n`);

  const dbPath = findDb();
  if (dbPath) {
    console.log(`  DB found: ${dbPath}`);
  } else {
    console.log(`  DB not found yet — run the web app first, then refresh the browser.`);
  }
});
