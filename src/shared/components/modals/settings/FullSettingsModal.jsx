import { useEffect, useMemo, useState } from 'react'
import './FullSettingsModal.css'
import VersionModal from '../system/VersionModal'
import CategoryIcon from '@/shared/components/modals/settings/shared/CategoryIcon'
import { APP_LOGOS } from '@/shared/components/modals/settings/shared/appLogos'
import { isOwner, isTester } from '@/shared/lib/user/userRoles'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useGoogleDrive } from '@/apps/jacpdf/hooks/cloud/useGoogleDrive'
import { getStorageUsage } from '@/apps/jacpdf/lib/cloud/jacpdfCloud'

// Mapping appName (lisible) -> id interne utilisé dans SECTIONS / APP_TABS.
const APP_ID_FROM_NAME = {
  JacSuite: 'jacsuite',
  'JacSuite Cloud': 'jaccloud',
  JacPDF: 'jacpdf',
  JacDoc: 'jacdoc',
  JacSlide: 'jacslide',
  JacNote: 'jacnote',
  JacPaint: 'jacpaint',
  'JacTâche': 'jactache',
  JacCalendrier: 'jaccalendrier',
  Classe: 'classe',
}

// Catégories de la sidebar Réglages (inliné pour éviter une dépendance externe).
const CATEGORIES = [
  { id: 'general',       label: 'Général',                  icon: 'general' },
  { id: 'apparence',     label: 'Apparence',                icon: 'theme' },
  { id: 'edition',       label: 'Édition',                  icon: 'edit' },
  { id: 'ia',            label: 'IA / Assistant',           icon: 'ai' },
  { id: 'export',        label: 'Export',                   icon: 'export' },
  { id: 'compte',        label: 'Compte',                   icon: 'user' },
  { id: 'cloud',         label: 'Cloud & sauvegarde',       icon: 'cloud' },
  { id: 'notifications', label: 'Rappels & notifications',  icon: 'bell' },
  { id: 'views',         label: 'Vues & filtres',           icon: 'views' },
  { id: 'integrations',  label: 'Intégrations',             icon: 'integrations' },
  { id: 'calendriers',   label: 'Calendriers & sources',    icon: 'calendar' },
  { id: 'sociale',       label: 'Social',                   icon: 'social' },
  { id: 'ecole',         label: 'École',                    icon: 'school' },
  { id: 'raccourcis',    label: 'Raccourcis',               icon: 'keyboard' },
  { id: 'performance',   label: 'Avancé',                   icon: 'performance' },
  { id: 'reset',         label: 'Réinitialisation',         icon: 'reset' },
  { id: 'apropos',       label: 'À propos',                 icon: 'info' },
  { id: 'admin',         label: 'Admin',                    icon: 'admin' },
]

const APP_CATEGORY_WHITELIST = {
  jacsuite:      ['general', 'apparence', 'compte', 'sociale', 'ecole', 'admin', 'apropos'],
  jaccloud:      ['general', 'apparence', 'integrations', 'cloud', 'performance', 'apropos'],
  jacpdf:        ['general', 'apparence', 'performance', 'raccourcis', 'cloud', 'apropos'],
  jacdoc:        ['general', 'apparence', 'edition', 'export', 'cloud', 'raccourcis', 'apropos'],
  jactache:      ['general', 'apparence', 'edition', 'notifications', 'views', 'cloud', 'integrations', 'raccourcis', 'apropos'],
  jaccalendrier: ['general', 'apparence', 'edition', 'notifications', 'calendriers', 'cloud', 'integrations', 'raccourcis', 'apropos'],
  jacslide:      ['apropos'],
  jacpaint:      ['general', 'apparence', 'edition', 'export', 'cloud', 'raccourcis', 'performance', 'apropos'],
  jacnote:       ['general', 'apparence', 'edition', 'views', 'export', 'cloud', 'raccourcis', 'performance', 'apropos'],
  classe:        ['apropos'],
}

function getVisibleCategories(activeApp, user) {
  const userRole = user?.user_metadata?.role
  const whitelist = APP_CATEGORY_WHITELIST[activeApp] || []
  return CATEGORIES.filter((cat) => {
    if (!whitelist.includes(cat.id)) return false
    if (cat.id === 'ecole') return userRole === 'ecole' || isOwner(user) || isTester(user)
    if (cat.id === 'admin') return isOwner(user)
    return true
  })
}

