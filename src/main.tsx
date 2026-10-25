import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RepoProvider } from './data/RepoContext.tsx'

// Ask the browser not to evict our data when storage is tight (best effort; installed PWAs are safest).
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RepoProvider>
      <App />
    </RepoProvider>
  </StrictMode>,
)
