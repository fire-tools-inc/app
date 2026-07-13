import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { i18nReady } from './i18n'
import { logger } from './utils/logger'

const root = ReactDOM.createRoot(document.getElementById('root')!)

void i18nReady
  .then(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  })
  .catch((error) => {
    logger.error('app', 'translation-init-failed', 'failed to initialize translations', {
      pii: { error: error instanceof Error ? error.message : String(error) },
    })
    root.render(
      <main className="route-load-error" role="alert">
        <h1>Fire Tools could not start</h1>
        <p>Reload the app to try downloading the required language files again.</p>
        <button type="button" className="primary-btn" onClick={() => window.location.reload()}>
          Reload app
        </button>
      </main>,
    )
  })