// JacDoc
import JacDocGeneral from '@/shared/components/modals/settings/JacDoc/GeneralSection'
import JacDocApparence from '@/shared/components/modals/settings/JacDoc/ApparenceSection'
import JacDocEdition from '@/shared/components/modals/settings/JacDoc/EditionSection'
import JacDocExport from '@/shared/components/modals/settings/JacDoc/ExportSection'
import JacDocCloud from '@/shared/components/modals/settings/JacDoc/CloudSection'
import JacDocRaccourcis from '@/shared/components/modals/settings/JacDoc/RaccourcisSection'
import JacDocApropos from '@/shared/components/modals/settings/JacDoc/AproposSection'

// JacTache
import JacTacheGeneral from '@/shared/components/modals/settings/JacTache/GeneralSection'
import JacTacheApparence from '@/shared/components/modals/settings/JacTache/ApparenceSection'
import JacTacheTachesDefauts from '@/shared/components/modals/settings/JacTache/TachesDefautsSection'
import JacTacheNotifications from '@/shared/components/modals/settings/JacTache/NotificationsSection'
import JacTacheVuesFiltres from '@/shared/components/modals/settings/JacTache/VuesFiltresSection'
import JacTacheCloud from '@/shared/components/modals/settings/JacTache/CloudSection'
import JacTacheIntegrations from '@/shared/components/modals/settings/JacTache/IntegrationsSection'
import JacTacheRaccourcis from '@/shared/components/modals/settings/JacTache/RaccourcisSection'
import JacTacheApropos from '@/shared/components/modals/settings/JacTache/AproposSection'

// JacCalendrier
import JacCalGeneral from '@/shared/components/modals/settings/JacCalendrier/GeneralSection'
import JacCalApparence from '@/shared/components/modals/settings/JacCalendrier/ApparenceSection'
import JacCalEvenementsDefauts from '@/shared/components/modals/settings/JacCalendrier/EvenementsDefautsSection'
import JacCalRappelsNotifications from '@/shared/components/modals/settings/JacCalendrier/RappelsNotificationsSection'
import JacCalSources from '@/shared/components/modals/settings/JacCalendrier/SourcesSection'
import JacCalCloud from '@/shared/components/modals/settings/JacCalendrier/CloudSection'
import JacCalIntegrations from '@/shared/components/modals/settings/JacCalendrier/IntegrationsSection'
import JacCalRaccourcis from '@/shared/components/modals/settings/JacCalendrier/RaccourcisSection'
import JacCalApropos from '@/shared/components/modals/settings/JacCalendrier/AproposSection'

// JacPdf
import JacPdfGeneral from '@/shared/components/modals/settings/JacPdf/GeneralSection'
import JacPdfApparence from '@/shared/components/modals/settings/JacPdf/ApparenceSection'
import JacPdfPerformance from '@/shared/components/modals/settings/JacPdf/PerformanceSection'
import JacPdfRaccourcis from '@/shared/components/modals/settings/JacPdf/RaccourcisSection'
import JacPdfCloud from '@/shared/components/modals/settings/JacPdf/CloudSection'
import JacPdfApropos from '@/shared/components/modals/settings/JacPdf/AproposSection'

// JacNote
import JacNoteGeneral from '@/shared/components/modals/settings/JacNote/GeneralSection'
import JacNoteApparence from '@/shared/components/modals/settings/JacNote/ApparenceSection'
import JacNoteEdition from '@/shared/components/modals/settings/JacNote/EditionSection'
import JacNoteVuesFiltres from '@/shared/components/modals/settings/JacNote/VuesFiltresSection'
import JacNoteExport from '@/shared/components/modals/settings/JacNote/ExportSection'
import JacNoteCloud from '@/shared/components/modals/settings/JacNote/CloudSection'
import JacNoteRaccourcis from '@/shared/components/modals/settings/JacNote/RaccourcisSection'
import JacNotePerformance from '@/shared/components/modals/settings/JacNote/PerformanceSection'
import JacNoteApropos from '@/shared/components/modals/settings/JacNote/AproposSection'

