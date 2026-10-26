export class RequestError extends Error {
    constructor(message: string, readonly code = '', readonly status = 0) { super(message); }
}

/** Retry reads only. Retrying a submission after a timeout could duplicate it. */
export async function requestJson(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    const attempts = method === 'GET' ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const response = await fetch('/api/' + path, {
                method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(25000),
                headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            if ([502, 503, 504].includes(response.status)) throw new RequestError('The server is starting or temporarily unavailable. Please retry shortly.', '', response.status);
            let data: Record<string, any>;
            try { data = await response.json() as Record<string, any>; }
            catch { throw new RequestError('The server returned an incomplete response. Please try again.'); }
            if (!response.ok) throw new RequestError(data.error || data.message || 'Please try again.', data.code || '', response.status);
            return data;
        } catch (error) {
            const retryable = !(error instanceof RequestError) || [0, 502, 503, 504].includes(error.status);
            if (attempt + 1 < attempts && retryable) { await new Promise(resolve => setTimeout(resolve, 800)); continue; }
            if (error instanceof RequestError) throw error;
            throw new RequestError(method === 'GET'
                ? 'Unable to connect. Check your internet connection, then retry. The server may still be starting.'
                : 'The request could not be confirmed. Check your dashboard before submitting again. Your form is still here.');
        }
    }
    throw new RequestError('Please try again.');
}
