// Badge « source du document » dans la TopBar — Finition 1.5.
// À droite du nom de fichier dans EditorTopBar, on affiche d'où vient le
// PDF actuellement ouvert :
//   - 'local'        → icône ordinateur + « Ordinateur »
//   - 'drive'        → logo Google Drive + « Google Drive »
//                      (+ dossier parent si driveFolderName est fourni)
//   - 'jacpdfCloud'  → icône nuage néon + « JacPDF Cloud »
// Inspiré de la barre du haut de Kami.
//
// Props :
// - source           : 'local' | 'drive' | 'jacpdfCloud' | null/undefined
//                      Si null/undefined, le composant ne rend rien.
// - driveFolderName  : nom du dossier parent dans Drive. Affiché après un
//                      séparateur « / » uniquement si source === 'drive'.
// - onClick          : handler optionnel — à brancher plus tard sur un
//                      futur « Afficher dans Drive / Révéler dans le Finder ».

export default function DocumentSourceBadge({ source, driveFolderName, onClick }) {
  if (!source) return null

  if (source === 'drive') {
    return (
      <div
        className="topbar-source topbar-source-drive"
        onClick={onClick}
      >
        {/* Logo officiel Google Drive (triangle multicolore) */}
        <svg width="14" height="14" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/>
          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
        </svg>
        <span className="topbar-source-label">Google Drive</span>
        {driveFolderName && (
          <>
            <span className="topbar-source-sep">/</span>
            <span className="topbar-source-folder">{driveFolderName}</span>
          </>
        )}
      </div>
    )
  }

  if (source === 'jacpdfCloud') {
    return (
      <div
        className="topbar-source topbar-source-jacpdf-cloud"
        onClick={onClick}
      >
        {/* Icône nuage — vert néon JacPDF */}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#39FF14" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78 6 6 0 0 0-11.6 2.28A4 4 0 0 0 6 19h11.5z"/>
        </svg>
        <span className="topbar-source-label">JacPDF Cloud</span>
      </div>
    )
  }

  // source === 'local' (ou tout sauf 'drive'/'jacpdfCloud') — fichier de l'ordinateur.
  return (
    <div
      className="topbar-source topbar-source-local"
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
      <span className="topbar-source-label">Ordinateur</span>
    </div>
  )
}