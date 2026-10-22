import path from 'node:path';
import { randomBytes } from 'node:crypto';
export function isolate(name) {
  for (const key of ['RENDER','TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_STORAGE_BUCKET','BREVO_API_KEY','EMAIL_FROM','EMAIL_FROM_NAME','ADMIN_USER_IDS']) delete process.env[key];
  Object.assign(process.env,{STORAGE_MODE:'local',DATA_DIR:path.resolve('.sites-runtime',name+'-'+Date.now()+'-'+randomBytes(4).toString('hex')),BETTER_AUTH_SECRET:randomBytes(48).toString('base64url'),SEED_DEMO:'false'});
}
