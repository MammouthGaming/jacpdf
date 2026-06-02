import { useState, useEffect } from 'react'
import '../FullSettingsModal.css'
import FsmSelect from '../shared/FsmSelect'
import { performanceStore } from '@/shared/stores/system/performanceStore'

// Métadonnées des 3 presets perf — icône, label, description courte. Les
// valeurs concrètes (renderQuality, historyLimit, etc.) vivent dans
// performanceStore._PRESETS — ici on ne fait que présenter les choix UX.
const PERF_PRESETS = [
  {
    id: 'beauty',
    icon: '🎨',
    name: 'Beauté',
    desc: 'Qualité de rendu maximale, toutes les animations activées. Idéal sur appareil récent et branché.',
  },
  {
    id: 'balanced',
    icon: '⚖️',
    name: 'Équilibré',
    desc: 'Compromis recommandé entre fluidité et qualité. Bon défaut pour la plupart des usages.',
  },
  {
    id: 'performance',
    icon: '⚡',
    name: 'Performance',
    desc: 'Animations désactivées, rendu allégé. Réactivité et autonomie maximales sur appareil modeste.',
  },
]

export default function PerformanceSection() {
  // Preset performance courant (Lot 7) — 'beauty' | 'balanced' | 'performance' |
  // 'custom'. On lit le preset BRUT (pas l'état résolu) parce qu'ici on
  // affiche juste la carte sélectionnée + le badge « Personnalisé ».
  const [rawPreset, setRawPreset] = useState(() => performanceStore.getRawPreset())
  // Settings résolus = preset + overrides + standalones. Source de vérité pour
  // la valeur affichée par chaque control de la section avancée. Une seule
  // subscription qui met à jour les deux states ensemble.
  const [perfSettings, setPerfSettings] = useState(() => performanceStore.get())
  useEffect(() => performanceStore.subscribe(() => {
    setRawPreset(performanceStore.getRawPreset())
    setPerfSettings(performanceStore.get())
  }), [])

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Avancé</h3>
      <p className="fsm-section-sub">Performance, rendu, mémoire et fluidité de JacPDF</p>
      <div className="fsm-perf-warning">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div>
          <p className="fsm-perf-warning-title">Section avancée</p>
          <p className="fsm-perf-warning-text">
            Cette page est dédiée aux utilisateurs avancés et n'est pas conseillée à tout le monde. Modifier ces réglages peut affecter la qualité visuelle, la fluidité ou la consommation mémoire de JacPDF. En cas de doute, garde le preset <strong>Équilibré</strong> (par défaut).
          </p>
        </div>
      </div>
      {rawPreset === 'custom' && (
        <div className="fsm-perf-custom-badge">
          <span>Réglages personnalisés actifs</span>
          <button
            className="fsm-perf-custom-reset"
            onClick={() => performanceStore.reset()}
            title="Restaurer le preset Équilibré et effacer les overrides"
          >
            Réinitialiser
          </button>
        </div>
      )}
      <div className="fsm-field">
        <label className="fsm-label">Mode de performance</label>
        <p className="fsm-label-sub">Choisis un preset, ou personnalise chaque réglage individuellement plus bas (à venir).</p>
        <div className="fsm-perf-presets">
          {PERF_PRESETS.map(p => (
            <button
              key={p.id}
              className={`fsm-perf-preset-card ${rawPreset === p.id ? 'active' : ''}`}
              onClick={() => performanceStore.setPreset(p.id)}
            >
              <div className="fsm-perf-preset-icon">{p.icon}</div>
              <div className="fsm-perf-preset-name">{p.name}</div>
              <div className="fsm-perf-preset-desc">{p.desc}</div>
              {rawPreset === p.id && (
                <div className="fsm-perf-preset-check">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="fsm-divider" />
      <h4 className="fsm-group-title">Réglages détaillés</h4>
      <p className="fsm-label-sub">Modifie chaque réglage individuellement. Toute modification bascule automatiquement le preset sur « Personnalisé ».</p>

      {/* === Rendu PDF ===================================== */}
      <details className="fsm-perf-details">
        <summary className="fsm-perf-detail-summary">
          <span className="fsm-perf-detail-icon">📄</span>
          <span className="fsm-perf-detail-title">Rendu PDF</span>
          <svg className="fsm-perf-detail-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </summary>
        <div className="fsm-perf-detail-content">
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Qualité de rendu</span>
              <span className="fsm-perf-row-desc">Multiplicateur appliqué au DPI lors du rendu d'une page. Plus c'est haut, plus c'est net mais lent.</span>
            </div>
            <FsmSelect
              value={String(perfSettings.renderQuality)}
              onChange={(v) => performanceStore.setOverride('renderQuality', Number(v))}
              options={[
                { value: '1',   label: 'Basse (×1)' },
                { value: '1.5', label: 'Moyenne (×1.5)' },
                { value: '2',   label: 'Bonne (×2)' },
                { value: '2.5', label: 'Haute (×2.5)' },
                { value: '3',   label: 'Maximale (×3)' },
              ]}
            />
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Lissage des images</span>
              <span className="fsm-perf-row-desc">Active <code>imageSmoothingEnabled</code> sur le canvas — texte et bitmaps plus doux mais légèrement flous au pixel près.</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.imageSmoothing ? 'on' : ''}`}
              onClick={() => performanceStore.setOverride('imageSmoothing', !perfSettings.imageSmoothing)}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Re-rendre au zoom</span>
              <span className="fsm-perf-row-desc">Recalcule le canvas à chaque palier de zoom. Désactivé = upscale CSS uniquement (plus rapide mais flou en zoom élevé).</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.rerenderOnZoom ? 'on' : ''}`}
              onClick={() => performanceStore.setOverride('rerenderOnZoom', !perfSettings.rerenderOnZoom)}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Pages pré-rendues hors écran</span>
              <span className="fsm-perf-row-desc">Nombre de pages rendues en avance autour de la page visible. Plus haut = scroll plus fluide mais plus de RAM.</span>
            </div>
            <FsmSelect
              value={String(perfSettings.viewportBuffer)}
              onChange={(v) => performanceStore.setOverride('viewportBuffer', Number(v))}
              options={[
                { value: '1', label: '1 page' },
                { value: '2', label: '2 pages' },
                { value: '3', label: '3 pages' },
                { value: '4', label: '4 pages' },
                { value: '5', label: '5 pages' },
              ]}
            />
          </div>
        </div>
      </details>

      {/* === Onglets ======================================= */}
      <details className="fsm-perf-details">
        <summary className="fsm-perf-detail-summary">
          <span className="fsm-perf-detail-icon">📑</span>
          <span className="fsm-perf-detail-title">Onglets</span>
          <svg className="fsm-perf-detail-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </summary>
        <div className="fsm-perf-detail-content">
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Suspendre les onglets inactifs</span>
              <span className="fsm-perf-row-desc">Libère les ressources d'un onglet qu'on n'a pas regardé depuis un moment. Il se recharge automatiquement quand on y revient.</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.suspendInactiveTabs ? 'on' : ''}`}
              onClick={() => performanceStore.setOverride('suspendInactiveTabs', !perfSettings.suspendInactiveTabs)}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
          <div className={`fsm-perf-row ${!perfSettings.suspendInactiveTabs ? 'fsm-perf-row-disabled' : ''}`}>
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Délai de suspension</span>
              <span className="fsm-perf-row-desc">Combien de temps un onglet doit rester inactif avant d'être suspendu.</span>
            </div>
            <FsmSelect
              value={perfSettings.suspendDelaySec === Infinity ? 'never' : String(perfSettings.suspendDelaySec)}
              onChange={(v) => performanceStore.setOverride('suspendDelaySec', v === 'never' ? Infinity : Number(v))}
              disabled={!perfSettings.suspendInactiveTabs}
              options={[
                { value: '10',    label: '10 secondes' },
                { value: '30',    label: '30 secondes' },
                { value: '60',    label: '1 minute' },
                { value: '300',   label: '5 minutes' },
                { value: 'never', label: 'Jamais' },
              ]}
            />
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Libérer les bitmaps au changement d'onglet</span>
              <span className="fsm-perf-row-desc">Décharge les canvas de l'onglet précédent dès qu'on change. Économise la mémoire mais ré-affiche au retour.</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.releaseBitmapsOnSwitch ? 'on' : ''}`}
              onClick={() => performanceStore.setOverride('releaseBitmapsOnSwitch', !perfSettings.releaseBitmapsOnSwitch)}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Limite d'onglets ouverts</span>
              <span className="fsm-perf-row-desc">Nombre max d'onglets simultanés. Au-delà, JacPDF demande d'en fermer un avant d'en ouvrir un nouveau.</span>
            </div>
            <input
              type="number"
              className="fsm-perf-number"
              value={perfSettings.tabLimit}
              min="1"
              max="50"
              onChange={(e) => performanceStore.setStandalone('tabLimit', Number(e.target.value))}
            />
          </div>
        </div>
      </details>

      {/* === Historique ==================================== */}
      <details className="fsm-perf-details">
        <summary className="fsm-perf-detail-summary">
          <span className="fsm-perf-detail-icon">↶</span>
          <span className="fsm-perf-detail-title">Historique (Annuler / Rétablir)</span>
          <svg className="fsm-perf-detail-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </summary>
        <div className="fsm-perf-detail-content">
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Nombre d'entrées conservées</span>
              <span className="fsm-perf-row-desc">Combien d'actions tu peux annuler. Plus haut = plus de RAM consommée par l'historique.</span>
            </div>
            <FsmSelect
              value={String(perfSettings.historyLimit)}
              onChange={(v) => performanceStore.setOverride('historyLimit', Number(v))}
              options={[
                { value: '25',  label: '25' },
                { value: '50',  label: '50' },
                { value: '100', label: '100' },
                { value: '200', label: '200' },
                { value: '500', label: '500' },
              ]}
            />
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Mode de stockage</span>
              <span className="fsm-perf-row-desc"><strong>Snapshots</strong> = copie complète de l'état (rapide à restaurer, gourmand). <strong>Diffs</strong> = différences entre états (compact mais reconstruction plus lente).</span>
            </div>
            <FsmSelect
              value={perfSettings.historyStorageMode}
              onChange={(v) => performanceStore.setOverride('historyStorageMode', v)}
              options={[
                { value: 'snapshots', label: 'Snapshots' },
                { value: 'diffs',     label: 'Diffs' },
              ]}
            />
          </div>
        </div>
      </details>

      {/* === Animations & UI =============================== */}
      <details className="fsm-perf-details">
        <summary className="fsm-perf-detail-summary">
          <span className="fsm-perf-detail-icon">✨</span>
          <span className="fsm-perf-detail-title">Animations & UI</span>
          <svg className="fsm-perf-detail-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </summary>
        <div className="fsm-perf-detail-content">
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Animations & transitions</span>
              <span className="fsm-perf-row-desc">Kill-switch global. Désactivé = aucune animation dans l'interface (modals, menus, hover, etc.).</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.animationsEnabled ? 'on' : ''}`}
              onClick={() => performanceStore.setOverride('animationsEnabled', !perfSettings.animationsEnabled)}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
          <div className={`fsm-perf-row ${!perfSettings.animationsEnabled ? 'fsm-perf-row-disabled' : ''}`}>
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Vitesse des animations</span>
              <span className="fsm-perf-row-desc">Multiplicateur appliqué aux durées CSS. <strong>Instantané</strong> = 0ms, garde la logique d'apparition mais sans transition.</span>
            </div>
            <FsmSelect
              value={String(perfSettings.animationSpeed)}
              onChange={(v) => performanceStore.setOverride('animationSpeed', Number(v))}
              disabled={!perfSettings.animationsEnabled}
              options={[
                { value: '1.5', label: 'Lente (×1.5)' },
                { value: '1',   label: 'Normale (×1)' },
                { value: '0.5', label: 'Rapide (×0.5)' },
                { value: '0',   label: 'Instantané' },
              ]}
            />
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Aperçu de tracé sous le curseur</span>
              <span className="fsm-perf-row-desc">Affiche un trait fantôme pendant que tu dessines. Désactiver allège le rendu en temps réel.</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.drawingPreviewCursor ? 'on' : ''}`}
              onClick={() => performanceStore.setOverride('drawingPreviewCursor', !perfSettings.drawingPreviewCursor)}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Effets de survol sur les annotations</span>
              <span className="fsm-perf-row-desc">Halo, ombrage et grossissement au survol. Désactiver = repaint plus rare.</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.annotationHoverEffects ? 'on' : ''}`}
              onClick={() => performanceStore.setOverride('annotationHoverEffects', !perfSettings.annotationHoverEffects)}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Respecter <code>prefers-reduced-motion</code></span>
              <span className="fsm-perf-row-desc">Si l'OS demande de réduire les animations (accessibilité), JacPDF les coupe automatiquement même avec un preset Beauté.</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.respectReducedMotion ? 'on' : ''}`}
              onClick={() => performanceStore.setStandalone('respectReducedMotion', !perfSettings.respectReducedMotion)}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
        </div>
      </details>

      {/* === Recherche & OCR =============================== */}
      <details className="fsm-perf-details">
        <summary className="fsm-perf-detail-summary">
          <span className="fsm-perf-detail-icon">🔍</span>
          <span className="fsm-perf-detail-title">Recherche & OCR</span>
          <svg className="fsm-perf-detail-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </summary>
        <div className="fsm-perf-detail-content">
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Cache du contenu textuel</span>
              <span className="fsm-perf-row-desc">Garde en mémoire le texte extrait des pages PDF pour accélérer les recherches répétées. (Utilisé par usePdfSearch dès que la fonction sera implémentée.)</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.cacheTextContent ? 'on' : ''}`}
              onClick={() => performanceStore.setOverride('cacheTextContent', !perfSettings.cacheTextContent)}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Qualité OCR (Tesseract)</span>
              <span className="fsm-perf-row-desc">Échelle de rendu envoyée à Tesseract. ×3 = très précis sur petits caractères ; ×1.5 = beaucoup plus rapide.</span>
            </div>
            <FsmSelect
              value={String(perfSettings.ocrQualityScale)}
              onChange={(v) => performanceStore.setOverride('ocrQualityScale', Number(v))}
              options={[
                { value: '1',   label: 'Brouillon (×1)' },
                { value: '1.5', label: 'Rapide (×1.5)' },
                { value: '2',   label: 'Standard (×2)' },
                { value: '3',   label: 'Précis (×3)' },
                { value: '4',   label: 'Maximum (×4)' },
              ]}
            />
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">OCR auto sur PDF scannés</span>
              <span className="fsm-perf-row-desc">Détecte automatiquement les PDF sans couche texte et propose de lancer l'OCR.</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.autoOcrScannedPdfs ? 'on' : ''}`}
              onClick={() => performanceStore.setOverride('autoOcrScannedPdfs', !perfSettings.autoOcrScannedPdfs)}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
        </div>
      </details>

      {/* === Économie de batterie ========================== */}
      <details className="fsm-perf-details">
        <summary className="fsm-perf-detail-summary">
          <span className="fsm-perf-detail-icon">🔋</span>
          <span className="fsm-perf-detail-title">Économie de batterie</span>
          <svg className="fsm-perf-detail-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </summary>
        <div className="fsm-perf-detail-content">
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Activer le mode économie</span>
              <span className="fsm-perf-row-desc">Bascule automatiquement sur le preset <strong>Performance</strong> pour économiser la batterie. Restaure le preset précédent quand le saver se désactive.</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.batterySaver?.enabled ? 'on' : ''}`}
              onClick={() => performanceStore.setBatterySaver({ enabled: !perfSettings.batterySaver?.enabled, mode: perfSettings.batterySaver?.mode || 'on-battery' })}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
          <div className={`fsm-perf-row ${!perfSettings.batterySaver?.enabled ? 'fsm-perf-row-disabled' : ''}`}>
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Quand activer</span>
              <span className="fsm-perf-row-desc"><strong>Toujours</strong> = actif tant que le toggle est ON. <strong>Sur batterie</strong> = actif uniquement quand l'appareil n'est pas branché (nécessite l'API <code>navigator.getBattery</code> — Chrome / Edge / Opera).</span>
            </div>
            <FsmSelect
              value={perfSettings.batterySaver?.mode || 'on-battery'}
              onChange={(v) => performanceStore.setBatterySaver({ enabled: perfSettings.batterySaver?.enabled || false, mode: v })}
              disabled={!perfSettings.batterySaver?.enabled}
              options={[
                { value: 'always',     label: 'Toujours' },
                { value: 'on-battery', label: 'Sur batterie uniquement' },
              ]}
            />
          </div>
        </div>
      </details>

      {/* === Mémoire & avancé ============================== */}
      <details className="fsm-perf-details">
        <summary className="fsm-perf-detail-summary">
          <span className="fsm-perf-detail-icon">🧠</span>
          <span className="fsm-perf-detail-title">Mémoire & avancé</span>
          <svg className="fsm-perf-detail-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </summary>
        <div className="fsm-perf-detail-content">
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Limite de stockage IndexedDB</span>
              <span className="fsm-perf-row-desc">Espace maximal alloué aux PDF persistés. Au-delà, JacPDF avertit et propose de nettoyer.</span>
            </div>
            <div className="fsm-perf-number-with-unit">
              <input
                type="number"
                className="fsm-perf-number"
                value={perfSettings.idbSizeLimitMb}
                min="50"
                max="5000"
                step="50"
                onChange={(e) => performanceStore.setStandalone('idbSizeLimitMb', Number(e.target.value))}
              />
              <span>Mo</span>
            </div>
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Mode session-only au-delà de la limite</span>
              <span className="fsm-perf-row-desc">Quand IDB est saturé, ne persiste plus les nouveaux PDF — ils restent en mémoire mais disparaissent au refresh.</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.sessionOnlyOverLimit ? 'on' : ''}`}
              onClick={() => performanceStore.setStandalone('sessionOnlyOverLimit', !perfSettings.sessionOnlyOverLimit)}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Avertir pour les gros PDF</span>
              <span className="fsm-perf-row-desc">Affiche une mise en garde avant d'ouvrir un PDF dépassant cette taille.</span>
            </div>
            <div className="fsm-perf-number-with-unit">
              <input
                type="number"
                className="fsm-perf-number"
                value={perfSettings.largePdfWarningThreshold}
                min="10"
                max="500"
                step="10"
                onChange={(e) => performanceStore.setStandalone('largePdfWarningThreshold', Number(e.target.value))}
              />
              <span>Mo</span>
            </div>
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Indicateur mémoire</span>
              <span className="fsm-perf-row-desc">Petit bandeau en bas de l'éditeur avec la consommation IDB / heap actuelle. Utile pour diagnostiquer les ralentissements.</span>
            </div>
            <button
              className={`fsm-toggle ${perfSettings.memoryIndicatorEnabled ? 'on' : ''}`}
              onClick={() => performanceStore.setStandalone('memoryIndicatorEnabled', !perfSettings.memoryIndicatorEnabled)}
            >
              <span className="fsm-toggle-thumb" />
            </button>
          </div>
        </div>
      </details>

      <div className="fsm-divider" />
      <button
        className="fsm-action-btn fsm-action-btn-inline"
        onClick={() => performanceStore.resetAll()}
        title="Restaurer le preset Équilibré ET réinitialiser tous les réglages standalone (limite onglets, IDB, mémoire…)"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1 4 1 10 7 10"/>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
        </svg>
        Réinitialiser tous les réglages performance
      </button>
    </div>
  )
}