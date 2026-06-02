import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import { usePremium, openPremiumModal } from '@/shared/hooks/user/usePremium'
import { CLOUD_QUOTA_BYTES_BY_TIER } from '@/shared/lib/user/premiumFeatures'

// Cloud & sauvegarde : synchronisation, stockage et quota du cloud central.

function formatBytes(bytes) {
  if (bytes == null) return '0 o'
  if (bytes < 1024) return `${bytes} o`
  const units = ['Ko', 'Mo', 'Go', 'To']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

const SYNC_FREQ_OPTIONS = [
  { value: 'realtime', label: 'Temps réel', description: 'Mise à jour immédiate via les événements du cloud' },
  { value: '30',       label: 'Toutes les 30 secondes' },
  { value: '60',       label: 'Toutes les minutes' },
  { value: '300',      label: 'Toutes les 5 minutes' },
  { value: 'manual',   label: 'Manuel uniquement', description: 'Actualise via le bouton de rafraîchissement' },
]

const QUOTA_FULL_OPTIONS = [
  { value: 'warn',  label: 'Avertir seulement', description: 'Affiche une alerte mais laisse téléverser' },
  { value: 'block', label: 'Bloquer les ajouts', description: 'Empêche tout nouveau téléversement' },
]

export default function CloudSection({ cloud }) {
  const { tier } = usePremium()
  const [syncFreq, setSyncFreq] = useStoredSetting('jaccloud_settings_sync_frequency', 'realtime')
  const [syncOnFocus, setSyncOnFocus] = useStoredSetting('jaccloud_settings_sync_on_focus', 'true')
  const [syncNotif, setSyncNotif] = useStoredSetting('jaccloud_settings_sync_notifications', 'false')
  const [quotaFull, setQuotaFull] = useStoredSetting('jaccloud_settings_quota_full_behavior', 'warn')
  const on = (v) => v === true || v === 'true'

  const usedBytes = cloud?.usage?.usedBytes ?? 0
  const quota = CLOUD_QUOTA_BYTES_BY_TIER[tier]
  const unlimited = !Number.isFinite(quota)
  const ratio = unlimited || !quota ? 0 : Math.min(1, usedBytes / quota)
  const pct = Math.round(ratio * 100)
  const barColor = ratio < 0.5 ? '#22c55e' : ratio < 0.85 ? '#f59e0b' : '#ef4444'
  const tierLabel = tier === 'premium' ? 'Premium' : tier === 'pro' ? 'Pro' : 'Gratuit'

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Cloud &amp; sauvegarde</h3>
      <p className="fsm-section-sub">Synchronisation et stockage de JacSuite Cloud.</p>

      <h4 className="fsm-group-title">Stockage</h4>
      <div className="fsm-field">
        <label className="fsm-label">Espace utilisé — plan {tierLabel}</label>
        <p className="fsm-label-sub">{unlimited ? `${formatBytes(usedBytes)} · illimité` : `${formatBytes(usedBytes)} sur ${formatBytes(quota)} (${pct}%)`}</p>
        <div style={ { width: '100%', height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden', marginTop: 6 } }>
          <div style={ { width: (unlimited ? 6 : pct) + '%', height: '100%', background: barColor, borderRadius: 999, transition: 'width .3s, background .3s' } } />
        </div>
        {!unlimited && (
          <button className="fsm-action-btn fsm-action-btn-inline" style={ { marginTop: 12 } } onClick={() => openPremiumModal('cloud_sync')}>
            Augmenter mon espace
          </button>
        )}
      </div>

      <div className="fsm-field">
        <label className="fsm-label">Si le stockage est plein</label>
        <FsmSelect value={quotaFull} onChange={setQuotaFull} options={QUOTA_FULL_OPTIONS} />
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Synchronisation</h4>
      <div className="fsm-field">
        <label className="fsm-label">Fréquence de synchronisation</label>
        <p className="fsm-label-sub">À quelle fréquence JacSuite Cloud revérifie tes fichiers.</p>
        <FsmSelect value={syncFreq} onChange={setSyncFreq} options={SYNC_FREQ_OPTIONS} />
      </div>

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Synchroniser au retour sur l'app</label>
          <p className="fsm-label-sub">Recharge tes fichiers quand tu reviens sur l'onglet JacSuite Cloud.</p>
        </div>
        <button className={`fsm-toggle ${on(syncOnFocus) ? 'on' : ''}`} onClick={() => setSyncOnFocus(on(syncOnFocus) ? 'false' : 'true')}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Notification de synchronisation</label>
          <p className="fsm-label-sub">Affiche un toast discret à chaque resynchronisation automatique.</p>
        </div>
        <button className={`fsm-toggle ${on(syncNotif) ? 'on' : ''}`} onClick={() => setSyncNotif(on(syncNotif) ? 'false' : 'true')}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
    </div>
  )
}