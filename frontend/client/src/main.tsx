import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initSentry } from './lib/sentry'

// Initialize Sentry asynchronously to not block initial render
// Use requestIdleCallback if available, otherwise setTimeout
const initSentryAsync = async () => {
  try {
    await initSentry();
  } catch (error) {
    console.debug("Failed to initialize Sentry:", error);
  }
};

if ('requestIdleCallback' in window && typeof (window as any).requestIdleCallback === 'function') {
  (window as any).requestIdleCallback(() => initSentryAsync(), { timeout: 2000 });
} else {
  setTimeout(() => initSentryAsync(), 100);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
