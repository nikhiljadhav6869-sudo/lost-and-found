'use client';
import { useEffect, useState } from 'react';
export default function ConnectionStatus() {
    const [offline, setOffline] = useState(false);
    useEffect(() => {
        const update = () => setOffline(!navigator.onLine);
        update(); window.addEventListener('online', update); window.addEventListener('offline', update);
        return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
    }, []);
    return offline ? <div className="alert" role="status">You’re offline. Keep this page open to preserve your form. Reconnect before sending reports or messages.</div> : null;
}
