import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { lockZoomWhenInstalled } from './app/standalone.ts'
import { ToastProvider } from './app/toast.tsx'
import { RepoProvider } from './data/RepoContext.tsx'

// Ask the browser not to evict our data when storage is tight (best effort; installed PWAs are safest).
void navigator.storage?.persist?.()

// The Home Screen app shouldn't pinch or double-tap zoom like a web page; a browser tab still can.
lockZoomWhenInstalled()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RepoProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </RepoProvider>
  </StrictMode>,
)
