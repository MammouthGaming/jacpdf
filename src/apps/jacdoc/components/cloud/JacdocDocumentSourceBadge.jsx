const SOURCE_LOGOS = {
  drive: new URL('../../../../../logo/Google Drive.svg', import.meta.url).href,
  jaccloud: new URL('../../../../../logo/JacCloud.svg', import.meta.url).href,
}

// Badge « source du document » dans la topbar JacDoc — calque exact du
// DocumentSourceBadge.jsx de JacPDF, skin vert JacDoc.
// À gauche du nom du fichier dans JacDocTopbar, on affiche d'où vient
// le document actuellement ouvert :
//   - 'local'       → icône ordinateur + « Ordinateur »
//   - 'drive'       → logo Google Drive + « Google Drive »
//                     (+ dossier parent si driveFolderName est fourni)
//   - 'jacdocCloud' → icône nuage vert + « JacDoc Cloud »
//
// Inspiré de la barre du haut de Kami / Google Docs, où la provenance
// du fichier vit toujours à gauche du titre.
//
// Props :
// - source           : 'local' | 'drive' | 'jacdocCloud' | null/undefined
//                      Si null/undefined, le composant ne rend rien.
// - driveFolderName  : nom du dossier parent dans Drive. Affiché après
//                      un séparateur « / » uniquement si source === 'drive'.
// - onClick          : handler optionnel — à brancher plus tard sur un
//                      futur « Afficher dans Drive / Révéler dans le Finder ».

export default function JacdocDocumentSourceBadge({ source, driveFolderName, onClick }) {
  if (!source) return null

  if (source === 'drive') {
    return (
      <div
        className="jacdoc-topbar-source jacdoc-topbar-source-drive"
        onClick={onClick}
      >
        <img src={SOURCE_LOGOS.drive} alt="" className="jacdoc-topbar-source-logo" draggable="false" />
        <span className="jacdoc-topbar-source-label">Google Drive</span>
        {driveFolderName && (
          <>
            <span className="jacdoc-topbar-source-sep">/</span>
            <span className="jacdoc-topbar-source-folder">{driveFolderName}</span>
          </>
        )}
      </div>
    )
  }

  if (source === 'jacdocCloud') {
    return (
      <div
        className="jacdoc-topbar-source jacdoc-topbar-source-jacdoc-cloud"
        onClick={onClick}
      >
        <img src={SOURCE_LOGOS.jaccloud} alt="" className="jacdoc-topbar-source-logo" draggable="false" />
        <span className="jacdoc-topbar-source-label">JacDoc Cloud</span>
      </div>
    )
  }

  // source === 'local' (ou tout sauf 'drive'/'jacdocCloud') — fichier de l'ordinateur.
  return (
    <div
      className="jacdoc-topbar-source jacdoc-topbar-source-local"
      onClick={onClick}
    >
      {/* Icône ordinateur portable (laptop) */}
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="12" rx="2"/>
        <line x1="2" y1="20" x2="22" y2="20"/>
      </svg>
      <span className="jacdoc-topbar-source-label">Ordinateur</span>
    </div>
  )
}