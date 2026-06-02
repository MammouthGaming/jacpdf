import { useEffect, useRef, useState } from 'react'
import { usePremium } from '@/shared/hooks/user/usePremium'
import {
  CLOUD_QUOTA_BYTES_BY_TIER,
  CLOUD_GRACE_PERIOD_MS,
} from '@/shared/lib/user/premiumFeatures'
import {
  getStorageUsage,
  deleteAllOwnCloudFiles,
  enforceCloudQuotaByLargest,
} from '@/apps/jacpdf/lib/cloud/jacpdfCloud'

// Clé localStorage de l'échéance de suppression (timestamp ms). Posée quand on
// repasse Gratuit avec des fichiers cloud ; effacée si on remonte Pro/Premium
// ou une fois la purge faite.
const GRACE_DEADLINE_KEY = 'jacsuite_cloud_grace_deadline'

// Formatte un délai (ms) en « Xj HH:MM:SS » ou « HH:MM:SS ».
function formatLeft(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  const hms = `${pad(h)}:${pad(m)}:${pad(s)}`
  return days > 0 ? `${days}j ${hms}` : hms
}

const wrapStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, zIndex: 11000,
  display: 'flex', justifyContent: 'center', padding: '10px 16px',
  pointerEvents: 'none', fontFamily: 'Inter, system-ui, sans-serif',
}
const bannerBase = {
  pointerEvents: 'auto',
  display: 'flex', alignItems: 'center', gap: 12,
  maxWidth: 720, width: '100%',
  borderRadius: 12, padding: '12px 16px',
  boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
}
const dangerStyle = { ...bannerBase, background: '#2a1115', border: '1px solid #7c2d2d', color: '#fecaca' }
const infoStyle = { ...bannerBase, background: '#161b27', border: '1px solid #2a3347', color: '#d1d5db' }
const iconStyle = { fontSize: 22, lineHeight: 1, flexShrink: 0 }
const textStyle = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, lineHeight: 1.4 }
const subStyle = { opacity: 0.8 }
const closeStyle = {
  marginLeft: 'auto', background: 'transparent', border: 'none',
  color: 'inherit', fontSize: 20, cursor: 'pointer', lineHeight: 1,
}

// Bandeau + logique d'enforcement du downgrade JacPDF Cloud. Monté UNE fois à
// la racine (App.jsx). Deux comportements :
//   1. Gratuit (quota 0) avec des fichiers → compte à rebours (délai de grâce)
//      puis suppression automatique de TOUS les fichiers cloud.
//   2. Premium → Pro avec usage > 100 Mo → suppression immédiate des plus gros
//      fichiers jusqu'à repasser sous 100 Mo.
export default function CloudGraceBanner() {
  const { tier } = usePremium()
  const [deadline, setDeadline] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [trimmed, setTrimmed] = useState(null) // { count, freedBytes } après trim Pro
  const purgingRef = useRef(false)

  // Réagit au palier : arme/désarme la grâce (Gratuit) ou rogne les plus gros
  // fichiers (Pro). Plan payant → on efface toute échéance en cours.
  useEffect(() => {
    let cancelled = false
    async function run() {
      if (tier !== 'gratuit') {
        localStorage.removeItem(GRACE_DEADLINE_KEY)
        if (!cancelled) setDeadline(null)
        if (tier === 'pro') {
          try {
            const res = await enforceCloudQuotaByLargest(CLOUD_QUOTA_BYTES_BY_TIER.pro)
            if (!cancelled && res.deleted.length) {
              setTrimmed({ count: res.deleted.length, freedBytes: res.freedBytes })
              window.dispatchEvent(new CustomEvent('jacsuite:cloudFilesChanged'))
            }
          } catch { /* best-effort */ }
        }
        return
      }
      // Gratuit : si des fichiers existent, (ré)arme le compte à rebours.
      try {
        const usage = await getStorageUsage()
        if (cancelled) return
        if ((usage.fileCount || 0) > 0) {
          let dl = Number(localStorage.getItem(GRACE_DEADLINE_KEY)) || 0
          if (!dl) {
            dl = Date.now() + CLOUD_GRACE_PERIOD_MS
            localStorage.setItem(GRACE_DEADLINE_KEY, String(dl))
          }
          setDeadline(dl)
        } else {
          localStorage.removeItem(GRACE_DEADLINE_KEY)
          setDeadline(null)
        }
      } catch { /* best-effort */ }
    }
    run()
    return () => { cancelled = true }
  }, [tier])

  // Tick chaque seconde tant qu'une échéance est armée.
  useEffect(() => {
    if (!deadline) return undefined
    setNow(Date.now())
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [deadline])

  // Échéance atteinte → purge de tous les fichiers cloud (une seule fois).
  useEffect(() => {
    if (!deadline || now < deadline || purgingRef.current) return
    purgingRef.current = true
    ;(async () => {
      try { await deleteAllOwnCloudFiles() } catch { /* best-effort */ }
      localStorage.removeItem(GRACE_DEADLINE_KEY)
      setDeadline(null)
      purgingRef.current = false
      window.dispatchEvent(new CustomEvent('jacsuite:cloudFilesChanged'))
    })()
  }, [now, deadline])

  // Bandeau d'info après un trim Pro : auto-disparition.
  useEffect(() => {
    if (!trimmed) return undefined
    const t = setTimeout(() => setTrimmed(null), 12000)
    return () => clearTimeout(t)
  }, [trimmed])

  const graceActive = deadline && now < deadline

  if (!graceActive && !trimmed) return null

  if (graceActive) {
    return (
      <div style={wrapStyle}>
        <div style={dangerStyle} role="alert">
          <span style={iconStyle} aria-hidden="true">⏳</span>
          <div style={textStyle}>
            <strong>Tes fichiers JacPDF Cloud seront supprimés dans {formatLeft(deadline - now)}.</strong>
            <span style={subStyle}>Le plan Gratuit n'inclut pas le stockage cloud. Repasse Pro ou Premium pour tout conserver.</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      <div style={infoStyle} role="status">
        <span style={iconStyle} aria-hidden="true">🧹</span>
        <div style={textStyle}>
          <strong>{trimmed.count} fichier{trimmed.count > 1 ? 's' : ''} supprimé{trimmed.count > 1 ? 's' : ''} pour repasser sous 100 Mo.</strong>
          <span style={subStyle}>Le plan Pro est limité à 100 Mo : les fichiers les plus volumineux ont été retirés.</span>
        </div>
        <button type="button" style={closeStyle} onClick={() => setTrimmed(null)} aria-label="Fermer">×</button>
      </div>
    </div>
  )
}