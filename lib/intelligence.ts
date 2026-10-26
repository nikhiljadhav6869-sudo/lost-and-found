import { match, type Matchable } from './matching';
export const MODEL_VERSION = 'minilm-751bff3_clip-d15189d_q8_v1';
export const DEFAULT_WEIGHTS = { details: 0.4, text: 0.35, image: 0.25 };
export type Embedding = { model: string; revision: number; textVector: string; imageVector: string | null };
export function vector(value: string | null | undefined): number[] | null {
    try { const v = JSON.parse(value || 'null'); return Array.isArray(v) && v.length > 0 && v.length <= 1024 && v.every(x => typeof x === 'number' && Number.isFinite(x)) ? v : null; } catch { return null; }
}
export function cosine(a: number[] | null, b: number[] | null): number | null {
    if (!a || !b || a.length !== b.length) return null;
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
    return aa && bb ? Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb))) : null;
}
export function rankingWeights(raw?: string) {
    if (!raw) return DEFAULT_WEIGHTS;
    try { const w = JSON.parse(raw); if (Object.keys(DEFAULT_WEIGHTS).every(k => typeof w[k] === 'number' && w[k] >= 0 && w[k] <= 1) && w.details >= 0.25 && w.details + w.text + w.image > 0) return { details: w.details, text: w.text, image: w.image }; } catch {}
    return DEFAULT_WEIGHTS;
}
export function multimodal(a: Matchable, b: Matchable, ea?: Embedding | null, eb?: Embedding | null, weights = DEFAULT_WEIGHTS) {
    const baseline = match(a, b);
    const result = { ...baseline, method: 'public-details', model: null as string | null };
    if (a.type === b.type || a.id === b.id || !['Open','Claim Pending'].includes(a.status) || !['Open','Claim Pending'].includes(b.status)) return result;
    if (!ea || !eb || ea.model !== MODEL_VERSION || eb.model !== MODEL_VERSION) return result;
    const text = cosine(vector(ea.textVector), vector(eb.textVector));
    const image = cosine(vector(ea.imageVector), vector(eb.imageVector));
    if (text === null) return result;
    // Heuristic ranking, not a calibrated probability. Missing images contribute no weight.
    const strength = (value: number, floor: number) => Math.max(0, (value - floor) / (1 - floor));
    let sum = baseline.score / 100 * weights.details + strength(text, 0.2) * weights.text;
    let total = weights.details + weights.text;
    const reasons = [...baseline.reasons];
    if (text >= 0.55) reasons.push('Similar meaning in public descriptions');
    if (image !== null) { sum += strength(image, 0.4) * weights.image; total += weights.image; if (image >= 0.7) reasons.push('Visually similar photographs'); }
    let score = Math.round(100 * sum / total);
    if (a.category !== b.category) score = Math.min(score, 74);
    return { score, reasons, method: image === null ? 'semantic-and-details' : 'image-semantic-and-details', model: MODEL_VERSION };
}
export function publicEmbeddingText(r: Record<string, any>) {
    return [r.title, r.description, r.category, r.colour, r.brand].filter(Boolean).join('. ').slice(0, 2400);
}
