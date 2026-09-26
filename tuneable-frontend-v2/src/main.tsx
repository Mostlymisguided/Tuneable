import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { bootstrapCapacitor } from './capacitor/bootstrap'

const PRELOAD_RELOAD_KEY = 'tuneable-vite-preload-reload'
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  if (sessionStorage.getItem(PRELOAD_RELOAD_KEY)) return
  sessionStorage.setItem(PRELOAD_RELOAD_KEY, '1')
  window.location.reload()
})

bootstrapCapacitor().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
