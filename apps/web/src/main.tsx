import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted variable font (no runtime CDN call) — the playful, highly
// legible face that carries the brand for an 8–50 audience.
import '@fontsource-variable/nunito/index.css';
import './index.css';
import './i18n';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
