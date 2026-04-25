import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App.jsx'

/* Apply the persisted theme before first paint so the login screen
   matches the rest of the app (otherwise it briefly flashes light). */
;(() => {
  try {
    const raw = window.localStorage.getItem('otaku-vault/theme')
    const theme = raw ? JSON.parse(raw) : 'dark'
    document.documentElement.setAttribute('data-theme', theme || 'dark')
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark')
  }
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