// JacPaint
import JacPaintGeneral from '@/shared/components/modals/settings/JacPaint/GeneralSection'
import JacPaintApparence from '@/shared/components/modals/settings/JacPaint/ApparenceSection'
import JacPaintEdition from '@/shared/components/modals/settings/JacPaint/EditionSection'
import JacPaintExport from '@/shared/components/modals/settings/JacPaint/ExportSection'
import JacPaintCloud from '@/shared/components/modals/settings/JacPaint/CloudSection'
import JacPaintRaccourcis from '@/shared/components/modals/settings/JacPaint/RaccourcisSection'
import JacPaintPerformance from '@/shared/components/modals/settings/JacPaint/PerformanceSection'
import JacPaintApropos from '@/shared/components/modals/settings/JacPaint/AproposSection'

// JacSuite
import JacSuiteGeneral from '@/shared/components/modals/settings/JacSuite/GeneralSection'
import JacSuiteApparence from '@/shared/components/modals/settings/JacSuite/ApparenceSection'
import JacSuiteCompte from '@/shared/components/modals/settings/JacSuite/CompteSection'
import JacSuiteSociale from '@/shared/components/modals/settings/JacSuite/SocialeSection'
import JacSuiteEcole from '@/shared/components/modals/settings/JacSuite/EcoleSection'
import JacSuiteAdmin from '@/shared/components/modals/settings/JacSuite/AdminSection'
import JacSuiteApropos from '@/shared/components/modals/settings/JacSuite/AproposSection'

// JacCloud (JacSuite Cloud — le cloud central)
import JacCloudGeneral from '@/shared/components/modals/settings/JacCloud/GeneralSection'
import JacCloudApparence from '@/shared/components/modals/settings/JacCloud/ApparenceSection'
import JacCloudIntegrations from '@/shared/components/modals/settings/JacCloud/IntegrationsSection'
import JacCloudCloud from '@/shared/components/modals/settings/JacCloud/CloudSection'
import JacCloudPerformance from '@/shared/components/modals/settings/JacCloud/PerformanceSection'
import JacCloudApropos from '@/shared/components/modals/settings/JacCloud/AproposSection'

// Classroom
import ClassroomApropos from '@/shared/components/modals/settings/Classroom/AproposSection'

const APP_TABS = [
  { id: 'jacsuite', label: 'JacSuite' },
  { id: 'jaccloud', label: 'JacSuite Cloud' },
  { id: 'jacdoc', label: 'JacDoc' },
  { id: 'jacpdf', label: 'JacPDF' },
  { id: 'jacslide', label: 'JacSlide', badge: 'soon' },
  { id: 'jacnote', label: 'JacNote' },
  { id: 'jacpaint', label: 'JacPaint' },
  { id: 'jactache', label: 'JacTâche' },
  { id: 'jaccalendrier', label: 'JacCalendrier' },
  { id: 'classe', label: 'Classe' },
]

// Routeur des sections : { [app]: { [category]: Component } }
const SECTIONS = {
  jacdoc: {
    general: JacDocGeneral,
    apparence: JacDocApparence,
    edition: JacDocEdition,
    export: JacDocExport,
    cloud: JacDocCloud,
    raccourcis: JacDocRaccourcis,
    apropos: JacDocApropos,
  },
  jactache: {
    general: JacTacheGeneral,
    apparence: JacTacheApparence,
    edition: JacTacheTachesDefauts,
    notifications: JacTacheNotifications,
    views: JacTacheVuesFiltres,
    cloud: JacTacheCloud,
    integrations: JacTacheIntegrations,
    raccourcis: JacTacheRaccourcis,
    apropos: JacTacheApropos,
  },
  jaccalendrier: {
    general: JacCalGeneral,
    apparence: JacCalApparence,
    edition: JacCalEvenementsDefauts,
    notifications: JacCalRappelsNotifications,
    calendriers: JacCalSources,
    cloud: JacCalCloud,
    integrations: JacCalIntegrations,
    raccourcis: JacCalRaccourcis,
    apropos: JacCalApropos,
  },
  jacsuite: {
    general: JacSuiteGeneral,
    apparence: JacSuiteApparence,
    compte: JacSuiteCompte,
    sociale: JacSuiteSociale,
    ecole: JacSuiteEcole,
    admin: JacSuiteAdmin,
    apropos: JacSuiteApropos,
  },
  jaccloud: {
    general: JacCloudGeneral,
    apparence: JacCloudApparence,
    integrations: JacCloudIntegrations,
    cloud: JacCloudCloud,
    performance: JacCloudPerformance,
    apropos: JacCloudApropos,
  },
  jacpdf: {
    general: JacPdfGeneral,
    apparence: JacPdfApparence,
    performance: JacPdfPerformance,
    raccourcis: JacPdfRaccourcis,
    cloud: JacPdfCloud,
    apropos: JacPdfApropos,
  },
  jacnote: {
    general: JacNoteGeneral,
    apparence: JacNoteApparence,
    edition: JacNoteEdition,
    views: JacNoteVuesFiltres,
    export: JacNoteExport,
    cloud: JacNoteCloud,
    raccourcis: JacNoteRaccourcis,
    performance: JacNotePerformance,
    apropos: JacNoteApropos,
  },
  jacpaint: {
    general: JacPaintGeneral,
    apparence: JacPaintApparence,
    edition: JacPaintEdition,
    export: JacPaintExport,
    cloud: JacPaintCloud,
    raccourcis: JacPaintRaccourcis,
    performance: JacPaintPerformance,
    apropos: JacPaintApropos,
  },
  classe: {
    apropos: ClassroomApropos,
  },
}

