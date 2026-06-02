import { useEffect, useRef, useState } from 'react'
import { useGoogleDrive } from "@/apps/jacpdf/hooks/cloud/useGoogleDrive"
import { openGooglePicker } from "@/apps/jacpdf/lib/cloud/googlePicker"
import './DriveFilePicker.css'

/**
 * Trigger composant qui ouvre le Google Picker quand `open=true`.
 * - Si pas connecté : mini-modal custom avec CTA « Connecter Google Drive ».
 * - Si connecté : ouvre directement le Picker Google (UI native, dossiers, recherche, récents).
 */
export default function DriveFilePicker({ open, onClose, onSelect }) {
  const { connected, loading, connectDrive, openFile } = useGoogleDrive()
  const [pickerError, setPickerError] = useState(null)
  const inFlightRef = useRef(false)

  // Stabilise onSelect/onClose dans des refs. HomeContent passe des arrow
  // functions inline → nouvelle ref à chaque render. Si on les mettait dans
  // les deps de useEffect, le cleanup (cancelled = true) firerait au moment
  // où l'utilisateur pick un PDF dans le Google Picker (parent re-render dû
  // à un setState quelconque), et le `if (cancelled) return` juste après le
  // `await openGooglePicker()` tuait le flow → onSelect jamais appelé,
  // l'utilisateur devait re-cliquer sur la carte Drive pour réessayer.
  const onSelectRef = useRef(onSelect)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onSelectRef.current = onSelect })
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) {
      inFlightRef.current = false
      setPickerError(null)
      return
    }
    if (loading || !connected) return
    if (inFlightRef.current) return

    inFlightRef.current = true
    let cancelled = false

    ;(async () => {
      try {
        setPickerError(null)
        const picked = await openGooglePicker()
        if (cancelled) return
        if (!picked) {
          // user cancelled
          onCloseRef.current?.()
          return
        }
        const bytes = await openFile(picked.fileId)
        if (cancelled) return
        onSelectRef.current?.({ fileId: picked.fileId, name: picked.name, bytes })
        onCloseRef.current?.()
      } catch (err) {
        if (cancelled) return
        console.error('Drive picker error', err)
        setPickerError(err)
      } finally {
        inFlightRef.current = false
      }
    })()

    return () => {
      cancelled = true
    }
    // onSelect/onClose volontairement HORS des deps (cf. refs ci-dessus).
  }, [open, connected, loading, openFile])

  if (!open) return null
  if (loading) return null

  // Pas connecté — mini-modal CTA
  if (!connected) {
    return (
      <div className="dfp-overlay" onClick={onClose}>
        <div className="dfp-modal" onClick={(e) => e.stopPropagation()}>
          <div className="dfp-header">
            <h2>Ouvrir depuis Google Drive</h2>
            <button className="dfp-close" onClick={onClose}>✕</button>
          </div>
          <div className="dfp-empty">
            <p>Connecte ton compte Google pour parcourir ton Drive.</p>
            <button className="dfp-btn-primary" onClick={connectDrive}>
              Connecter Google Drive
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Erreur après tentative d'ouverture du Picker
  if (pickerError) {
    return (
      <div className="dfp-overlay" onClick={onClose}>
        <div className="dfp-modal" onClick={(e) => e.stopPropagation()}>
          <div className="dfp-header">
            <h2>Erreur Google Drive</h2>
            <button className="dfp-close" onClick={onClose}>✕</button>
          </div>
          <div className="dfp-empty">
            <p>{pickerError.message}</p>
            <button className="dfp-btn-primary" onClick={connectDrive}>
              Reconnecter à Google
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Connecté + pas d'erreur : le Picker est rendu par gapi hors React.
  return null
}