import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { ProveedorDatos } from './lib/store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorDatos>
      <App />
    </ProveedorDatos>
  </StrictMode>,
)

// El service worker solo tiene sentido cuando la app está publicada en su
// propia dirección. Si falla — por ejemplo dentro de un iframe o abierta desde
// un archivo — se ignora en silencio: la app funciona igual sin él.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
