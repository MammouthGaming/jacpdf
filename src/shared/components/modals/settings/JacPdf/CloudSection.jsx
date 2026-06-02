import { useState } from 'react'
import '../FullSettingsModal.css'
import FsmSelect from '../shared/FsmSelect'
import { openPremiumModal } from '@/shared/hooks/user/usePremium'

const GOOGLE_DRIVE_LOGO = new URL('../../../../../../logo/Google Drive.svg', import.meta.url).href
const JACCLOUD_LOGO = new URL('../../../../../../logo/JacCloud.svg', import.meta.url).href

// Réglages cloud — bloc unique persisté dans localStorage.jacpdf_cloudSettings.
// Chaque champ a un défaut sensé ; setCloudField patch + persiste + broadcast
// 'jacpdf_settingsChange' pour que les hooks de save (useGoogleDrive, futur
// useOneDrive) puissent relire la config sans reload.
const CLOUD_DEFAULTS = {
  defaultProvider: 'drive',        // 'drive' | 'jacpdfCloud' | 'ask'
  autoSaveEnabled: true,
  autoSaveInterval: 30,            // secondes
  autoSaveBackground: true,
  autoSaveNotification: true,
  versioningEnabled: true,
  versioningMax: 10,
  saveFormat: 'jacpdfmeta',        // 'native' | 'jacpdfmeta' | 'both'
  compressMeta: false,
  driveFolder: 'JacPDF',
  drivePrefix: false,
  driveReloadLastOnStart: false,
  driveDisablePublicSharing: true,
  jacpdfCloudEnabled: true,        // active la destination JacPDF Cloud (Export + auto-save)
  jacpdfCloudQuotaWarnRatio: 0.8,  // seuil d'avertissement quota (0-1)
  clearTokensOnClose: false,
  confirmPublicUpload: true,
  byteUnitSystem: 'fr',            // 'fr' = octets (Ko/Mo/Go) | 'en' = bytes (KB/MB/GB)
}

