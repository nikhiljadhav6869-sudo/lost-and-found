'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Loader2, Lock, X } from 'lucide-react';

type Capabilities = { passwordReset: boolean; emailVerification: boolean; emailVerificationRequired: boolean };
type Props = { mode: string; onModeChange: (mode: string) => void; onAuthenticated: () => void | Promise<void> };
class AuthError extends Error {
    constructor(message: string, readonly code = '') { super(message); }
}

async function accountRequest(path: string, body?: Record<string, unknown>) {
    const response = await fetch('/api/' + path, {
        method: body ? 'POST' : 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json() as { message?: string; error?: string; code?: string; auth: Capabilities; token?: string };
    if (!response.ok) throw new AuthError(data.message || data.error || 'Please try again.', data.code);
    return data;
}

/** Always mount this component. It also handles links from account emails. */
export default function AccountAccess({ mode, onModeChange, onAuthenticated }: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [token, setToken] = useState('');
    const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
    const changeMode = (next: string) => { setError(''); setMessage(''); onModeChange(next); };

    useEffect(() => {
        let mounted = true;
        accountRequest('config').then(data => { if (mounted) setCapabilities(data.auth); }).catch(() => {
            if (mounted) setCapabilities({ passwordReset: false, emailVerification: false, emailVerificationRequired: false });
        });
        const url = new URL(window.location.href);
        const flow = url.searchParams.get('auth');
        if (flow === 'reset' || flow === 'verified') {
            const linkError = url.searchParams.get('error');
            const linkToken = url.searchParams.get('token');
            if (flow === 'reset') {
                setToken(linkToken || '');
                onModeChange(linkError || !linkToken ? 'forgot' : 'reset');
                if (linkError || !linkToken) setError('This reset link is invalid or has expired. Request a new one.');
            } else {
                onModeChange(linkError ? 'verify' : 'login');
                if (linkError) setError('This verification link is invalid or has expired. Request a new one.');
                else setMessage('Your email is verified. You can now sign in.');
            }
            for (const key of ['auth', 'token', 'error']) url.searchParams.delete(key);
            window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
        }
        return () => { mounted = false; };
    // Only examine an email link once; parent callbacks may change on render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!mode || !dialog.current) return;
        const previous = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        if (!dialog.current.open) dialog.current.showModal();
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previousOverflow; previous?.focus(); };
    }, [!!mode]);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(event.currentTarget));
        setBusy(true); setError(''); setMessage('');
        try {
            if (mode === 'forgot') {
                await accountRequest('auth/request-password-reset', { email, redirectTo: '/?auth=reset' });
                setMessage('If an account uses this email, a reset link will arrive shortly. Check your spam folder too.');
            } else if (mode === 'verify') {
                await accountRequest('auth/send-verification-email', { email, callbackURL: '/?auth=verified' });
                setMessage('If this email belongs to an unverified account, a verification link will arrive shortly.');
            } else if (mode === 'reset') {
                if (values.password !== values.confirmPassword) throw new AuthError('The two passwords do not match.');
                if (!token) throw new AuthError('Request a new reset link before changing your password.');
                await accountRequest('auth/reset-password', { token, newPassword: values.password });
                setToken('');
                onModeChange('login');
                setMessage('Your password has been changed and previous sessions have been signed out. Sign in with your new password.');
            } else {
                const registering = mode === 'register';
                const data = await accountRequest('auth/' + (registering ? 'sign-up/email' : 'sign-in/email'), {
                    email, password: values.password,
                    ...(registering ? { name: values.name, callbackURL: '/?auth=verified' } : {}),
                });
                if (registering && !data.token) {
                    onModeChange('verify');
                    setMessage('Check your email to verify your account. If you already have an account, sign in or reset your password.');
                } else {
                    await onAuthenticated();
                    onModeChange('');
                }
            }
        } catch (cause) {
            if (cause instanceof AuthError && cause.code === 'EMAIL_NOT_VERIFIED') {
                onModeChange('verify');
                setError('Verify your email before signing in. You can request a new link below.');
            } else setError(cause instanceof Error ? cause.message : 'We could not complete this request. Please try again.');
        } finally { setBusy(false); }
    }

    if (!mode) return null;
    const titles: Record<string, string> = { login: 'Welcome back.', register: 'A good place to belong.', forgot: 'Forgot your password?', verify: 'Verify your email.', reset: 'Choose a new password.' };
    const descriptions: Record<string, string> = { login: 'Sign in to your community account.', register: 'Create an account to report, save, and safely reconnect.', forgot: 'We’ll send a private link to your account email.', verify: 'Confirm that this email address belongs to you.', reset: 'Use a password you haven’t used on another account.' };
    const labels: Record<string, string> = { login: 'Sign in', register: 'Create account', forgot: 'Send reset link', verify: 'Send verification link', reset: 'Save new password' };
    const emailUnavailable = (mode === 'forgot' && capabilities?.passwordReset === false) || (mode === 'verify' && capabilities?.emailVerification === false);
    const close = () => { if (!busy) changeMode(''); };
    return <dialog className="modal" ref={dialog} aria-labelledby="account-access-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) close(); }}>
        <header><h2 id="account-access-title">{titles[mode] || titles.login}</h2><button type="button" className="icon-btn" aria-label="Close account dialog" disabled={busy} onClick={close}><X /></button></header>
        <p className="modal-intro">{descriptions[mode] || descriptions.login}</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        {message && <div className="alert" role="status">{message}</div>}
        {emailUnavailable ? <p role="status">Email delivery is not available yet. Please contact the app operator for help.</p> : <form onSubmit={submit}>
            {mode === 'register' && <label>Your name<input name="name" autoComplete="name" minLength={2} maxLength={80} required disabled={busy}/></label>}
            {mode !== 'reset' && <label>Email<input name="email" type="email" autoComplete="email" required value={email} disabled={busy} onChange={event => setEmail(event.target.value)}/></label>}
            {['login', 'register', 'reset'].includes(mode) && <label>{mode === 'reset' ? 'New password' : 'Password'}<input key={mode} name="password" type="password" minLength={12} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required disabled={busy}/><small>At least 12 characters.</small></label>}
            {mode === 'reset' && <label>Confirm new password<input name="confirmPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" required disabled={busy}/></label>}
            <button className="button primary full" disabled={busy || (!capabilities && ['forgot', 'verify'].includes(mode))}>{busy && <Loader2 className="spin" size={18}/>} {labels[mode] || labels.login}<ArrowRight size={17}/></button>
        </form>}
        {mode === 'login' && <>
            <p className="form-switch">New around here? <button disabled={busy} onClick={() => changeMode('register')}>Create an account</button></p>
            {capabilities?.passwordReset && <p className="form-switch"><button disabled={busy} onClick={() => changeMode('forgot')}>Forgot password?</button></p>}
            {capabilities?.emailVerification && <p className="form-switch"><button disabled={busy} onClick={() => changeMode('verify')}>Resend verification email</button></p>}
        </>}
        {mode !== 'login' && <p className="form-switch"><button disabled={busy} onClick={() => changeMode('login')}>Back to sign in</button>{mode === 'verify' && capabilities?.passwordReset && <> · <button disabled={busy} onClick={() => changeMode('forgot')}>Forgot password?</button></>}</p>}
        <div className="private-note"><Lock size={14}/> Your email is never shown on public reports.</div>
    </dialog>;
}
