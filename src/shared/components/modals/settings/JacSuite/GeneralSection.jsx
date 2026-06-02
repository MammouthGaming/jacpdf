import { useState, useEffect } from 'react'
import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import { eventToCombo } from '@/shared/hooks/system/useKeyboardShortcuts'
import { usePremium } from '@/shared/hooks/user/usePremium'
import { PremiumBadge } from '@/shared/components/ui/PremiumLock'

// Logos résolus via new URL(…, import.meta.url) — même pattern que JacLauncher
// pour que Vite traite les SVG comme assets statiques et génère l'URL hashée.
// Chemin : src/shared/components/modals/settings/JacSuite/ → 6 niveaux → racine → logo/
const LOGO = {
  jacsuite:      new URL('../../../../../../logo/JacSuite.svg',      import.meta.url).href,
  jacpdf:        new URL('../../../../../../logo/JacPDF.svg',        import.meta.url).href,
  jacdoc:        new URL('../../../../../../logo/JacDoc.svg',        import.meta.url).href,
  jactache:      new URL('../../../../../../logo/JacTâche.svg',      import.meta.url).href,
  jaccalendrier: new URL('../../../../../../logo/JacCalendrier.svg', import.meta.url).href,
}

// Helper : icône <img/>. Le dimensionnement (18x18, object-fit: contain) est
// déjà géré par .fsm-cselect__icon img et .fsm-cselect__option-icon img dans
// FullSettingsModal.css — inutile de l'inliner ici.
const Logo = ({ src, alt = '' }) => (
  <img src={src} alt={alt} draggable="false" />
)

// Drapeaux SVG inline (pas d'emoji) pour le menu Langue.
// La classe .fsm-flag-svg ajoute coins arrondis et un mince contour.
const FlagFR = () => (
  <svg className="fsm-flag-svg" width="18" height="13" viewBox="0 0 18 13" aria-hidden="true">
    <rect width="6" height="13" x="0"  fill="#0055A4" />
    <rect width="6" height="13" x="6"  fill="#FFFFFF" />
    <rect width="6" height="13" x="12" fill="#EF4135" />
  </svg>
)
const FlagGB = () => (
  <svg className="fsm-flag-svg" width="18" height="13" viewBox="0 0 60 30" aria-hidden="true">
    <clipPath id="fsmsec-uk-clip"><path d="M0,0 v30 h60 v-30 z" /></clipPath>
    <clipPath id="fsmsec-uk-clip2"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
    <g clipPath="url(#fsmsec-uk-clip)">
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#fsmsec-uk-clip2)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </g>
  </svg>
)

// Icône horloge inline pour « La dernière app utilisée » (pas d'emoji).
const ClockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

// Icône loupe inline pour le réglage du raccourci Spotlight (pas d'emoji).
const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

// Options du raccourci Spotlight. Les `value` sont des combos au format
// produit par eventToCombo (useKeyboardShortcuts) : metaKey ET ctrlKey →
// 'ctrl', barre d'espace → ' '. On ne peut donc pas distinguer Cmd de Ctrl
// (d'où les libellés « ⌘ / Ctrl »). Lus en live par Spotlight.jsx via
// useJacSuiteSetting('jacsuite_spotlightShortcut').
const SPOTLIGHT_SHORTCUT_OPTIONS = [
  { value: 'ctrl+ ',       label: '⌘ / Ctrl + Espace',       description: 'Défaut · sur Mac, Cmd+Espace ouvre le Spotlight macOS — utilise plutôt Ctrl+Espace' },
  { value: 'ctrl+k',       label: '⌘ / Ctrl + K' },
  { value: 'ctrl+/',       label: '⌘ / Ctrl + /' },
  { value: 'ctrl+shift+ ', label: '⌘ / Ctrl + Maj + Espace' },
  { value: 'ctrl+shift+k', label: '⌘ / Ctrl + Maj + K' },
  { value: 'ctrl+shift+p', label: '⌘ / Ctrl + Maj + P' },
]

