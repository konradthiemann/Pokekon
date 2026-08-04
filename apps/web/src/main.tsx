import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Typography is a neutral system-font stack (see tailwind.config.js) for a crisp,
// analytical look — no web-font import needed.
import './index.css';
import './i18n';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
