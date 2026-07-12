import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { LoginPage } from './components/LoginPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './lib/auth'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<App />} />
            <Route path="/boards/:boardRef" element={<App />} />
            <Route path="/boards/:boardRef/tasks/:taskRef" element={<App />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
