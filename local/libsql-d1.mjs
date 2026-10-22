const parameters = values => values.map(value => typeof value === 'boolean' ? Number(value) : value ?? null);
const rowObject = (columns, row) => Object.fromEntries(columns.map((column, index) => [column, row[index]]));
const resultShape = result => ({
  success: true,
  results: result.rows.map(row => rowObject(result.columns, row)),
  meta: { changes: result.rowsAffected, last_row_id: result.lastInsertRowid === undefined ? undefined : Number(result.lastInsertRowid) },
});

// Retains the D1 interface consumed by Drizzle and the app's SQL handlers.
// Crucially, batch is ONE write transaction; Promise.all(execute) is not atomic.
export function createLibsqlD1(client) {
  class Prepared {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Prepared(this.query, parameters(args)); }
    async result() { return client.execute({ sql: this.query, args: this.args }); }
    async run() { return resultShape(await this.result()); }
    async all() { return this.run(); }
    async first(column) {
      const result = await this.result();
      const row = result.rows[0] ? rowObject(result.columns, result.rows[0]) : null;
      return column === undefined ? row : row?.[column] ?? null;
    }
    async raw(options) {
      const result = await this.result();
      const rows = result.rows.map(row => result.columns.map((_, index) => row[index]));
      return options?.columnNames ? [result.columns, ...rows] : rows;
    }
  }
  return {
    prepare(query) { return new Prepared(query); },
    async batch(statements) {
      if (!statements.every(statement => statement instanceof Prepared)) throw new Error('A batch must use statements from the same database.');
      if (!statements.length) return [];
      const results = await client.batch(statements.map(statement => ({ sql: statement.query, args: statement.args })), 'write');
      return results.map(resultShape);
    },
  };
}

export async function migrateLibsql(client, migrations) {
  await client.execute('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
  for (const migration of migrations) {
    const transaction = await client.transaction('write');
    try {
      const applied = await transaction.execute({ sql: 'SELECT name FROM local_migrations WHERE name=?', args: [migration.name] });
      if (!applied.rows.length) {
        for (const sql of migration.sql.split('--> statement-breakpoint').map(part => part.trim()).filter(Boolean)) await transaction.execute(sql);
        await transaction.execute({ sql: 'INSERT INTO local_migrations(name) VALUES(?)', args: [migration.name] });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => {});
      throw error;
    } finally { transaction.close(); }
  }
}
