import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Served from a web host, the page installs as an app and keeps working when the
// network drops. Opened as a file, or inside claude.ai, none of this applies.
if (import.meta.env.PROD && !__ARTIFACT__ && /^https?:$/.test(location.protocol) && 'serviceWorker' in navigator) {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = 'manifest.webmanifest';
  document.head.appendChild(link);
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
  });
}
