import { useEffect, useState } from 'react'
import FsmSelect from '../shared/FsmSelect'
import '../FullSettingsModal.css'
import { useJacCalendrierCloud } from '@/apps/jaccalendrier/hooks/cloud/useJacCalendrierCloud'

const JACCLOUD_LOGO = new URL('../../../../../../logo/JacCloud.svg', import.meta.url).href
const GOOGLE_CAL_LOGO = new URL('../../../../../../logo/Google Calendar.svg', import.meta.url).href
const APPLE_CAL_LOGO = new URL('../../../../../../logo/Apple Calendar.svg', import.meta.url).href

// Réglages cloud JacCalendrier — même pattern que JacPDF / JacTâche.
// Persiste les overrides dans localStorage.jaccalendrier_cloudSettings
// + broadcast 'jaccalendrier_settingsChange' pour les hooks de sync / scheduler.
const CLOUD_DEFAULTS = {
  defaultProvider: 'jacsuite',       // 'jacsuite' | 'local' | 'google' | 'apple' | 'caldav' | 'ask'
  autoSyncEnabled: true,
  autoSyncInterval: 0,               // 0 = immédiat (realtime), n>0 = secondes, -1 = manuel
  autoSyncNotification: false,
  versioningEnabled: true,
  versioningMax: 25,
  conflictMode: 'ask',
  offlineCopy: true,
  syncPastEvents: true,              // si false, ne pousse pas les événements passés (économie quota)
  pastEventsHorizonDays: 365,        // au-delà, on n’aspire pas dans le cache iCal
  clearTokensOnClose: false,
  confirmDeleteSync: true,
  icalRespectRefreshMinutes: true,   // si false, on suit autoSyncInterval pour les iCal aussi
}

