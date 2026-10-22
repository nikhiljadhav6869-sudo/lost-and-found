import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { storageConfiguration } from './storage-config.mjs';
import { createLibsqlD1, migrateLibsql } from './libsql-d1.mjs';
import { createSupabaseBucket, checkedStorageKey, imageMime } from './supabase-bucket.mjs';

export const dataDirectory = path.resolve(process.env.DATA_DIR || 'data');
export const storageConfig = storageConfiguration();
export const storageMode = storageConfig.mode;
export let DB, BUCKET;
const migrations = fs.readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()
  .map(name => ({ name, sql: fs.readFileSync(path.join('drizzle', name), 'utf8') }));

if (storageMode === 'remote') {
  const { createClient } = await import('@libsql/client/web');
  const client = createClient({ url: storageConfig.databaseUrl, authToken: storageConfig.authToken, intMode: 'number' });
  DB = createLibsqlD1(client);
  BUCKET = createSupabaseBucket(storageConfig);
  await BUCKET.verifyPrivate();
  await migrateLibsql(client, migrations);
} else {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const sql = new DatabaseSync(path.join(dataDirectory, 'lost-found.sqlite'));
  sql.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  sql.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
  for (const migration of migrations) {
    if (!sql.prepare('SELECT name FROM local_migrations WHERE name=?').get(migration.name)) {
      sql.exec('BEGIN IMMEDIATE');
      try { sql.exec(migration.sql); sql.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(migration.name); sql.exec('COMMIT'); }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    }
  }
  if (process.env.SEED_DEMO !== 'false') sql.exec(fs.readFileSync('seed/demo.sql', 'utf8'));
  class Prepared {
    constructor(query, params = []) { this.query = query; this.params = params; }
    bind(...params) { return new Prepared(this.query, params.map(value => typeof value === 'boolean' ? Number(value) : value ?? null)); }
    execute() {
      const statement = sql.prepare(this.query);
      if (statement.columns().length) return { success: true, results: statement.all(...this.params), meta: { changes: 0 } };
      const result = statement.run(...this.params);
      return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    }
    async run() { return this.execute(); }
    async all() { return this.execute(); }
    async first(column) { const row = sql.prepare(this.query).get(...this.params) || null; return column === undefined ? row : row?.[column] ?? null; }
    async raw(options) { const statement = sql.prepare(this.query); const columns = statement.columns().map(column => column.name); statement.setReturnArrays(true); const rows = statement.all(...this.params); return options?.columnNames ? [columns, ...rows] : rows; }
  }
  DB = {
    prepare: query => new Prepared(query),
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try { const results = statements.map(statement => statement.execute()); sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const uploads = path.join(dataDirectory, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });
  const fileFor = key => path.join(uploads, checkedStorageKey(key));
  BUCKET = {
    async put(key, body) { fs.writeFileSync(fileFor(key), new Uint8Array(body)); },
    async get(key) { const file = fileFor(key); if (!fs.existsSync(file)) return null; return { body: fs.readFileSync(file), httpMetadata: { contentType: imageMime(key) } }; },
    async delete(key) { fs.rmSync(fileFor(key), { force: true }); },
  };
}

export const env = {
  DB, BUCKET,
  get STORAGE_MODE() { return storageMode; },
  get SEED_DEMO() { return storageMode === 'remote' ? 'false' : process.env.SEED_DEMO; },
  get BETTER_AUTH_SECRET() { return process.env.BETTER_AUTH_SECRET; },
  get ADMIN_USER_IDS() { return process.env.ADMIN_USER_IDS || ''; },
  get BREVO_API_KEY() { return process.env.BREVO_API_KEY; },
  get EMAIL_FROM() { return process.env.EMAIL_FROM; },
  get EMAIL_FROM_NAME() { return process.env.EMAIL_FROM_NAME; },
};
