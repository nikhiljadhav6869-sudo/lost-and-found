import { z } from 'zod';
import { cosine, vector, MODEL_VERSION } from './intelligence';
import { match, similarityLabel, type Matchable } from './matching';
type Row = Record<string, any>;
const reject = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
export async function intelligenceAvailable(db: D1Database) {
    return !!await db.prepare("SELECT 1 FROM operations WHERE kind='worker' AND status='ok' AND created>? LIMIT 1").bind(Date.now()-15*60000).first();
}
export async function featureRoute(db: D1Database, path: string[], method: string, b: Row, user: Row, url: URL, publicReport: (r: Row) => Row) {
    const one = (sql: string, ...args: any[]) => db.prepare(sql).bind(...args).first<Row>();
    const all = async (sql: string, ...args: any[]) => (await db.prepare(sql).bind(...args).all<Row>()).results;
    if (path[0] === 'preferences') {
        if (method === 'GET') return { matches: (await one('SELECT matches FROM preferences WHERE userId=?',user.id))?.matches !== 0 };
        if (method === 'POST') {
            const enabled = z.boolean().parse(b.matches);
            await db.prepare('INSERT INTO preferences(userId,matches) VALUES(?,?) ON CONFLICT(userId) DO UPDATE SET matches=excluded.matches').bind(user.id,Number(enabled)).run();
            return { matches: enabled };
        }
    }
    if (path[0] === 'match-feedback' && method === 'POST') {
        const input = z.object({reportId:z.string().uuid(),otherId:z.string().uuid(),relevant:z.boolean()}).parse(b);
        const r = await one('SELECT owner FROM reports WHERE id=?',input.reportId);
        if (r?.owner !== user.id) reject('Only the report owner can review its suggestions.',403);
        if (!await one('SELECT 1 FROM reports WHERE id=? AND hidden=0 AND demo=0 AND id!=?',input.otherId,input.reportId)) reject('Report unavailable.',404);
        await db.prepare('INSERT INTO match_feedback(userId,reportId,otherId,relevant,created) VALUES(?,?,?,?,?) ON CONFLICT(userId,reportId,otherId) DO UPDATE SET relevant=excluded.relevant,created=excluded.created')
          .bind(user.id,input.reportId,input.otherId,Number(input.relevant),Date.now()).run();
        return {ok:true};
    }
    if (path[0] === 'duplicates' && method === 'POST') {
        const input = z.object({id:z.string().optional(),type:z.enum(['lost','found']),title:z.string().max(100),description:z.string().max(2000),category:z.string().max(60),colour:z.string().max(50),brand:z.string().max(60),date:z.string().max(10),location:z.string().max(100)}).parse(b);
        const candidates = await all("SELECT * FROM reports WHERE owner=? AND demo=0 AND hidden=0 AND type=? AND status IN ('Open','Claim Pending') ORDER BY created DESC LIMIT 100",user.id,input.type);
        const source = {...input,id:input.id || 'draft',status:'Open'};
        return {items:candidates.filter(r=>r.id!==input.id).map(r=>({report:publicReport(r),...match({...source,type:input.type==='lost'?'found':'lost'} as Matchable,r as Matchable)})).filter(r=>r.score>75).slice(0,5)};
    }
    if (path[0] === 'smart-search') {
        if (method === 'POST') {
            if (!await intelligenceAvailable(db)) reject('AI processing is currently offline. You can still use the regular search and filters.',503);
            const input = z.object({query:z.string().trim().max(500).default(''),image:z.string().max(150).optional()}).parse(b);
            if (!input.query && !input.image) reject('Enter a description or choose a photo.');
            if (input.image && (!/^\/api\/media\/[a-f0-9-]+\.(jpg|png|webp)$/.test(input.image) || !await one('SELECT 1 FROM uploads WHERE id=? AND owner=?',input.image.slice('/api/media/'.length),user.id))) reject('Use your own uploaded photo.',403);
            if ((await one("SELECT count(*) AS n FROM search_jobs WHERE userId=? AND state IN ('pending','running') AND (attempts<3 OR available>?) AND created>?",user.id,Date.now(),Date.now()-86400000))!.n >= 3) reject('Please wait for your current searches to finish.',429);
            const id=crypto.randomUUID();
            await db.prepare('INSERT INTO search_jobs(id,userId,query,image,created) VALUES(?,?,?,?,?)').bind(id,user.id,input.query,input.image||null,Date.now()).run();
            return {id,state:'pending'};
        }
        if (method === 'GET' && path[1]) {
            const job = await one('SELECT * FROM search_jobs WHERE id=? AND userId=? AND created>?',path[1],user.id,Date.now()-86400000);
            if (!job) reject('Search unavailable or expired.',404);
            if (job!.state==='running' && job!.attempts>=3 && job!.available<=Date.now()) return {state:'failed',items:[],retryable:false,message:'Processing stopped after repeated attempts. Please start a new search.'};
            if (job!.state !== 'ready') return {state:job!.state,items:[],retryable:job!.attempts<3,message:job!.attempts>=3?'Processing failed after repeated attempts. Please start a new search.':undefined};
            if (job!.model !== MODEL_VERSION) return {state:'expired',items:[],retryable:false,message:'Search models have been updated. Please start a new search.'};
            const rows=await all(`SELECT r.*,e.textVector,e.imageVector FROM reports r JOIN embeddings e ON e.reportId=r.id AND e.revision=r.matchRevision
              WHERE r.demo=0 AND r.hidden=0 AND r.status IN ('Open','Claim Pending') AND e.model=?
              AND NOT EXISTS(SELECT 1 FROM blocks WHERE (userId=? AND blocked=r.owner) OR (userId=r.owner AND blocked=?)) ORDER BY r.created DESC LIMIT 1000`,MODEL_VERSION,user.id,user.id);
            const items=rows.map(r=>{
                const t=job!.query ? cosine(vector(job!.textVector),vector(r.textVector)) : null;
                const i=job!.image ? cosine(vector(job!.imageVector),vector(r.imageVector)) : null;
                const factors=[t,i].filter(v=>v!==null) as number[];
                const score=factors.length ? Math.round(100*factors.reduce((a,b)=>a+b,0)/factors.length) : 0;
                return {report:publicReport(r),score,label:similarityLabel(score,2),reasons:[...(t!==null?['Semantic description comparison']:[]),...(i!==null?['Photo comparison']:[])]};
            }).filter(r=>r.score>=40).sort((a,b)=>b.score-a.score).slice(0,24);
            return {state:'ready',items,scope:'Latest 1,000 active reports with completed embeddings',model:job!.model};
        }
    }
    return null;
}