// Met en forme un combo (format eventToCombo : 'ctrl', 'shift', 'alt', ' ' pour
// l'espace, lettres minuscules) en libellé lisible. Sert pour l'option « perso »
// et l'affichage du raccourci actif.
const COMBO_LABELS = { ctrl: '⌘ / Ctrl', shift: 'Maj', alt: 'Alt', ' ': 'Espace', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Échap', enter: 'Entrée', tab: 'Tab', backspace: '⌫' }
function formatCombo(combo) {
  if (!combo) return '—'
  return combo
    .split('+')
    .map((p) => COMBO_LABELS[p] || (p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' + ')
}

const LANGUE_OPTIONS = [
  { value: 'fr', label: 'Français', icon: <FlagFR /> },
  { value: 'en', label: 'English',  icon: <FlagGB /> },
]

const OPEN_ON_LOGIN_OPTIONS = [
  { value: 'launcher',      label: 'Le launcher JacSuite',     icon: <Logo src={LOGO.jacsuite}      alt="JacSuite" />,      description: "Page d'accueil avec toutes les apps" },
  { value: 'last',          label: 'La dernière app utilisée', icon: <ClockIcon />,                                       description: 'Reprend où tu en étais au dernier login' },
  { value: 'jacpdf',        label: 'JacPDF',        icon: <Logo src={LOGO.jacpdf}        alt="JacPDF" /> },
  { value: 'jacdoc',        label: 'JacDoc',        icon: <Logo src={LOGO.jacdoc}        alt="JacDoc" /> },
  { value: 'jactache',      label: 'JacTâche',      icon: <Logo src={LOGO.jactache}      alt="JacTâche" /> },
  { value: 'jaccalendrier', label: 'JacCalendrier', icon: <Logo src={LOGO.jaccalendrier} alt="JacCalendrier" /> },
]

// Apps du rail latéral (ordre canonique). Sert au contrôle « Apps du rail ».
const SIDEBAR_RAIL_APPS = [
  { id: 'launcher', name: 'Accueil JacSuite' },
  { id: 'jacpdf', name: 'JacPDF' },
  { id: 'jacdoc', name: 'JacDoc' },
  { id: 'jacpaint', name: 'JacPaint' },
  { id: 'jacnote', name: 'JacNote' },
  { id: 'jactache', name: 'JacTâche' },
  { id: 'jaccalendrier', name: 'JacCalendrier' },
  { id: 'classroom', name: 'Classroom' },
]
const SIDEBAR_RAIL_DEFAULT_ORDER = SIDEBAR_RAIL_APPS.map((a) => a.id)

const SIDEBAR_SIDE_OPTIONS = [
  { value: 'right', label: 'À droite', description: 'Style Microsoft Edge (défaut)' },
  { value: 'left', label: 'À gauche' },
]
const SIDEBAR_WIDTH_OPTIONS = [
  { value: '280', label: 'Compact (280 px)' },
  { value: '340', label: 'Normal (340 px)' },
  { value: '480', label: 'Large (480 px)' },
]
const SIDEBAR_ICON_SIZE_OPTIONS = [
  { value: 'small', label: 'Petites' },
  { value: 'medium', label: 'Moyennes' },
  { value: 'large', label: 'Grandes' },
]
const SIDEBAR_SHORTCUT_OPTIONS = [
  { value: 'ctrl+b', label: '⌘ / Ctrl + B' },
  { value: 'ctrl+shift+b', label: '⌘ / Ctrl + Maj + B' },
  { value: 'ctrl+.', label: '⌘ / Ctrl + .' },
  { value: 'ctrl+shift+s', label: '⌘ / Ctrl + Maj + S' },
]

export default function GeneralSection() {
  // Premium — la barre latérale d'apps est réservée au plan Pro+. Verrouillée,
  // sa section de réglages est grisée + badgée « Pro », et un clic ouvre le
  // panneau d'abonnement. Owner/dev ne sont jamais verrouillés (isFeatureLocked).
  const { isFeatureLocked, openPremiumModal } = usePremium()
  const appSidebarLocked = isFeatureLocked('app_sidebar')
  const openSidebarPaywall = () => openPremiumModal('app_sidebar')
  const [langue, setLangue] = useStoredSetting('jacsuite_settings_langue', 'fr')
  const [openOnLogin, setOpenOnLogin] = useStoredSetting('jacsuite_settings_open_on_login', 'launcher')
  const [confirmClose, setConfirmClose] = useStoredSetting('jacsuite_settings_confirm_close_unsaved', true)
  const [spotlightShortcut, setSpotlightShortcut] = useStoredSetting('jacsuite_spotlightShortcut', 'ctrl+ ')
  const [capturing, setCapturing] = useState(false)

  // ── Réglages Barre latérale (rail d'apps style Edge) ──
  const [sbEnabled, setSbEnabled] = useStoredSetting('jacsuite_sidebar_enabled', 'false')
  const [sbSide, setSbSide] = useStoredSetting('jacsuite_sidebar_side', 'right')
  const [sbWidth, setSbWidth] = useStoredSetting('jacsuite_sidebar_default_width', '340')
  const [sbIconSize, setSbIconSize] = useStoredSetting('jacsuite_sidebar_icon_size', 'medium')
  const [sbShowOnStart, setSbShowOnStart] = useStoredSetting('jacsuite_sidebar_show_on_start', 'true')
  const [sbShowLabels, setSbShowLabels] = useStoredSetting('jacsuite_sidebar_show_labels', 'false')
  const [sbOpenPinned, setSbOpenPinned] = useStoredSetting('jacsuite_sidebar_open_pinned', 'false')
  const [sbCloseOutside, setSbCloseOutside] = useStoredSetting('jacsuite_sidebar_close_on_outside', 'true')
  const [sbRememberApp, setSbRememberApp] = useStoredSetting('jacsuite_sidebar_remember_last_app', 'false')
  const [sbShowAdd, setSbShowAdd] = useStoredSetting('jacsuite_sidebar_show_add_button', 'false')
  const [sbHoverPreview, setSbHoverPreview] = useStoredSetting('jacsuite_sidebar_hover_preview', 'true')
  const [sbToggleShortcut, setSbToggleShortcut] = useStoredSetting('jacsuite_sidebar_toggle_shortcut', 'ctrl+b')
  const [sbOrderRaw, setSbOrderRaw] = useStoredSetting('jacsuite_sidebar_app_order', JSON.stringify(SIDEBAR_RAIL_DEFAULT_ORDER))
  const [sbVisibleRaw, setSbVisibleRaw] = useStoredSetting('jacsuite_sidebar_visible_apps', '')
  const [capturingSb, setCapturingSb] = useState(false)

  // Capture d'un raccourci personnalisé : on écoute le prochain combo et on le
  // stocke au même format que celui lu par Spotlight (eventToCombo). Échap annule.
  useEffect(() => {
    if (!capturing) return
    const onKey = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setCapturing(false); return }
      const combo = eventToCombo(e)
      if (!combo) return
      setSpotlightShortcut(combo)
      setCapturing(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, setSpotlightShortcut])

  // Si le raccourci actif n'est pas un préréglage, on l'ajoute en tête du menu
  // pour que le FsmSelect affiche bien la sélection courante.
  const isPreset = SPOTLIGHT_SHORTCUT_OPTIONS.some((o) => o.value === spotlightShortcut)
  const shortcutOptions = isPreset
    ? SPOTLIGHT_SHORTCUT_OPTIONS
    : [{ value: spotlightShortcut, label: `${formatCombo(spotlightShortcut)} · personnalisé` }, ...SPOTLIGHT_SHORTCUT_OPTIONS]

  // Capture d'un raccourci perso pour la barre latérale (même logique que
  // le Spotlight ci-dessus).
  useEffect(() => {
    if (!capturingSb) return
    const onKey = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setCapturingSb(false); return }
      const combo = eventToCombo(e)
      if (!combo) return
      setSbToggleShortcut(combo)
      setCapturingSb(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturingSb, setSbToggleShortcut])
  const isSbPreset = SIDEBAR_SHORTCUT_OPTIONS.some((o) => o.value === sbToggleShortcut)
  const sbShortcutOptions = isSbPreset
    ? SIDEBAR_SHORTCUT_OPTIONS
    : [{ value: sbToggleShortcut, label: `${formatCombo(sbToggleShortcut)} · personnalisé` }, ...SIDEBAR_SHORTCUT_OPTIONS]

  // Helpers booléens / listes pour les réglages de la barre latérale.
  const sbBoolOn = (v) => v === true || v === 'true'
  const sbParseList = (raw, fallback) => {
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a : fallback } catch { return fallback }
  }
  const sbOrder = (() => {
    const parsed = sbParseList(sbOrderRaw, SIDEBAR_RAIL_DEFAULT_ORDER).filter((id) => SIDEBAR_RAIL_APPS.some((a) => a.id === id))
    const rest = SIDEBAR_RAIL_DEFAULT_ORDER.filter((id) => !parsed.includes(id))
    return [...parsed, ...rest]
  })()
  const sbVisibleList = sbParseList(sbVisibleRaw, null)
  const sbIsVisible = (id) => (Array.isArray(sbVisibleList) && sbVisibleList.length > 0 ? sbVisibleList.includes(id) : true)
  const sbMoveApp = (id, dir) => {
    const ids = [...sbOrder]
    const i = ids.indexOf(id)
    const j = i + dir
    if (i === -1 || j < 0 || j >= ids.length) return
    const tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp
    setSbOrderRaw(JSON.stringify(ids))
  }
  const sbToggleVisible = (id) => {
    const base = sbOrder.filter(sbIsVisible)
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    if (next.length === 0) return
    setSbVisibleRaw(JSON.stringify(next))
  }

  return (
    <>
      <style>{`.fsm-shortcut-pick{display:flex;align-items:center;gap:10px}.fsm-shortcut-pick>:first-child{flex:1}.fsm-kbd-btn{background:#1e2535;border:1px solid #2a3347;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:600;font-family:inherit;color:#d1d5db;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s,border-color .15s}.fsm-kbd-btn:hover{background:#252d3f;color:#fff}.fsm-kbd-btn.editing{background:rgba(var(--accent-rgb),.13);border-color:var(--accent);color:var(--accent)}[data-theme="light"] .fsm-kbd-btn{background:#f0f1f5;border-color:#d1d5db;color:#1f2937}[data-theme="light"] .fsm-kbd-btn:hover{background:#e5e7eb;color:#0d1117}`}</style>
    <div className="fsm-section">
      <h3 className="fsm-section-title">Général</h3>
      <p className="fsm-section-sub">Préférences générales de JacSuite.</p>

      <div className="fsm-field">
        <label className="fsm-label">Langue</label>
        <FsmSelect
          value={langue}
          onChange={setLangue}
          options={LANGUE_OPTIONS}
        />
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Au démarrage, ouvrir…</label>
        <FsmSelect
          value={openOnLogin}
          onChange={setOpenOnLogin}
          options={OPEN_ON_LOGIN_OPTIONS}
        />
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Raccourci du Spotlight</label>
        <p className="fsm-label-sub">Ouvre la recherche universelle JacSuite (apps, fichiers, actions) depuis n'importe quelle app.</p>
        <div className="fsm-shortcut-pick">
          <FsmSelect
            value={spotlightShortcut}
            onChange={setSpotlightShortcut}
            options={shortcutOptions}
          />
          <button
            className={`fsm-kbd-btn ${capturing ? 'editing' : ''}`}
            onClick={() => setCapturing((c) => !c)}
            title={capturing ? 'Pressez les touches (Échap pour annuler)' : 'Définir un raccourci personnalisé'}
          >
            {capturing ? 'Pressez…' : 'Personnalisé…'}
          </button>
        </div>
        <p className="fsm-label-sub">Raccourci actuel : <strong>{formatCombo(spotlightShortcut)}</strong></p>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Confirmer la fermeture si des onglets ne sont pas sauvés</label>
          <p className="fsm-label-sub">Affiche une boîte de dialogue avant de quitter pour éviter de perdre des modifs.</p>
        </div>
        <button
          className={`fsm-toggle ${confirmClose ? 'on' : ''}`}
          onClick={() => setConfirmClose(!confirmClose)}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
    </div>

    <div className={`fsm-section${appSidebarLocked ? ' fsm-section--locked' : ''}`}>
      <style>{`.fsm-railapps{display:flex;flex-direction:column;gap:6px;margin-top:8px}.fsm-railapp{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#1e2535;border:1px solid #2a3347;border-radius:8px}[data-theme="light"] .fsm-railapp{background:#f0f1f5;border-color:#d1d5db}.fsm-railapp__name{flex:1;font-size:13px;color:#d1d5db;font-family:inherit}[data-theme="light"] .fsm-railapp__name{color:#1f2937}.fsm-railapp--hidden .fsm-railapp__name{opacity:.45}.fsm-railapp__btn{background:transparent;border:1px solid #2a3347;color:#9ca3af;border-radius:6px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;font-family:inherit}.fsm-railapp__btn:hover:not(:disabled){background:#252d3f;color:#fff}.fsm-railapp__btn:disabled{opacity:.35;cursor:not-allowed}.fsm-railapp__vis{margin-left:2px;background:transparent;border:1px solid #2a3347;color:#9ca3af;cursor:pointer;font-size:12px;font-family:inherit;padding:5px 10px;border-radius:6px}.fsm-railapp__vis:hover{background:#252d3f;color:#fff}.fsm-section--locked .fsm-toggle-row{cursor:pointer;opacity:.6}.fsm-toggle--locked{opacity:.55}.fsm-section-badge{margin-left:8px;vertical-align:middle}`}</style>
      <h3 className="fsm-section-title">Barre latérale{appSidebarLocked && <PremiumBadge tier="pro" title="Réservé au plan Pro" className="fsm-section-badge" />}</h3>
      <p className="fsm-section-sub">Le rail d'apps style Edge, présent partout dans JacSuite.</p>

      <div className="fsm-toggle-row" onClick={appSidebarLocked ? openSidebarPaywall : undefined}>
        <div>
          <label className="fsm-label">Activer la barre latérale</label>
          <p className="fsm-label-sub">Affiche le rail d'apps et son bouton de bascule dans la barre d'onglets. Désactivé, la barre latérale disparaît complètement de JacSuite.</p>
        </div>
        <button className={`fsm-toggle ${(!appSidebarLocked && sbBoolOn(sbEnabled)) ? 'on' : ''}${appSidebarLocked ? ' fsm-toggle--locked' : ''}`} onClick={() => { if (appSidebarLocked) return; setSbEnabled(sbBoolOn(sbEnabled) ? 'false' : 'true') }}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      {sbBoolOn(sbEnabled) && !appSidebarLocked && (
      <>
      <div className="fsm-divider" />

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Afficher la barre latérale au démarrage</label>
          <p className="fsm-label-sub">Le rail d'apps est visible dès l'ouverture de JacSuite.</p>
        </div>
        <button className={`fsm-toggle ${sbBoolOn(sbShowOnStart) ? 'on' : ''}`} onClick={() => setSbShowOnStart(sbBoolOn(sbShowOnStart) ? 'false' : 'true')}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Côté de la barre latérale</label>
        <FsmSelect value={sbSide} onChange={setSbSide} options={SIDEBAR_SIDE_OPTIONS} />
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Largeur par défaut du panneau</label>
        <FsmSelect value={sbWidth} onChange={setSbWidth} options={SIDEBAR_WIDTH_OPTIONS} />
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Taille des icônes</label>
        <FsmSelect value={sbIconSize} onChange={setSbIconSize} options={SIDEBAR_ICON_SIZE_OPTIONS} />
      </div>

      <div className="fsm-divider" />

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Afficher les libellés sous les icônes</label>
          <p className="fsm-label-sub">Le nom de chaque app apparaît sous son icône dans le rail.</p>
        </div>
        <button className={`fsm-toggle ${sbBoolOn(sbShowLabels) ? 'on' : ''}`} onClick={() => setSbShowLabels(sbBoolOn(sbShowLabels) ? 'false' : 'true')}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Ouvrir les apps épinglées par défaut</label>
          <p className="fsm-label-sub">Le panneau pousse le contenu dès l'ouverture, au lieu de s'afficher en superposition.</p>
        </div>
        <button className={`fsm-toggle ${sbBoolOn(sbOpenPinned) ? 'on' : ''}`} onClick={() => setSbOpenPinned(sbBoolOn(sbOpenPinned) ? 'false' : 'true')}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Fermer le panneau en cliquant ailleurs</label>
          <p className="fsm-label-sub">Un clic en dehors referme le panneau (uniquement en mode superposition).</p>
        </div>
        <button className={`fsm-toggle ${sbBoolOn(sbCloseOutside) ? 'on' : ''}`} onClick={() => setSbCloseOutside(sbBoolOn(sbCloseOutside) ? 'false' : 'true')}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Se souvenir de la dernière app ouverte</label>
          <p className="fsm-label-sub">Rouvre le même panneau au prochain lancement de JacSuite.</p>
        </div>
        <button className={`fsm-toggle ${sbBoolOn(sbRememberApp) ? 'on' : ''}`} onClick={() => setSbRememberApp(sbBoolOn(sbRememberApp) ? 'false' : 'true')}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Aperçu au survol (tâches & événements)</label>
          <p className="fsm-label-sub">Survoler JacTâche ou JacCalendrier dans le rail affiche un aperçu des prochaines tâches et événements.</p>
        </div>
        <button className={`fsm-toggle ${sbBoolOn(sbHoverPreview) ? 'on' : ''}`} onClick={() => setSbHoverPreview(sbBoolOn(sbHoverPreview) ? 'false' : 'true')}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Bouton « + » pour ajouter une app</label>
          <p className="fsm-label-sub">Affiche un bouton en bas du rail pour réafficher une app masquée.</p>
        </div>
        <button className={`fsm-toggle ${sbBoolOn(sbShowAdd) ? 'on' : ''}`} onClick={() => setSbShowAdd(sbBoolOn(sbShowAdd) ? 'false' : 'true')}>
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Raccourci afficher / masquer la barre latérale</label>
        <div className="fsm-shortcut-pick">
          <FsmSelect value={sbToggleShortcut} onChange={setSbToggleShortcut} options={sbShortcutOptions} />
          <button
            className={`fsm-kbd-btn ${capturingSb ? 'editing' : ''}`}
            onClick={() => setCapturingSb((c) => !c)}
            title={capturingSb ? 'Pressez les touches (Échap pour annuler)' : 'Définir un raccourci personnalisé'}
          >
            {capturingSb ? 'Pressez…' : 'Personnalisé…'}
          </button>
        </div>
        <p className="fsm-label-sub">Raccourci actuel : <strong>{formatCombo(sbToggleShortcut)}</strong></p>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Apps du rail</label>
        <p className="fsm-label-sub">Réordonne avec ▲ ▼ et affiche / masque chaque app. (Tu peux aussi glisser-déposer les icônes directement dans le rail.)</p>
        <div className="fsm-railapps">
          {sbOrder.map((id, idx) => {
            const meta = SIDEBAR_RAIL_APPS.find((a) => a.id === id)
            if (!meta) return null
            const visible = sbIsVisible(id)
            return (
              <div key={id} className={`fsm-railapp ${visible ? '' : 'fsm-railapp--hidden'}`}>
                <button className="fsm-railapp__btn" disabled={idx === 0} onClick={() => sbMoveApp(id, -1)} title="Monter" aria-label="Monter">▲</button>
                <button className="fsm-railapp__btn" disabled={idx === sbOrder.length - 1} onClick={() => sbMoveApp(id, 1)} title="Descendre" aria-label="Descendre">▼</button>
                <span className="fsm-railapp__name">{meta.name}</span>
                <button className="fsm-railapp__vis" onClick={() => sbToggleVisible(id)}>{visible ? 'Masquer' : 'Afficher'}</button>
              </div>
            )
          })}
        </div>
      </div>
      </>
      )}
    </div>
    </>
  )
}