export default function CloudSection({ cloud: cloudProp, onClose, onNavigateToSection }) {
  const cloudHook = useJacCalendrierCloud()
  const cloud = cloudProp || cloudHook

  const [cloudSettings, setCloudSettings] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('jaccalendrier_cloudSettings') || '{}')
      return { ...CLOUD_DEFAULTS, ...raw }
    } catch { return { ...CLOUD_DEFAULTS } }
  })
  const [stats, setStats] = useState({ calendars: 0, events: 0, subscriptions: 0 })
  const [statsLoading, setStatsLoading] = useState(false)

  const setCloudField = (key, value) => {
    setCloudSettings(prev => {
      const next = { ...prev, [key]: value }
      const overrides = {}
      Object.entries(next).forEach(([k, v]) => {
        if (v !== CLOUD_DEFAULTS[k]) overrides[k] = v
      })
      localStorage.setItem('jaccalendrier_cloudSettings', JSON.stringify(overrides))
      window.dispatchEvent(new Event('jaccalendrier_settingsChange'))
      return next
    })
  }
  const resetCloudSettings = () => {
    setCloudSettings({ ...CLOUD_DEFAULTS })
    localStorage.removeItem('jaccalendrier_cloudSettings')
    window.dispatchEvent(new Event('jaccalendrier_settingsChange'))
  }

  useEffect(() => {
    if (!cloud?.connected) {
      setStats({ calendars: 0, events: 0, subscriptions: 0 })
      return
    }
    let cancelled = false
    setStatsLoading(true)
    Promise.all([
      cloud.calendars.list().catch(() => []),
      cloud.events.list().catch(() => []),
      cloud.icalSubscriptions.list().catch(() => []),
    ]).then(([calendars, events, subs]) => {
      if (cancelled) return
      setStats({ calendars: calendars.length, events: events.length, subscriptions: subs.length })
    }).finally(() => { if (!cancelled) setStatsLoading(false) })
    return () => { cancelled = true }
  }, [cloud])

  const isLocal = cloudSettings.defaultProvider === 'local'

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Cloud</h3>
      <p className="fsm-section-sub">Synchronise tes calendriers et événements entre tous tes appareils via JacSuite Cloud (Supabase).</p>

      {/* === Provider par défaut ===================================== */}
      <h4 className="fsm-group-title">Provider par défaut</h4>
      <p className="fsm-label-sub">Choisis où JacCalendrier stocke tes calendriers en priorité</p>
      <div className="fsm-theme-row">
        <button
          className={`fsm-theme-btn ${cloudSettings.defaultProvider === 'jacsuite' ? 'active' : ''}`}
          onClick={() => setCloudField('defaultProvider', 'jacsuite')}
          disabled={!cloud.connected}
          title={!cloud.connected ? 'Connecte-toi à JacSuite pour utiliser le cloud' : ''}
        >
          <img
            className="fsm-provider-logo fsm-provider-logo-jaccloud"
            src={JACCLOUD_LOGO}
            alt=""
            draggable="false"
          />
          <span>JacSuite Cloud</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.defaultProvider === 'local' ? 'active' : ''}`}
          onClick={() => setCloudField('defaultProvider', 'local')}
          title="Aucune synchro — tout reste dans le navigateur"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="5" width="20" height="14" rx="2"/>
            <line x1="7" y1="9" x2="7" y2="15"/>
          </svg>
          <span>Local seulement</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.defaultProvider === 'google' ? 'active' : ''}`}
          onClick={() => setCloudField('defaultProvider', 'google')}
          disabled
          title="Bientôt — OAuth Google Calendar"
        >
          <img
            className="fsm-provider-logo fsm-provider-logo-google-calendar"
            src={GOOGLE_CAL_LOGO}
            alt=""
            draggable="false"
          />
          <span>Google Calendar (bientôt)</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.defaultProvider === 'apple' ? 'active' : ''}`}
          onClick={() => setCloudField('defaultProvider', 'apple')}
          disabled
          title="Bientôt — CalDAV iCloud"
        >
          <img
            className="fsm-provider-logo fsm-provider-logo-apple-calendar"
            src={APPLE_CAL_LOGO}
            alt=""
            draggable="false"
          />
          <span>Apple Calendar (bientôt)</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.defaultProvider === 'caldav' ? 'active' : ''}`}
          onClick={() => setCloudField('defaultProvider', 'caldav')}
          disabled
          title="Bientôt — URL CalDAV personnalisée"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>CalDAV (bientôt)</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.defaultProvider === 'ask' ? 'active' : ''}`}
          onClick={() => setCloudField('defaultProvider', 'ask')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>Demander</span>
        </button>
      </div>

      <div className="fsm-divider" />

      {/* === État de la connexion + stats =========================== */}
      <h4 className="fsm-group-title">JacSuite Cloud</h4>
      <div
        className="fsm-account-info"
        style={({
          marginBottom: 12,
          background: cloud.connected ? 'rgba(57, 255, 20, 0.08)' : undefined,
          color: cloud.connected ? '#39FF14' : undefined,
          border: cloud.connected ? '1px solid rgba(57, 255, 20, 0.3)' : undefined,
        })}
      >
        {cloud.connected
          ? '✓ Connecté — sync temps réel activée'
          : 'Non connecté — connecte-toi à JacSuite dans l’écran principal pour activer le cloud.'}
      </div>

      {cloud.connected && (
        <div className="fsm-field">
          <label className="fsm-label">Données synchronisées</label>
          <p className="fsm-label-sub">
            {statsLoading
              ? 'Chargement…'
              : `${stats.calendars} calendrier${stats.calendars > 1 ? 's' : ''} · ${stats.events} événement${stats.events > 1 ? 's' : ''} · ${stats.subscriptions} abonnement${stats.subscriptions > 1 ? 's' : ''} iCal`}
          </p>
        </div>
      )}

      <button
        className="fsm-action-btn"
        onClick={() => {
          window.dispatchEvent(new Event('jaccalendrier_openCloudPicker'))
          onClose?.()
        }}
        disabled={!cloud.connected}
        title={cloud.connected ? 'Ouvrir le gestionnaire de calendriers cloud' : 'Connecte-toi pour gérer tes données'}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        Gérer mes calendriers cloud
      </button>
      {onNavigateToSection && stats.subscriptions > 0 && (
        <button
          className="fsm-action-btn fsm-action-btn-inline"
          onClick={() => onNavigateToSection('sources')}
          title="Ouvrir la section Sources externes"
          style={({ marginLeft: 8 })}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          Gérer mes abonnements iCal
        </button>
      )}

      <div className="fsm-divider" />

      {/* === Synchronisation automatique ============================ */}
      <h4 className="fsm-group-title">Synchronisation automatique</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Auto-sync activé</label>
          <p className="fsm-label-sub">Pousse les changements vers JacSuite Cloud dès qu’ils sont faits</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.autoSyncEnabled ? 'on' : ''}`}
          onClick={() => setCloudField('autoSyncEnabled', !cloudSettings.autoSyncEnabled)}
          disabled={isLocal}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className={`fsm-field ${(!cloudSettings.autoSyncEnabled || isLocal) ? 'fsm-perf-row-disabled' : ''}`}>
        <label className="fsm-label">Fréquence de synchronisation</label>
        <p className="fsm-label-sub">Délai entre deux pushes vers le cloud (le realtime pousse immédiatement)</p>
        <FsmSelect
          value={String(cloudSettings.autoSyncInterval)}
          onChange={(v) => setCloudField('autoSyncInterval', Number(v))}
          disabled={!cloudSettings.autoSyncEnabled || isLocal}
          options={[
            { value: '0',   label: 'Immédiat (realtime)' },
            { value: '30',  label: 'Toutes les 30 secondes' },
            { value: '60',  label: 'Toutes les minutes' },
            { value: '300', label: 'Toutes les 5 minutes' },
            { value: '-1',  label: 'Manuel uniquement' },
          ]}
        />
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Notification après synchronisation</label>
          <p className="fsm-label-sub">Affiche un toast discret quand un calendrier ou événement est poussé dans le cloud</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.autoSyncNotification ? 'on' : ''}`}
          onClick={() => setCloudField('autoSyncNotification', !cloudSettings.autoSyncNotification)}
          disabled={isLocal}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Respecter l’intervalle iCal individuel</label>
          <p className="fsm-label-sub">Quand activé, chaque abonnement iCal utilise son propre refresh_minutes ; sinon, ils suivent l’intervalle global ci-dessus</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.icalRespectRefreshMinutes ? 'on' : ''}`}
          onClick={() => setCloudField('icalRespectRefreshMinutes', !cloudSettings.icalRespectRefreshMinutes)}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      {/* === Versionnement =========================================== */}
      <h4 className="fsm-group-title">Historique des versions</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Conserver l’historique</label>
          <p className="fsm-label-sub">Permet de revenir à une version antérieure d’un événement (via le champ revision)</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.versioningEnabled ? 'on' : ''}`}
          onClick={() => setCloudField('versioningEnabled', !cloudSettings.versioningEnabled)}
          disabled={isLocal}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className={`fsm-field ${(!cloudSettings.versioningEnabled || isLocal) ? 'fsm-perf-row-disabled' : ''}`}>
        <label className="fsm-label">Nombre de versions conservées</label>
        <p className="fsm-label-sub">Au-delà, les plus anciennes sont élaguées automatiquement</p>
        <FsmSelect
          value={String(cloudSettings.versioningMax)}
          onChange={(v) => setCloudField('versioningMax', Number(v))}
          disabled={!cloudSettings.versioningEnabled || isLocal}
          options={[
            { value: '10',  label: '10 versions' },
            { value: '25',  label: '25 versions' },
            { value: '50',  label: '50 versions' },
            { value: '100', label: '100 versions' },
            { value: '-1',  label: 'Illimité' },
          ]}
        />
      </div>

      <div className="fsm-divider" />

      {/* === Résolution de conflits ================================= */}
      <h4 className="fsm-group-title">Résolution des conflits</h4>
      <p className="fsm-label-sub">Comportement quand le même événement a été modifié sur deux appareils à la fois.</p>
      <div className="fsm-theme-row">
        <button
          className={`fsm-theme-btn ${cloudSettings.conflictMode === 'ask' ? 'active' : ''}`}
          onClick={() => setCloudField('conflictMode', 'ask')}
        >
          <span>Me demander</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.conflictMode === 'keep-both' ? 'active' : ''}`}
          onClick={() => setCloudField('conflictMode', 'keep-both')}
          title="Garde les deux versions — la mienne devient « Événement (copie locale) »"
        >
          <span>Garder les deux</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.conflictMode === 'latest' ? 'active' : ''}`}
          onClick={() => setCloudField('conflictMode', 'latest')}
          title="Compare les timestamps updated_at"
        >
          <span>Plus récente</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.conflictMode === 'mine' ? 'active' : ''}`}
          onClick={() => setCloudField('conflictMode', 'mine')}
          title="Pousse ma version locale en écrasant le cloud"
        >
          <span>Garder la mienne</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.conflictMode === 'cloud' ? 'active' : ''}`}
          onClick={() => setCloudField('conflictMode', 'cloud')}
          title="Pull la version cloud en écrasant le local"
        >
          <span>Garder le cloud</span>
        </button>
      </div>

      <div className="fsm-divider" />

      {/* === Optimisations / portée =================================== */}
      <h4 className="fsm-group-title">Portée de la synchronisation</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Synchroniser les événements passés</label>
          <p className="fsm-label-sub">Désactive pour alléger le cloud quand tu accumules des années d’historique</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.syncPastEvents ? 'on' : ''}`}
          onClick={() => setCloudField('syncPastEvents', !cloudSettings.syncPastEvents)}
          disabled={isLocal}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className={`fsm-field ${(!cloudSettings.syncPastEvents || isLocal) ? 'fsm-perf-row-disabled' : ''}`}>
        <label className="fsm-label">Horizon des événements passés</label>
        <p className="fsm-label-sub">Au-delà de cette durée, les événements passés ne sont plus synchronisés avec les sources externes (iCal)</p>
        <FsmSelect
          value={String(cloudSettings.pastEventsHorizonDays)}
          onChange={(v) => setCloudField('pastEventsHorizonDays', Number(v))}
          disabled={!cloudSettings.syncPastEvents || isLocal}
          options={[
            { value: '30',  label: '30 derniers jours' },
            { value: '90',  label: '3 derniers mois' },
            { value: '365', label: '12 derniers mois' },
            { value: '730', label: '2 dernières années' },
            { value: '-1',  label: 'Toute la durée' },
          ]}
        />
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Copie hors ligne</label>
          <p className="fsm-label-sub">Conserve une copie locale complète pour consulter sans connexion</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.offlineCopy ? 'on' : ''}`}
          onClick={() => setCloudField('offlineCopy', !cloudSettings.offlineCopy)}
          disabled={isLocal}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      {/* === Confidentialité ======================================== */}
      <h4 className="fsm-group-title">Confidentialité & sécurité</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Effacer les tokens à la fermeture</label>
          <p className="fsm-label-sub">Force une re-connexion à chaque session — plus sûr sur appareil partagé</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.clearTokensOnClose ? 'on' : ''}`}
          onClick={() => setCloudField('clearTokensOnClose', !cloudSettings.clearTokensOnClose)}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Confirmer la suppression de calendriers partagés</label>
          <p className="fsm-label-sub">Demande validation avant de supprimer un calendrier où d’autres personnes ont accès</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.confirmDeleteSync ? 'on' : ''}`}
          onClick={() => setCloudField('confirmDeleteSync', !cloudSettings.confirmDeleteSync)}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />
      <button
        className="fsm-action-btn fsm-action-btn-inline"
        onClick={resetCloudSettings}
        title="Restaurer toutes les valeurs cloud par défaut"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1 4 1 10 7 10"/>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
        </svg>
        Réinitialiser les réglages cloud
      </button>
    </div>
  )
}