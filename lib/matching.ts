export type Matchable = {
    id: string;
    type: string;
    category: string;
    title: string;
    description: string;
    colour: string;
    brand: string;
    date: string;
    location: string;
    status: string;
};
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'with', 'lost', 'found', 'near', 'this', 'that', 'item'].includes(w)));
export function match(a: Matchable, b: Matchable) {
    if (a.type === b.type || a.id === b.id || !['Open', 'Claim Pending'].includes(b.status))
        return { score: 0, reasons: [] as string[] };
    let score = 0;
    const reasons: string[] = [];
    if (a.category === b.category) {
        score += 30;
        reasons.push('Same category');
    }
    const at = tokens(a.title + ' ' + a.description), bt = tokens(b.title + ' ' + b.description);
    const overlap = [...at].filter(t => bt.has(t)).length;
    if (overlap) {
        score += Math.round(25 * overlap / Math.max(1, Math.min(at.size, bt.size)));
        reasons.push('Shared description details');
    }
    if (a.colour && a.colour.toLowerCase() === b.colour.toLowerCase()) {
        score += 15;
        reasons.push('Same colour');
    }
    if (a.brand && a.brand.toLowerCase() === b.brand.toLowerCase()) {
        score += 10;
        reasons.push('Same brand');
    }
    const lost = a.type === 'lost' ? a : b, found = a.type === 'found' ? a : b, days = (Date.parse(found.date) - Date.parse(lost.date)) / 86400000;
    if (days >= 0 && days <= 30) {
        score += 10;
        reasons.push('Compatible dates');
    }
    const al = tokens(a.location), bl = tokens(b.location);
    if ([...al].some(t => bl.has(t))) {
        score += 10;
        reasons.push('Overlapping location');
    }
    return { score, reasons };
}
export const categories = ['Electronics', 'Wallets', 'Bags', 'Keys', 'Documents', 'Clothing', 'Jewellery', 'Books', 'Sports equipment', 'Other'];
export const checklist: Record<string, string[]> = { Electronics: ['Try your device’s built-in find feature.', 'Contact transit and venue lost-property desks.', 'Keep serial numbers private for ownership checks.'], Wallets: ['Retrace your most recent purchases.', 'Contact your card providers if cards are missing.', 'Never publish card numbers or ID photos.'], Keys: ['Check coat pockets, bags, and reception desks.', 'Describe the keyring, but keep key cuts private.', 'Do not post your home address.'], Documents: ['Contact the issuing organisation for next steps.', 'Keep document numbers and photos private.', 'Check secure reception and lost-property desks.'] };
