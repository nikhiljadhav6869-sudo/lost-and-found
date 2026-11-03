import {appendFileSync} from 'node:fs';
import {createClient} from '@libsql/client/web';

const now = Date.now();
const day = 24*60*60*1000;
const query = "SELECT COUNT(*) AS n FROM (SELECT 1 FROM operations WHERE kind='email' AND status='failed' AND created>=? AND created<=? LIMIT 3)";
const args = [now-day, now];
let repeated;
if (process.argv.includes('--drill')) {
  const {DatabaseSync} = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE operations(kind TEXT, status TEXT, created INTEGER)');
  const insert = db.prepare('INSERT INTO operations VALUES(?,?,?)');
  for (const [kind,status,time] of [['email','failed',now-day-1],['backup','failed',now],['email','retry',now],['email','accepted',now],['email','failed',now],['email','failed',now]]) insert.run(kind,status,time);
  if(db.prepare(query).get(...args).n !== 2) throw Error('Drill did not exclude old or unrelated events.');
  insert.run('email','failed',now);
  repeated = db.prepare(query).get(...args).n === 3;
  db.close();
  if (!repeated) throw Error('Drill did not detect the third terminal failure.');
} else {
  const client = createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
  try {
    const result = await client.execute({sql:query,args});
    repeated = Number(result.rows[0].n) >= 3;
  } catch {
    throw new Error('Unable to read email delivery health.');
  } finally { client.close(); }
}
appendFileSync(process.env.GITHUB_OUTPUT,'repeated='+repeated+'\n');
