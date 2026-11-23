import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reloadOnceForNewVersion } from './lib/chunkReload'

// A preload (JS or CSS) from a previous deploy failed outside any error boundary:
// reload once for the new version instead of leaving the page half-loaded.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForNewVersion()) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
