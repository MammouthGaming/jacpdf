import { useEffect, useRef, useState } from 'react'
import './CameraModal.css'

export default function CameraModal({ onCapture, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [photo, setPhoto] = useState(null)
  const [error, setError] = useState(null)

  // Démarre la caméra quand on passe en mode « live ». L'arrête au démontage ou passage en preview.
  useEffect(() => {
    if (photo) return
    let cancelled = false
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      })
      .catch(() => {
        setError("Impossible d'accéder à la caméra. Vérifie les permissions du navigateur.")
      })
    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [photo])

  // Capture la frame courante du flux vidéo dans un canvas, convertit en dataURL JPEG.
  const takePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setPhoto(dataUrl)
    // Couper le flux dès qu'on a la photo — relibère la webcam.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  const retake = () => setPhoto(null)

  const insert = () => {
    if (photo) onCapture?.(photo)
    onClose?.()
  }

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-card" onClick={(e) => e.stopPropagation()}>
        <div className="cm-header">
          <h2 className="cm-title">{photo ? 'Aperçu' : 'Caméra'}</h2>
          <button className="cm-close" onClick={onClose}>✕</button>
        </div>
        <div className="cm-body">
          {error ? (
            <div className="cm-error">{error}</div>
          ) : photo ? (
            <img className="cm-preview" src={photo} alt="Aperçu" />
          ) : (
            <video ref={videoRef} className="cm-video" autoPlay playsInline muted />
          )}
        </div>
        <div className="cm-actions">
          {!photo && !error && (
            <button className="cm-capture-btn" onClick={takePhoto}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Prendre la photo
            </button>
          )}
          {photo && (
            <>
              <button className="cm-retake-btn" onClick={retake}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
                Reprendre
              </button>
              <button className="cm-insert-btn" onClick={insert}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Insérer
              </button>
            </>
          )}
          {error && (
            <button className="cm-retake-btn" onClick={onClose}>Fermer</button>
          )}
        </div>
      </div>
    </div>
  )
}