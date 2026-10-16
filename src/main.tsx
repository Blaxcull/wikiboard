import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { attachEdgeDelegate } from './utils/window/onEdge'
import { inject } from '@vercel/analytics'

// Initialize Vercel Web Analytics
inject({ framework: 'react' })

attachEdgeDelegate()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

