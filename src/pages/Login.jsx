import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Login.css'

export default function Login() {
  const [tab, setTab] = useState('connexion')
  const [showPassword, setShowPassword] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [username, setUsername] = useState('Utilisateur')
  const navigate = useNavigate()

  return (
    <div className="login-bg">
      <div className={`login-card ${showModal ? 'blurred' : ''}`}>

        {/* Logo */}
        <div className="login-logo">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="4" y="1" width="14" height="20" rx="3" stroke="#2EFF6E" strokeWidth="2"/>
            <rect x="8" y="17" width="6" height="2" rx="1" fill="#2EFF6E"/>
            <rect x="7" y="5" width="8" height="1.5" rx="0.75" fill="#2EFF6E" opacity="0.5"/>
            <rect x="7" y="8" width="5" height="1.5" rx="0.75" fill="#2EFF6E" opacity="0.5"/>
          </svg>
          <span className="logo-text">Jac<span className="logo-green">PDF</span></span>
        </div>

        {/* Title */}
        <h1 className="login-title">Bienvenue</h1>
        <p className="login-subtitle">Connecte-toi pour continuer</p>

        {/* Tabs */}
        <div className="login-tabs">
          <button
            className={`tab-btn ${tab === 'connexion' ? 'active' : ''}`}
            onClick={() => setTab('connexion')}
          >
            Connexion
          </button>
          <button
            className={`tab-btn ${tab === 'inscription' ? 'active' : ''}`}
            onClick={() => setTab('inscription')}
          >
            Inscription
          </button>
        </div>

        {/* Form */}
        <div className="login-form">

          {tab === 'inscription' && (
            <div className="input-wrapper">
              <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <input type="text" placeholder="Ton prénom" className="login-input" />
            </div>
          )}

          <div className="input-wrapper">
            <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            <input type="email" placeholder="Email" className="login-input" />
          </div>

          <div className="input-wrapper">
            <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Mot de passe"
              className="login-input"
            />
            <button className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          {tab === 'connexion' && (
            <div className="forgot-row">
              <a href="#" className="forgot-link">Mot de passe oublié ?</a>
            </div>
          )}

          <button className="login-btn" onClick={() => navigate('/welcome')}>
            {tab === 'connexion' ? 'Connexion' : 'Inscription'}
          </button>
        </div>

        {/* Divider */}
        <div className="divider">
          <span>ou continuer avec</span>
        </div>

        {/* Social */}
        <div className="social-row">
          <button className="social-btn">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>
          <button className="social-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Facebook
          </button>
          <button className="social-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#1DB954">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            Spotify
          </button>
        </div>

        {/* Continue without account */}
        <button className="continue-link" onClick={() => setShowModal(true)}>
          Continuer sans compte →
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-avatar">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2EFF6E" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <h2 className="modal-title">Comment tu t'appelles ?</h2>
            <p className="modal-subtitle">Ce nom apparaîtra sur ton profil.</p>
            <input
              type="text"
              className="modal-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <button className="login-btn" onClick={() => navigate('/welcome')}>
              Continuer →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}