const SOON_APPS = ['jacslide']

// Mapping id interne -> nom lisible attendu par VersionModal.appName.
const APP_NAME_FOR_VERSION = {
  jacsuite: 'JacSuite',
  jaccloud: 'JacSuite Cloud',
  jacdoc: 'JacDoc',
  jacpdf: 'JacPDF',
  jacslide: 'JacSlide',
  jacnote: 'JacNote',
  jacpaint: 'JacPaint',
  jactache: 'JacTâche',
  jaccalendrier: 'JacCalendrier',
  classe: 'Classe',
}

export default function FullSettingsModal({ onClose, appName = 'JacSuite' }) {
  const { user } = useAuth()
  const initialApp = APP_ID_FROM_NAME[appName] || 'jacsuite'
  const [activeApp, setActiveApp] = useState(initialApp)
  const [active, setActive] = useState('general')
  const [showVersionModal, setShowVersionModal] = useState(false)
  const [appMenuOpen, setAppMenuOpen] = useState(false)
  const currentApp = APP_TABS.find((a) => a.id === activeApp) || APP_TABS[0]

  // Hooks centralisés — threadés à toutes les sections (CompteSection,
  // CloudSection, AdminSection en dépendent). Avant ce fix, les sections
  // tentaient de lire `drive.connected` / `cloud.connected` sur des props
  // undefined → TypeError au mount. On instancie ici une seule fois et on
  // distribue ; les sections qui n'en ont pas besoin ignorent simplement.
  const drive = useGoogleDrive()
  const [cloudUsage, setCloudUsage] = useState({ totalBytes: 0, fileCount: 0 })
  useEffect(() => {
    if (!user) { setCloudUsage({ totalBytes: 0, fileCount: 0 }); return }
    let cancelled = false
    getStorageUsage()
      .then((u) => { if (!cancelled) setCloudUsage(u) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user?.id])
  const cloud = useMemo(() => ({
    connected: !!user,
    usage: { usedBytes: cloudUsage.totalBytes },
    quotaUsedRatio: cloudUsage.totalBytes / (1024 ** 3),
  }), [user, cloudUsage])
  // accountInfo : message d'information partagé entre Compte/Admin (« Email
  // de réinitialisation envoyé à … », « Rôle mis à jour », etc.).
  const [accountInfo, setAccountInfo] = useState('')

  const visibleCategories = useMemo(
    () => getVisibleCategories(activeApp, user),
    [activeApp, user],
  )

  useEffect(() => {
    if (!visibleCategories.some((c) => c.id === active)) {
      setActive(visibleCategories[0]?.id || 'apropos')
    }
  }, [activeApp, visibleCategories, active])

  const Section = SECTIONS[activeApp]?.[active] || null
  const isSoonOnly = SOON_APPS.includes(activeApp)

  return (
    <div className="fsm-overlay" onClick={onClose}>
      <div className="fsm-card" onClick={(e) => e.stopPropagation()}>
        <div className="fsm-header">
          <h2 className="fsm-title">Paramètres</h2>
          <div className="fsm-app-picker">
            <button
              type="button"
              className="fsm-app-picker__trigger"
              onClick={() => setAppMenuOpen((o) => !o)}
            >
              {APP_LOGOS[currentApp.id] && (
                <img
                  src={APP_LOGOS[currentApp.id]}
                  alt=""
                  className="fsm-app-picker__logo"
                  draggable="false"
                />
              )}
              <span className="fsm-app-picker__label">{currentApp.label}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="fsm-app-picker__chevron">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {appMenuOpen && (
              <>
                <div
                  className="fsm-app-picker__backdrop"
                  onClick={() => setAppMenuOpen(false)}
                />
                <div className="fsm-app-picker__menu">
                  {APP_TABS.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      className={'fsm-app-picker__option ' + (activeApp === app.id ? 'is-active' : '')}
                      onClick={() => { setActiveApp(app.id); setAppMenuOpen(false) }}
                    >
                      {APP_LOGOS[app.id] && (
                        <img
                          src={APP_LOGOS[app.id]}
                          alt=""
                          className="fsm-app-picker__option-logo"
                          draggable="false"
                        />
                      )}
                      <span>{app.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button className="fsm-close" onClick={onClose} aria-label="Fermer" style={ { marginLeft: 'auto' } }>×</button>
        </div>

        <div className="fsm-body">
          <aside className="fsm-sidebar">
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                className={'fsm-nav-item ' + (active === cat.id ? 'active' : '')}
                onClick={() => setActive(cat.id)}
              >
                <CategoryIcon type={cat.icon} />
                <span>{cat.label}</span>
              </button>
            ))}
          </aside>

          <main className="fsm-main">
            {isSoonOnly ? (
              <div className="fsm-section">
                <h3 className="fsm-section-title">À propos</h3>
                <p className="fsm-section-sub">Informations sur {currentApp.label}.</p>

                <div className="fsm-about-card">
                  <div className="fsm-logo">
                    {APP_LOGOS[currentApp.id] && (
                      <img src={APP_LOGOS[currentApp.id]} alt="" className="fsm-logo-img" draggable="false" />
                    )}
                    {currentApp.label.startsWith('Jac') ? (
                      <>
                        <span className="fsm-logo-jac">Jac</span>
                        <span className="fsm-logo-pdf">{currentApp.label.slice(3)}</span>
                      </>
                    ) : (
                      <span className="fsm-logo-jac">{currentApp.label}</span>
                    )}
                    <button className="fsm-version-tag" onClick={() => setShowVersionModal(true)}>
                      {currentApp.badge === 'alpha' ? 'Alpha' : 'Bientôt'}
                    </button>
                  </div>
                  <p className="fsm-about-text">
                    {currentApp.badge === 'alpha'
                      ? `${currentApp.label} est actuellement en alpha. L'app est utilisable mais les réglages dédiés seront ajoutés prochainement.`
                      : `${currentApp.label} arrive bientôt dans JacSuite. Reste à l'affût — les réglages dédiés apparaîtront ici dès la sortie !`}
                  </p>
                </div>

                <h4 className="fsm-group-title">Crédits</h4>
                <div className="fsm-credit-row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <div>
                    <p className="fsm-credit-name">Jacob Veilleux</p>
                    <p className="fsm-credit-role">Créateur & Développeur</p>
                  </div>
                </div>
                <div className="fsm-credit-row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="16 18 22 12 16 6"/>
                    <polyline points="8 6 2 12 8 18"/>
                  </svg>
                  <div>
                    <p className="fsm-credit-name">Claude Opus 4.8</p>
                    <p className="fsm-credit-role">Assistant de développement</p>
                  </div>
                </div>
                <p className="fsm-copyright">© 2026 JacSuite — Tous droits réservés</p>
              </div>
            ) : Section ? (
              <Section
                user={user}
                drive={drive}
                cloud={cloud}
                accountInfo={accountInfo}
                setAccountInfo={setAccountInfo}
                onClose={onClose}
                appName={currentApp.label}
                onOpenVersionModal={() => setShowVersionModal(true)}
              />
            ) : null}
          </main>
        </div>

        {showVersionModal && (
          <VersionModal
            onClose={() => setShowVersionModal(false)}
            appName={APP_NAME_FOR_VERSION[activeApp] || 'JacSuite'}
          />
        )}
      </div>
    </div>
  )
}