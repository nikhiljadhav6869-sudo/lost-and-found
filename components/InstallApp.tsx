'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Download, Share, Smartphone, Wifi, X } from 'lucide-react';
import styles from './InstallApp.module.css';

type InstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function InstallInstructions({ close }: { close: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const headingId = useId();
    const descriptionId = useId();

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        const element = dialog.current;
        element?.showModal();
        document.body.style.overflow = 'hidden';
        return () => {
            element?.close();
            document.body.style.overflow = previousOverflow;
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        };
    }, []);

    return <dialog ref={dialog} className={`modal ${styles.dialog}`} aria-labelledby={headingId} aria-describedby={descriptionId}
        onCancel={event => { event.preventDefault(); close(); }}
        onClick={event => { if (event.target === dialog.current) close(); }}>
        <header>
            <h2 id={headingId}>Lost &amp; Found on your phone</h2>
            <button type="button" className="icon-btn" aria-label="Close installation instructions" onClick={close} autoFocus><X size={21} /></button>
        </header>
        <p id={descriptionId} className={styles.intro}>Keep your community a tap away. Add Lost &amp; Found to your home screen from your phone’s browser.</p>
        <div className={styles.instructions}>
            <section aria-labelledby={`${headingId}-android`}>
                <h3 id={`${headingId}-android`}><Smartphone size={18} aria-hidden="true" /> Android · Chrome</h3>
                <ol>
                    <li>Open this website in <strong>Chrome</strong>.</li>
                    <li>Tap the <strong>three-dot menu ⋮</strong>.</li>
                    <li>Choose <strong>Add to Home screen</strong> or <strong>Install app</strong>, then confirm.</li>
                </ol>
            </section>
            <section aria-labelledby={`${headingId}-iphone`}>
                <h3 id={`${headingId}-iphone`}><Share size={18} aria-hidden="true" /> iPhone · Safari</h3>
                <ol>
                    <li>Open this website in <strong>Safari</strong>.</li>
                    <li>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. You may need to scroll through the actions.</li>
                    <li>Keep <strong>Open as Web App</strong> on if shown, then tap <strong>Add</strong>.</li>
                </ol>
            </section>
        </div>
        <p className={styles.browserNote}>If the option is missing, open the link in Chrome or Safari instead of a social app’s built-in browser. On a computer, look for an install option in your browser’s address bar or menu.</p>
        <p className={styles.connectionNote}><Wifi size={17} aria-hidden="true" /> An internet connection is needed to load reports, photos, and messages.</p>
        <button type="button" className="button primary full" onClick={close}>Got it</button>
    </dialog>;
}

export default function InstallApp() {
    const [ready, setReady] = useState(false);
    const [installed, setInstalled] = useState(false);
    const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
    const [instructionsOpen, setInstructionsOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        const standalone = window.matchMedia('(display-mode: standalone)');
        const syncDisplayMode = () => {
            const isInstalled = standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
            setInstalled(isInstalled);
            if (isInstalled) setInstructionsOpen(false);
        };
        const capturePrompt = (event: Event) => {
            event.preventDefault();
            setPromptEvent(event as InstallPromptEvent);
            setNotice('');
        };
        const handleInstalled = () => {
            setInstalled(true);
            setPromptEvent(null);
            setInstructionsOpen(false);
        };

        window.addEventListener('beforeinstallprompt', capturePrompt);
        window.addEventListener('appinstalled', handleInstalled);
        standalone.addEventListener('change', syncDisplayMode);
        syncDisplayMode();
        setReady(true);

        if (window.isSecureContext && 'serviceWorker' in navigator) {
            // Let the browser activate updates normally; never interrupt a report or message.
            void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
                // Home-screen instructions still work when a browser disallows service workers.
            });
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', capturePrompt);
            window.removeEventListener('appinstalled', handleInstalled);
            standalone.removeEventListener('change', syncDisplayMode);
        };
    }, []);

    async function install() {
        if (!promptEvent) {
            setInstructionsOpen(true);
            return;
        }
        setBusy(true);
        setNotice('');
        try {
            await promptEvent.prompt();
            const { outcome } = await promptEvent.userChoice;
            setNotice(outcome === 'accepted'
                ? 'Installation requested. Follow your browser’s instructions.'
                : 'You can install later or keep using the website.');
        } catch {
            setInstructionsOpen(true);
        } finally {
            // A browser install prompt can only be used once.
            setPromptEvent(null);
            setBusy(false);
        }
    }

    if (!ready || installed) return null;

    return <>
        <section className={styles.banner} aria-labelledby="install-app-heading">
            <div className={styles.icon} aria-hidden="true"><Smartphone size={28} /></div>
            <div className={styles.copy}>
                <span className={styles.eyebrow}>A LITTLE CLOSER TO HOME</span>
                <h2 id="install-app-heading">Your community. On your home screen.</h2>
                <p>Add Lost &amp; Found to your phone for easy access. Free to install; internet needed.</p>
            </div>
            <div className={styles.action}>
                <button type="button" className={`button primary ${styles.installButton}`} onClick={install} disabled={busy}>
                    <Download size={18} aria-hidden="true" /> {busy ? 'Opening…' : 'Install app'}
                </button>
                <span className={styles.caption}>For Android &amp; iPhone</span>
            </div>
            {notice && <p className={styles.notice} role="status">{notice}</p>}
        </section>
        {instructionsOpen && <InstallInstructions close={() => setInstructionsOpen(false)} />}
    </>;
}
