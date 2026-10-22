'use client';
import { useEffect, useState } from 'react';
type Operations = { storage: string; auth: { emailVerification: boolean }; cleanup: { candidates: number; queued: number; expiredLimits: number } };
export default function OperationsStatus() {
    const [status, setStatus] = useState<Operations | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/admin/operations', { signal: controller.signal, cache: 'no-store' }).then(async response => {
            if (!response.ok) throw new Error('Could not load the service status.');
            setStatus(await response.json());
        }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
        return () => controller.abort();
    }, []);
    return <aside className="operations-status" aria-label="Service status"><h2>Service status</h2>{error ? <p role="alert">{error}</p> : status ? <><p><strong>Storage:</strong> {status.storage === 'remote' ? 'External database and private photo storage' : status.storage === 'local' ? 'Local storage — confirm the host preserves this disk' : 'Managed storage'}</p><p><strong>Account emails:</strong> {status.auth.emailVerification ? 'Configured — check delivery with a test account' : 'Not configured'}</p><p><strong>Cleanup:</strong> {status.cleanup.candidates} old unattached photos, {status.cleanup.queued} retries, {status.cleanup.expiredLimits} expired rate-limit records.</p><small>Cleanup runs through the operator’s maintenance command. This panel only reads status.</small></> : <p role="status">Loading service status…</p>}</aside>;
}
