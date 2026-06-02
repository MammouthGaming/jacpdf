import { useEffect, useState } from 'react'
import HomeContent from './pages/home/HomeContent'
import JacDocEditor from './pages/editor/JacDocEditor'
import { useJacDoc } from './hooks/useJacDoc'
import Settings from '@/shared/components/ui/Settings'

// Shell de l'app JacDoc — monté par le routeur racine quand
// launcherStore.currentApp === 'jacdoc'.
//
// Phase 1 : pas de multi-onglets ni de breadcrumb — on bascule simplement
// entre l'accueil (liste des documents) et l'éditeur (un seul doc ouvert
// à la fois) via un state local `openDocId`. Quand on ajoutera des onglets
// ou un breadcrumb « Documents > Mon doc », ce sera évoluable ici sans
// toucher aux composants enfants (Home + Editor restent inchangés).
//
// La création d'un nouveau doc passe par NewJacDocModal (depuis Home), qui
// appelle onCreate → jacdocStore.create() → onOpenDoc(doc) → setOpenDocId.

// Styles inline extraits en const module pour ne PAS avoir de double
// accolade JSX dans le fichier.
const ERROR_BOX_STYLE = {
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  color: '#6b7280',
  fontFamily: 'Inter, system-ui, sans-serif',
}
const ERROR_BTN_STYLE = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid #2a3347',
  background: 'transparent',
  color: '#d1d5db',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
}

export default function JacDocApp(props) {
  const [openDocId, setOpenDocId] = useState(null)

  // Écoute l'événement global 'jacdoc_openCloudPicker' émis par la section
  // Paramètres → JacDoc → Cloud (bouton « Gérer mes documents cloud »).
  // Comportement : ferme le doc éventuellement ouvert pour revenir au
  // home, puis re-dispatch un événement plus spécifique 'jacdoc_showCloudPicker'
  // que HomeContent peut intercepter pour ouvrir JacdocCloudFilePicker.
  //
  // On utilise le pattern emit-from-anywhere/listen-once-at-shell :
  // FullSettingsModal et CloudSection ne savent pas où vit le picker,
  // donc ils dispatchent simplement l'event et c'est le shell qui sait
  // comment naviguer pour le faire apparaître.
  useEffect(() => {
    const onOpenPicker = () => {
      // Ferme l'éditeur (retour au home) pour que HomeContent soit monté.
      setOpenDocId(null)
      // Petit délai pour laisser HomeContent monter et brancher son listener
      // avant que le second event arrive (similaire au flow JacPDF Cloud
      // dans launcher → home → jacpdf:openCloudFile).
      setTimeout(() => {
        window.dispatchEvent(new Event('jacdoc_showCloudPicker'))
      }, 80)
    }
    window.addEventListener('jacdoc_openCloudPicker', onOpenPicker)
    return () => window.removeEventListener('jacdoc_openCloudPicker', onOpenPicker)
  }, [])

  // Écran accueil : on injecte onOpenDoc pour que HomeContent puisse nous
  // remonter le doc fraîchement créé (ou cliqué dans la grille des récents).
  if (!openDocId) {
    return (
      <HomeContent
        {...props}
        onOpenDoc={(doc) => setOpenDocId(doc?.id || null)}
      />
    )
  }

  return (
    <EditorScreen
      docId={openDocId}
      onBack={() => setOpenDocId(null)}
    />
  )
}

// Écran éditeur — hydrate le doc via useJacDoc puis monte JacDocEditor.
// Le retour à l'accueil se fait via un clic sur le logo « JacDoc » dans le
// topbar de l'éditeur (prop onBack passée à JacDocEditor).
function EditorScreen({ docId, onBack }) {
  const { loading, doc, error, updateDoc, updateTitle, saveState } = useJacDoc(docId)
  // Panneau Paramètres (même composant partagé que JacPDF). On force
  // disableFullSettings=true car la modale FullSettings n'est pas encore
  // adaptée pour JacDoc — le bouton « Afficher tous les paramètres » reste
  // visible mais inactif. Le bouton « Version » (VersionModal) continue de
  // fonctionner normalement et lit le numéro depuis appChangelogs.js.
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (loading) {
    return <div className="jacdoc-loading">Chargement…</div>
  }

  if (error || !doc) {
    return (
      <div className="jacdoc-loading" style={ERROR_BOX_STYLE}>
        <span>Document introuvable.</span>
        <button type="button" style={ERROR_BTN_STYLE} onClick={onBack}>
          Retour à l'accueil
        </button>
      </div>
    )
  }

  return (
    <>
      <JacDocEditor
        docId={doc.id}
        initialDoc={doc.doc}
        title={doc.title}
        onChange={updateDoc}
        onRename={updateTitle}
        saveState={saveState}
        onOpenSettings={() => setSettingsOpen(true)}
        onBack={onBack}
      />
      {settingsOpen && (
        <Settings
          onClose={() => setSettingsOpen(false)}
          inEditor
          disableFullSettings
          appName="JacDoc"
        />
      )}
    </>
  )
}