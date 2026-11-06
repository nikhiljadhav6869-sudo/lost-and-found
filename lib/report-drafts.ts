type DraftData = Record<string, any>;
const PREFIX = 'lf-report-draft-v2:';
const ACTIVE = 'lf-report-active-v2:';
const WEEK = 7 * 86400000;
const limits: Record<string, number> = {title:100,category:60,description:2000,colour:50,brand:60,date:10,location:100,privateDetails:2000};

export function reportDraftKey(userId: string, data: DraftData) {
    return PREFIX + userId + ':' + (data.id || data.type);
}
function fields(value: DraftData): DraftData {
    if (!value || !['lost','found'].includes(value.type)) throw Error('Invalid draft');
    const data: DraftData = {type:value.type};
    if (value.id) {
        if (typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)) throw Error('Invalid report');
        data.id=value.id;
    }
    for (const [key,max] of Object.entries(limits)) {
        if (typeof value[key] !== 'string' || value[key].length > max) throw Error('Invalid draft field');
        data[key]=value[key];
    }
    if (!Array.isArray(value.images) || value.images.length > 5 || value.images.some((url: unknown) => typeof url !== 'string' || !/^\/api\/media\/[a-f0-9-]+\.(jpg|png|webp)$/.test(url))) throw Error('Invalid photos');
    data.images=[...value.images];
    return data;
}
export function readReportDraft(key: string): {created:number;data:DraftData} | null {
    try {
        const draft=JSON.parse(localStorage.getItem(key) || 'null');
        if (!draft) return null;
        if (draft.version !== 2 || !Number.isFinite(draft.created) || draft.created + WEEK <= Date.now()) {
            localStorage.removeItem(key); return null;
        }
        return {created:draft.created,data:fields(draft.data)};
    } catch {return null;}
}
export function activeReportDraft(userId: string) {
    try {
        const key=localStorage.getItem(ACTIVE+userId);
        if (!key?.startsWith(PREFIX+userId+':')) return null;
        const draft=readReportDraft(key);
        return draft && reportDraftKey(userId,draft.data) === key ? draft.data : null;
    } catch {return null;}
}
// Save synchronously on each change, before a phone can suspend the page for its camera.
export function saveReportDraft(userId: string, key: string, value: DraftData) {
    try {
        const data=fields(value);
        if (reportDraftKey(userId,data) !== key) return false;
        const created=readReportDraft(key)?.created || Date.now();
        localStorage.setItem(key,JSON.stringify({version:2,created,data}));
        localStorage.setItem(ACTIVE+userId,key);
        return true;
    } catch {return false;}
}
export function closeReportDraft(userId: string, key: string) {
    try {if(localStorage.getItem(ACTIVE+userId)===key)localStorage.removeItem(ACTIVE+userId);}catch{}
}
export function removeReportDraft(userId: string, key: string) {
    try {localStorage.removeItem(key);}catch{}
    closeReportDraft(userId,key);
}
export function clearAccountDrafts(userId: string) {
    try {
        for (const key of Object.keys(localStorage)) if(key.startsWith(PREFIX+userId+':') || key===ACTIVE+userId)localStorage.removeItem(key);
        for (const key of Object.keys(sessionStorage)) if(key.startsWith('lf-draft-v1:'+userId+':'))sessionStorage.removeItem(key);
    } catch {}
}
