import { useEffect, useRef, useState } from 'react'
import { useJacdocGoogleDrive } from '@/apps/jacdoc/hooks/cloud/useJacdocGoogleDrive'
import { openJacdocGooglePicker } from '@/apps/jacdoc/lib/cloud/jacdocGooglePicker'
import '@/apps/jacpdf/components/cloud/DriveFilePicker.css'
import './JacdocDriveFilePicker.css'

/**
 * Picker Google Drive pour JacDoc.
 *
 * Même philosophie que JacPDF :
 * - si pas connecté → mini modal de connexion Google ;
 * - si connecté → Google Picker natif ;
 * - après sélection → téléchargement + parsing du `.jacdoc.json`.
 */
export default function JacdocDriveFilePicker({ open, onClose, onSelect }) {
  const { connected, loading, connectDrive, openFile } = useJacdocGoogleDrive()
  const [pickerError, setPickerError] = useState(null)
  const inFlightRef = useRef(false)

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
        const picked = await openJacdocGooglePicker()
        if (cancelled) return

        if (!picked) {
          onCloseRef.current?.()
          return
        }

        const driveDoc = await openFile(picked.fileId, picked.name)
        if (cancelled) return

        onSelectRef.current?.({
          ...driveDoc,
          driveFileId: picked.fileId,
          driveFileName: picked.name,
        })
        onCloseRef.current?.()
      } catch (err) {
        if (cancelled) return
        if (import.meta.env.DEV) console.error('[JacdocDriveFilePicker] picker failed', err)
        setPickerError(err)
      } finally {
        inFlightRef.current = false
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, connected, loading, openFile])

  if (!open) return null
  if (loading) return null

  if (!connected) {
    return (
      <div className="dfp-overlay jdd-overlay" onClick={onClose}>
        <div className="dfp-modal jdd-modal" onClick={(e) => e.stopPropagation()}>
          <div className="dfp-header jdd-header">
            <div>
              <h2>Google Drive</h2>
              <p>Ouvre un fichier `.jacdoc.json` depuis ton Drive.</p>
            </div>
            <button className="dfp-close jdd-close" onClick={onClose}>✕</button>
          </div>
          <div className="dfp-empty jdd-empty">
            <p>Connecte ton compte Google pour parcourir ton Drive.</p>
            <button className="dfp-btn-primary jdd-primary" onClick={connectDrive}>
              Connecter Google Drive
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (pickerError) {
    return (
      <div className="dfp-overlay jdd-overlay" onClick={onClose}>
        <div className="dfp-modal jdd-modal" onClick={(e) => e.stopPropagation()}>
          <div className="dfp-header jdd-header">
            <div>
              <h2>Erreur Google Drive</h2>
              <p>Impossible d’ouvrir ce document JacDoc.</p>
            </div>
            <button className="dfp-close jdd-close" onClick={onClose}>✕</button>
          </div>
          <div className="dfp-empty jdd-empty">
            <p>{pickerError.message}</p>
            <button className="dfp-btn-primary jdd-primary" onClick={connectDrive}>
              Reconnecter Google
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}