export default function CloudSection({ drive, cloud, onClose }) {
  const [cloudSettings, setCloudSettings] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('jacpdf_cloudSettings') || '{}')
      return { ...CLOUD_DEFAULTS, ...raw }
    } catch { return { ...CLOUD_DEFAULTS } }
  })
  const setCloudField = (key, value) => {
    setCloudSettings(prev => {
      const next = { ...prev, [key]: value }
      // Persiste seulement les overrides (diff par rapport aux défauts) pour
      // garder localStorage léger et permettre un futur changement de défaut.
      const overrides = {}
      Object.entries(next).forEach(([k, v]) => {
        if (v !== CLOUD_DEFAULTS[k]) overrides[k] = v
      })
      localStorage.setItem('jacpdf_cloudSettings', JSON.stringify(overrides))
      window.dispatchEvent(new Event('jacpdf_settingsChange'))
      return next
    })
  }
  const resetCloudSettings = () => {
    setCloudSettings({ ...CLOUD_DEFAULTS })
    localStorage.removeItem('jacpdf_cloudSettings')
    window.dispatchEvent(new Event('jacpdf_settingsChange'))
  }

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Cloud</h3>
      <p className="fsm-section-sub">Configure la sauvegarde et la synchronisation avec Google Drive et JacPDF Cloud</p>

      {/* === Provider par défaut ===================================== */}
      <h4 className="fsm-group-title">Provider par défaut</h4>
      <p className="fsm-label-sub">Choisis où JacPDF sauvegarde tes PDFs en priorité</p>
      <div className="fsm-theme-row">
        <button
          className={`fsm-theme-btn ${cloudSettings.defaultProvider === 'drive' ? 'active' : ''}`}
          onClick={() => setCloudField('defaultProvider', 'drive')}
          disabled={!drive.connected}
          title={!drive.connected ? 'Connecte Google Drive dans Compte' : ''}
        >
          <img
            className="fsm-provider-logo fsm-provider-logo-drive"
            src={GOOGLE_DRIVE_LOGO}
            alt=""
            draggable="false"
          />
          <span>Google Drive</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.defaultProvider === 'jacpdfCloud' ? 'active' : ''}`}
          onClick={() => setCloudField('defaultProvider', 'jacpdfCloud')}
          disabled={!cloud.connected || !cloudSettings.jacpdfCloudEnabled}
          title={!cloud.connected
            ? 'Connecte-toi à JacPDF pour utiliser JacPDF Cloud'
            : !cloudSettings.jacpdfCloudEnabled
              ? 'Active JacPDF Cloud plus bas dans la page'
              : ''}
        >
          <img
            className="fsm-provider-logo fsm-provider-logo-jaccloud"
            src={JACCLOUD_LOGO}
            alt=""
            draggable="false"
          />
          <span>JacPDF Cloud</span>
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

      {/* === Sauvegarde automatique ================================== */}
      <h4 className="fsm-group-title">Sauvegarde automatique</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Auto-save sur le cloud</label>
          <p className="fsm-label-sub">Sauvegarde tes modifications automatiquement chez le provider par défaut</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.autoSaveEnabled ? 'on' : ''}`}
          onClick={() => setCloudField('autoSaveEnabled', !cloudSettings.autoSaveEnabled)}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className={`fsm-field ${!cloudSettings.autoSaveEnabled ? 'fsm-perf-row-disabled' : ''}`}>
        <label className="fsm-label">Intervalle de sauvegarde</label>
        <p className="fsm-label-sub">Fréquence à laquelle JacPDF pousse les modifications vers le cloud</p>
        <FsmSelect
          value={String(cloudSettings.autoSaveInterval)}
          onChange={(v) => setCloudField('autoSaveInterval', Number(v))}
          disabled={!cloudSettings.autoSaveEnabled}
          options={[
            { value: '-1',  label: 'Toutes les modifications' },
            { value: '10',  label: 'Toutes les 10 secondes' },
            { value: '30',  label: 'Toutes les 30 secondes' },
            { value: '60',  label: 'Toutes les minutes' },
            { value: '300', label: 'Toutes les 5 minutes' },
            { value: '0',   label: 'Manuel uniquement' },
          ]}
        />
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Sauvegarde en arrière-plan</label>
          <p className="fsm-label-sub">N'affiche pas de spinner ; tu peux continuer à éditer pendant l'upload</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.autoSaveBackground ? 'on' : ''}`}
          onClick={() => setCloudField('autoSaveBackground', !cloudSettings.autoSaveBackground)}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Notification après sauvegarde</label>
          <p className="fsm-label-sub">Affiche un toast discret quand le PDF est synchronisé</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.autoSaveNotification ? 'on' : ''}`}
          onClick={() => setCloudField('autoSaveNotification', !cloudSettings.autoSaveNotification)}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      {/* === Versionnement =========================================== */}
      <h4 className="fsm-group-title">Historique des versions</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Conserver l'historique</label>
          <p className="fsm-label-sub">Permet de revenir à une version antérieure depuis le menu Historique (utilise les revisions Drive / OneDrive)</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.versioningEnabled ? 'on' : ''}`}
          onClick={() => setCloudField('versioningEnabled', !cloudSettings.versioningEnabled)}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className={`fsm-field ${!cloudSettings.versioningEnabled ? 'fsm-perf-row-disabled' : ''}`}>
        <label className="fsm-label">Nombre de versions conservées</label>
        <p className="fsm-label-sub">Au-delà, les plus anciennes sont supprimées automatiquement</p>
        <FsmSelect
          value={String(cloudSettings.versioningMax)}
          onChange={(v) => setCloudField('versioningMax', Number(v))}
          disabled={!cloudSettings.versioningEnabled}
          options={[
            { value: '5',   label: '5 versions' },
            { value: '10',  label: '10 versions' },
            { value: '25',  label: '25 versions' },
            { value: '50',  label: '50 versions' },
            { value: '-1',  label: 'Illimité' },
          ]}
        />
      </div>

      <div className="fsm-divider" />

      {/* === Format de sauvegarde ==================================== */}
      <h4 className="fsm-group-title">Format de sauvegarde</h4>
      <p className="fsm-label-sub">Comment JacPDF stocke tes annotations dans le PDF cloud. Le mode actif détermine si tes modifs sont éditables hors de JacPDF.</p>
      <div className="fsm-theme-row">
        <button
          className={`fsm-theme-btn ${cloudSettings.saveFormat === 'native' ? 'active' : ''}`}
          onClick={() => setCloudField('saveFormat', 'native')}
          title="Annotations PDF standard — visibles dans Drive Preview, Acrobat, Preview macOS, etc."
        >
          <span>PDF natif</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.saveFormat === 'jacpdfmeta' ? 'active' : ''}`}
          onClick={() => setCloudField('saveFormat', 'jacpdfmeta')}
          title="Métadonnées privées /JacPDFMeta — restauration 100% fidèle dans JacPDF, invisibles ailleurs"
        >
          <span>JacPDFMeta</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.saveFormat === 'both' ? 'active' : ''}`}
          onClick={() => setCloudField('saveFormat', 'both')}
          title="Combine les deux — compatible partout ET restauration fidèle. Taille +20%."
        >
          <span>Les deux</span>
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Compresser les métadonnées</label>
          <p className="fsm-label-sub">Applique /FlateDecode au bloc /JacPDFMeta — réduit la taille de ~70% mais légèrement plus lent à écrire</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.compressMeta ? 'on' : ''}`}
          onClick={() => setCloudField('compressMeta', !cloudSettings.compressMeta)}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      {/* === Google Drive — réglages spécifiques ===================== */}
      <h4 className="fsm-group-title">Google Drive</h4>
      <div className="fsm-account-info" style={({ marginBottom: 12, color: drive.connected ? '#22c55e' : undefined })}>
        {drive.connected ? '✓ Connecté — réglages actifs' : 'Non connecté — connecte-le dans la section Compte pour activer ces réglages'}
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Dossier de destination</label>
        <p className="fsm-label-sub">Nom du dossier créé dans Mon Drive pour ranger les PDFs sauvegardés</p>
        <input
          type="text"
          className="fsm-select"
          value={cloudSettings.driveFolder}
          onChange={(e) => setCloudField('driveFolder', e.target.value)}
          placeholder="JacPDF"
        />
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Préfixer le nom des fichiers</label>
          <p className="fsm-label-sub">Ajoute « JacPDF — » devant chaque nom à l'upload (utile pour retrouver tes fichiers dans Drive)</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.drivePrefix ? 'on' : ''}`}
          onClick={() => setCloudField('drivePrefix', !cloudSettings.drivePrefix)}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Recharger le dernier fichier au démarrage</label>
          <p className="fsm-label-sub">JacPDF ré-ouvre automatiquement le PDF Drive sur lequel tu travaillais en dernier</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.driveReloadLastOnStart ? 'on' : ''}`}
          onClick={() => setCloudField('driveReloadLastOnStart', !cloudSettings.driveReloadLastOnStart)}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Désactiver le partage public par défaut</label>
          <p className="fsm-label-sub">Force les nouveaux fichiers en mode privé même si le dossier parent est partagé publiquement</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.driveDisablePublicSharing ? 'on' : ''}`}
          onClick={() => setCloudField('driveDisablePublicSharing', !cloudSettings.driveDisablePublicSharing)}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      {/* === JacPDF Cloud =============================================
          Stockage natif via Supabase Storage (bucket pdfs-cloud).
          La connexion suit la session Supabase ; aucun OAuth dédié —
          l'utilisateur se connecte via l'écran d'auth principal.
          Quota free tier = 1 GB ; barre colorée selon l'utilisation
          (vert < 50%, orange < seuil, rouge >= seuil). */}
      <h4 className="fsm-group-title">JacPDF Cloud</h4>
      {(() => {
        // Quota par palier (exposé par useJacpdfCloud) : Gratuit bloqué,
        // Pro 100 Mo, Premium illimité. Fallback 1 Go si non exposé.
        const quotaBytes = typeof cloud.quotaBytes === 'number' ? cloud.quotaBytes : 1024 ** 3
        const unlimited = quotaBytes === Infinity
        const cloudLocked = !!cloud.cloudLocked
        const usedBytes = cloud.usage?.totalBytes ?? 0
        const ratio = typeof cloud.quotaUsedRatio === 'number'
          ? cloud.quotaUsedRatio
          : (unlimited ? 0 : usedBytes / quotaBytes)
        const pct = unlimited ? 0 : Math.min(100, Math.round(ratio * 100))
        // Unités d'affichage configurables (Cloud > Unités d'affichage)
        const useFrUnits = cloudSettings.byteUnitSystem !== 'en'
        const unitMB = useFrUnits ? 'Mo' : 'MB'
        const usedMb = (usedBytes / (1024 * 1024)).toFixed(1)
        const limitMb = unlimited ? '∞' : (quotaBytes / (1024 * 1024)).toFixed(0)
        // Couleur selon le ratio : vert < 50%, orange < seuil, rouge >= seuil.
        const warnRatio = cloudSettings.jacpdfCloudQuotaWarnRatio || 0.8
        const barColor = ratio < 0.5 ? '#22c55e'
          : ratio < warnRatio ? '#f59e0b'
          : '#ef4444'
        return (
          <>
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
                ? '✓ Connecté — stockage natif JacPDF (Supabase)'
                : "Non connecté — connecte-toi à JacPDF dans l'écran principal pour activer le stockage cloud."}
            </div>
            {cloudLocked && (
              <div className="fsm-field">
                <p className="fsm-label-sub" style={({ color: '#f59e0b' })}>
                  🔒 Le stockage JacPDF Cloud est réservé aux plans Pro (100 Mo) et Premium (illimité).
                </p>
                <button className="fsm-action-btn" onClick={() => openPremiumModal('cloud_sync')}>
                  Passer au plan supérieur
                </button>
              </div>
            )}
            {cloud.connected && !cloudLocked && (
              <div className="fsm-field">
                <label className="fsm-label">Utilisation</label>
                <p className="fsm-label-sub">{unlimited ? `${usedMb} ${unitMB} · illimité` : `${usedMb} ${unitMB} sur ${limitMb} ${unitMB} (${pct}%)`}</p>
                <div style={({
                  width: '100%',
                  height: 8,
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: 999,
                  overflow: 'hidden',
                  marginTop: 6,
                })}>
                  <div style={({
                    width: pct + '%',
                    height: '100%',
                    background: barColor,
                    borderRadius: 999,
                    transition: 'width 0.3s, background 0.3s',
                  })} />
                </div>
                {ratio >= warnRatio && (
                  <p className="fsm-label-sub" style={({ color: barColor, marginTop: 6 })}>
                    ⚠️ Tu approches de la limite — supprime des fichiers ou passe en Pro.
                  </p>
                )}
              </div>
            )}
            <div className="fsm-toggle-row">
              <div>
                <label className="fsm-label">JacPDF Cloud activé</label>
                <p className="fsm-label-sub">Active la destination JacPDF Cloud dans le menu Export et l'auto-save</p>
              </div>
              <button
                className={`fsm-toggle ${cloudSettings.jacpdfCloudEnabled ? 'on' : ''}`}
                onClick={() => setCloudField('jacpdfCloudEnabled', !cloudSettings.jacpdfCloudEnabled)}
              >
                <span className="fsm-toggle-thumb" />
              </button>
            </div>
            <button
              className="fsm-action-btn"
              onClick={() => {
                // Ouvre le picker JacPDF Cloud en mode liste. L'écouteur
                // est branché côté HomeContent / App pour afficher la
                // modal JacpdfCloudFilePicker.
                window.dispatchEvent(new Event('jacpdf_openCloudPicker'))
                onClose()
              }}
              disabled={!cloud.connected}
              title={cloud.connected ? 'Ouvrir le gestionnaire de fichiers JacPDF Cloud' : 'Connecte-toi pour gérer tes fichiers'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7"/>
                <path d="M3 7l3-4h12l3 4"/>
                <line x1="3" y1="7" x2="21" y2="7"/>
                <line x1="9" y1="11" x2="15" y2="11"/>
              </svg>
              Gérer mes fichiers
            </button>
          </>
        )
      })()}

      <div className="fsm-divider" />

      {/* === Unités d'affichage ====================================== */}
      <h4 className="fsm-group-title">Unités d'affichage</h4>
      <p className="fsm-label-sub">Choisis comment afficher les tailles de fichiers (quota cloud, taille des PDFs, etc.)</p>
      <div className="fsm-theme-row">
        <button
          className={`fsm-theme-btn ${cloudSettings.byteUnitSystem === 'fr' ? 'active' : ''}`}
          onClick={() => setCloudField('byteUnitSystem', 'fr')}
          title="Octets (Ko, Mo, Go) — convention française"
        >
          <span>Mo / Go (français)</span>
        </button>
        <button
          className={`fsm-theme-btn ${cloudSettings.byteUnitSystem === 'en' ? 'active' : ''}`}
          onClick={() => setCloudField('byteUnitSystem', 'en')}
          title="Bytes (KB, MB, GB) — convention anglaise"
        >
          <span>MB / GB (anglais)</span>
        </button>
      </div>

      <div className="fsm-divider" />

      {/* === Confidentialité ========================================= */}
      <h4 className="fsm-group-title">Confidentialité & sécurité</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Effacer les tokens à la fermeture</label>
          <p className="fsm-label-sub">Force une re-connexion à chaque session — plus sécurisé sur appareil partagé</p>
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
          <label className="fsm-label">Confirmer avant upload public</label>
          <p className="fsm-label-sub">Demande validation si le fichier va être uploadé dans un dossier partagé publiquement</p>
        </div>
        <button
          className={`fsm-toggle ${cloudSettings.confirmPublicUpload ? 'on' : ''}`}
          onClick={() => setCloudField('confirmPublicUpload', !cloudSettings.confirmPublicUpload)}
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