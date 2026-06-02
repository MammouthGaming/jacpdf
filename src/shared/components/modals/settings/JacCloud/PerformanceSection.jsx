import { useState } from 'react'
import { deleteAllOwnCloudFiles } from '@/shared/lib/cloud/jacCloud'

// Avancé : maintenance du cloud central. La resynchronisation, l'export CSV et
// le vidage du cache sont délégués à JacCloudApp via des événements window ;
// la zone de danger appelle directement le cœur cloud.

export default function PerformanceSection() {
  const [busy, setBusy] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [done, setDone] = useState('')

  const fire = (name) => window.dispatchEvent(new Event(name))

  const handleWipe = async () => {
    setBusy(true)
    setDone('')
    try {
      await deleteAllOwnCloudFiles()
      window.dispatchEvent(new Event('jacsuite:cloudFilesChanged'))
      setConfirmWipe(false)
      setDone('Tous tes fichiers cloud ont été supprimés.')
    } catch (e) {
      setDone('Échec de la suppression : ' + (e?.message || 'erreur inconnue'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Avancé</h3>
      <p className="fsm-section-sub">Maintenance et données de JacSuite Cloud.</p>

      <h4 className="fsm-group-title">Maintenance</h4>

      <div className="fsm-perf-row">
        <div className="fsm-perf-row-label">
          <p className="fsm-perf-row-name">Resynchroniser maintenant</p>
          <p className="fsm-perf-row-desc">Recharge tous tes fichiers et la corbeille depuis le serveur.</p>
        </div>
        <button className="fsm-btn" onClick={() => fire('jaccloud:resync')}>Resynchroniser</button>
      </div>

      <div className="fsm-perf-row">
        <div className="fsm-perf-row-label">
          <p className="fsm-perf-row-name">Vider le cache</p>
          <p className="fsm-perf-row-desc">Efface le cache local d'aperçus et force un rechargement propre.</p>
        </div>
        <button className="fsm-btn" onClick={() => fire('jaccloud:clearCache')}>Vider</button>
      </div>

      <div className="fsm-perf-row">
        <div className="fsm-perf-row-label">
          <p className="fsm-perf-row-name">Exporter la liste des fichiers</p>
          <p className="fsm-perf-row-desc">Télécharge un fichier CSV de tous tes fichiers cloud (nom, app, taille, date).</p>
        </div>
        <button className="fsm-btn" onClick={() => fire('jaccloud:exportCsv')}>Exporter en CSV</button>
      </div>

      {done && <p className="fsm-label-sub" style={ { marginTop: 10 } }>{done}</p>}

      <div className="fsm-divider" />

      <h4 className="fsm-group-title" style={ { color: '#ef4444' } }>Zone de danger</h4>
      <div className="fsm-perf-row">
        <div className="fsm-perf-row-label">
          <p className="fsm-perf-row-name">Supprimer tous mes fichiers cloud</p>
          <p className="fsm-perf-row-desc">Supprime définitivement l'ensemble de tes fichiers de JacSuite Cloud. Irréversible.</p>
        </div>
        <button className="fsm-btn-danger" onClick={() => setConfirmWipe(true)}>Tout supprimer</button>
      </div>

      {confirmWipe && (
        <div className="fsm-perf-details" style={ { marginTop: 12, border: '1px solid #7c2d2d', borderRadius: 10, padding: 14, background: 'rgba(124,45,45,0.12)' } }>
          <p className="fsm-label">Tu es sûr ?</p>
          <p className="fsm-label-sub">Cette action supprime <strong>tous</strong> tes fichiers cloud, sans corbeille. Impossible à annuler.</p>
          <div style={ { display: 'flex', gap: 8, marginTop: 12 } }>
            <button className="fsm-btn" onClick={() => setConfirmWipe(false)} disabled={busy}>Annuler</button>
            <button className="fsm-btn-danger" onClick={handleWipe} disabled={busy}>{busy ? 'Suppression…' : 'Oui, tout supprimer'}</button>
          </div>
        </div>
      )}
    </div>
  )
}