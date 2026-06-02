import { useEffect, useState } from 'react'
import FsmSelect from '../shared/FsmSelect'
import '../FullSettingsModal.css'
import { useJacTacheCloud } from '@/apps/jactache/hooks/cloud/useJacTacheCloud'

const JACCLOUD_LOGO = new URL('../../../../../../logo/JacCloud.svg', import.meta.url).href

// Réglages cloud JacTâche — bloc unique persisté dans localStorage.jactache_cloudSettings.
// Même pattern que JacPDF : setCloudField patch + persiste les overrides (diff vs défaut)
// + broadcast 'jactache_settingsChange' pour que les hooks (sync, scheduler) puissent
// relire la config sans reload.
const CLOUD_DEFAULTS = {
  defaultProvider: 'jacsuite',     // 'jacsuite' | 'local' | 'google' | 'apple' | 'ask'
  autoSyncEnabled: true,
  autoSyncInterval: 0,             // 0 = immédiat (realtime), n>0 = secondes, -1 = manuel
  autoSyncNotification: false,
  versioningEnabled: true,
  versioningMax: 25,
  conflictMode: 'ask',             // 'ask' | 'keep-both' | 'latest' | 'mine' | 'cloud'
  offlineCopy: true,
  syncCompletedTasks: true,        // si false, ne pousse pas les tâches done (économie quota)
  syncArchivedProjects: false,
  clearTokensOnClose: false,
  confirmDeleteSync: true,         // demande confirmation avant de supprimer un projet partagé
}

export default function CloudSection({ cloud: cloudProp, onClose, onNavigateToSection }) {
  // Soit le parent injecte le hook (test/storybook), soit on l'instancie ici.
  const cloudHook = useJacTacheCloud()
  const cloud = cloudProp || cloudHook

  const [cloudSettings, setCloudSettings] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('jactache_cloudSettings') || '{}')
      return { ...CLOUD_DEFAULTS, ...raw }
    } catch { return { ...CLOUD_DEFAULTS } }
  })
  const [stats, setStats] = useState({ projects: 0, tasks: 0, completedTasks: 0 })
  const [statsLoading, setStatsLoading] = useState(false)

  const setCloudField = (key, value) => {
    setCloudSettings(prev => {
      const next = { ...prev, [key]: value }
      const overrides = {}
      Object.entries(next).forEach(([k, v]) => {
        if (v !== CLOUD_DEFAULTS[k]) overrides[k] = v
      })
      localStorage.setItem('jactache_cloudSettings', JSON.stringify(overrides))
      window.dispatchEvent(new Event('jactache_settingsChange'))
      return next
    })
  }
  const resetCloudSettings = () => {
    setCloudSettings({ ...CLOUD_DEFAULTS })
    localStorage.removeItem('jactache_cloudSettings')
    window.dispatchEvent(new Event('jactache_settingsChange'))
  }

  // Lazy-load des stats une fois connecté
  useEffect(() => {
    if (!cloud?.connected) {
      setStats({ projects: 0, tasks: 0, completedTasks: 0 })
      return
    }
    let cancelled = false
    setStatsLoading(true)
    Promise.all([
      cloud.projects.list().catch(() => []),
      cloud.tasks.list().catch(() => []),
    ]).then(([projects, tasks]) => {
      if (cancelled) return
      const completed = tasks.filter((t) => t.status === 'done').length
      setStats({ projects: projects.length, tasks: tasks.length, completedTasks: completed })
    }).finally(() => { if (!cancelled) setStatsLoading(false) })
    return () => { cancelled = true }
  }, [cloud])

  const isLocal = cloudSettings.defaultProvider === 'local'

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Cloud</h3>
      <p className="fsm-section-sub">Synchronise tes projets et tâches entre tous tes appareils via JacSuite Cloud (Supabase).</p>

      {/* === Provider par défaut ===================================== */}
      <h4 className="fsm-group-title">Provider par défaut</h4>
      <p className="fsm-label-sub">Choisis où JacTâche stocke tes projets en priorité</p>
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
          title="Aucune synchro — tout reste dans le navigateur (IndexedDB / localStorage)"
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
          title="Bientôt — sync bidirectionnelle avec Google Tasks"
        >
          <span>Google Tasks (bientôt)</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.defaultProvider === 'apple' ? 'active' : ''}`}
          onClick={() => setCloudField('defaultProvider', 'apple')}
          disabled
          title="Bientôt — sync avec Apple Rappels"
        >
          <span>Apple Rappels (bientôt)</span>
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
              : `${stats.projects} projet${stats.projects > 1 ? 's' : ''} · ${stats.tasks} tâche${stats.tasks > 1 ? 's' : ''} (dont ${stats.completedTasks} terminée${stats.completedTasks > 1 ? 's' : ''})`}
          </p>
        </div>
      )}

      <button
        className="fsm-action-btn"
        onClick={() => {
          window.dispatchEvent(new Event('jactache_openCloudPicker'))
          onClose?.()
        }}
        disabled={!cloud.connected}
        title={cloud.connected ? 'Ouvrir le gestionnaire de projets cloud' : 'Connecte-toi pour gérer tes données'}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7"/>
          <path d="M3 7l3-4h12l3 4"/>
          <line x1="3" y1="7" x2="21" y2="7"/>
          <line x1="9" y1="11" x2="15" y2="11"/>
        </svg>
        Gérer mes projets cloud
      </button>

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
          <p className="fsm-label-sub">Affiche un toast discret quand un projet ou une tâche est poussé dans le cloud</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.autoSyncNotification ? 'on' : ''}`}
          onClick={() => setCloudField('autoSyncNotification', !cloudSettings.autoSyncNotification)}
          disabled={isLocal}
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
          <p className="fsm-label-sub">Permet de revenir à une version antérieure d’une tâche (via le champ revision)</p>
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
        <p className="fsm-label-sub">Au-delà, les plus anciennes sont élaguées automatiquement par batch nocturne</p>
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
      <p className="fsm-label-sub">Comportement quand la même tâche a été modifiée sur deux appareils à la fois.</p>
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
          title="Garde les deux versions — la mienne devient « Tâche (copie locale) »"
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

      {/* === Optimisations / portée de la sync ====================== */}
      <h4 className="fsm-group-title">Portée de la synchronisation</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Synchroniser les tâches terminées</label>
          <p className="fsm-label-sub">Désactiver pour alléger le cloud quand tu accumules beaucoup d’archives</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.syncCompletedTasks ? 'on' : ''}`}
          onClick={() => setCloudField('syncCompletedTasks', !cloudSettings.syncCompletedTasks)}
          disabled={isLocal}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Synchroniser les projets archivés</label>
          <p className="fsm-label-sub">Garde les projets archivés accessibles depuis tous tes appareils</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.syncArchivedProjects ? 'on' : ''}`}
          onClick={() => setCloudField('syncArchivedProjects', !cloudSettings.syncArchivedProjects)}
          disabled={isLocal}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Copie hors ligne</label>
          <p className="fsm-label-sub">Conserve une copie locale complète pour bosser sans connexion (resync au retour)</p>
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
          <label className="fsm-label">Confirmer la suppression de projets partagés</label>
          <p className="fsm-label-sub">Demande validation avant de supprimer un projet où d’autres personnes ont accès</p>
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