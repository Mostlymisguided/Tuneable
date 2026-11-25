import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const PRELOAD_RELOAD_KEY = 'tuneable-vite-preload-reload'
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  if (sessionStorage.getItem(PRELOAD_RELOAD_KEY)) return
  sessionStorage.setItem(PRELOAD_RELOAD_KEY, '1')
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
