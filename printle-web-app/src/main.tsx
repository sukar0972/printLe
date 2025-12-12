import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App' // Ensure your main app file is named 'App.tsx' in the src folder
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
