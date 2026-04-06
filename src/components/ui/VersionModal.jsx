import './VersionModal.css'

const VERSIONS = [
  {
    version: 'v15.9.1', date: '22 mars 2026', actuelle: true,
    notes: [
      { type: 'FIX', text: "Notes de version : animation fade + slide à l'expansion des versions précédentes — plus de flash/clignotement" },
    ]
  },
  {
    version: 'v15.9', date: '22 mars 2026',
    notes: [
      { type: 'NOUVEAU', text: 'Nouveau logo JacPDF — icône document verte + texte Jac blanc / PDF vert néon (#39FF14) sur les 3 écrans' },
      { type: 'NOUVEAU', text: "Couleur d'accent par défaut remplacée par le vert néon du logo (#39FF14)" },
      { type: 'FIX', text: "Logo accueil : séparé du système de traduction JS pour éviter l'écrasement du SVG" },
      { type: 'FIX', text: "Logo éditeur : couleurs sombres solides, suppression de l'effet blanc sur l'icône" },
      { type: 'FIX', text: "Barre de scroll : couleur changée de l'accent vers un gris neutre (#4a5068)" },
    ]
  },
  {
    version: 'v15.8.5', date: '11 mars 2026',
    notes: [
      { type: 'FIX', text: "Suppression définitive du popup d'exportation PDF — jamais fonctionnel, retiré du code, de l'interface et des styles" },
    ]
  },
  {
    version: 'v15.8.4', date: '9 mars 2026',
    notes: [
      { type: 'FIX', text: 'PDF vierge : draw-canvas redimensionné au moment de la création (images visibles)' },
      { type: 'FIX', text: 'Images : toolbar hover recentrée horizontalement sur la boîte après rotation' },
    ]
  },
  {
    version: 'v15.8.3', date: '9 mars 2026',
    notes: [
      { type: 'FIX', text: "Images : boîte de survol (hover) tourne avec l'image via CSS transform" },
      { type: 'FIX', text: 'Images : pad hover box fixé à 6px (au lieu de stroke.size)' },
    ]
  },
  {
    version: 'v15.8.2', date: '9 mars 2026',
    notes: [
      { type: 'FIX', text: 'Images : clic/survol tient compte de la rotation (hit test dans repère local)' },
      { type: 'FIX', text: 'Marquee : les images sont maintenant incluses dans la sélection par drag' },
      { type: 'FIX', text: 'Images : bouton rotation toolbar fait -45° (identique aux zones de texte)' },
    ]
  },
  {
    version: 'v15.8.1', date: '9 mars 2026',
    notes: [
      { type: 'FIX', text: 'Images : boite de selection et handles tournent avec image via CSS transform' },
    ]
  },
  {
    version: 'v15.8', date: '9 mars 2026',
    notes: [
      { type: 'NOUVEAU', text: 'Images : bouton rotation arc bas-gauche (drag libre) identique aux zones de texte' },
      { type: 'NOUVEAU', text: 'Images : rotation stockée dans stroke.rotation, appliquée sur le canvas avec ctx.rotate' },
      { type: 'AMÉLIO', text: 'Images : bouton 90° dans la toolbar utilise désormais stroke.rotation' },
    ]
  },
  {
    version: 'v15.7.6', date: '9 mars 2026',
    notes: [
      { type: 'FIX', text: 'Hover-toolbar : se repositionne après un clic rotation depuis la toolbar' },
    ]
  },
  {
    version: 'v15.7.5', date: '8 mars 2026',
    notes: [
      { type: 'FIX', text: 'Hover-toolbar zone de texte : se repositionne correctement au-dessus après une rotation' },
    ]
  },
  {
    version: 'v15.7.4', date: '8 mars 2026',
    notes: [
      { type: 'FIX', text: "Hover-toolbar zone de texte : ancrée dans le pageContainer (position absolue), ne bouge plus jamais au scroll" },
    ]
  },
  {
    version: 'v15.7.3', date: '8 mars 2026',
    notes: [
      { type: 'AMÉLIO', text: "Bouton rotation : cercle coupé au coin — seul l'arc extérieur est visible, sans icône" },
    ]
  },
  {
    version: 'v15.7.2', date: '8 mars 2026',
    notes: [
      { type: 'FIX', text: 'Zone de texte : impossible de sortir du canvas (drag, resize et création clampés aux limites du PDF)' },
    ]
  },
  {
    version: 'v15.7.1', date: '8 mars 2026',
    notes: [
      { type: 'FIX', text: "Rotation zone de texte : plus de saut immédiat au mousedown, rotation par delta d'angle" },
    ]
  },
  {
    version: 'v15.7', date: '8 mars 2026',
    notes: [
      { type: 'NOUVEAU', text: 'Zone de texte : bouton rotation circulaire ajouté au coin bas-gauche (autour du resize)' },
      { type: 'FIX', text: 'Suppression zone de texte via X : la hover-toolbar disparaît correctement' },
    ]
  },
  {
    version: 'v15.6.1', date: '8 mars 2026',
    notes: [
      { type: 'AMÉLIO', text: 'Interligne : valeurs en pt (0.7pt → 4.0pt), défaut 1.5pt' },
    ]
  },
  {
    version: 'v15.6', date: '8 mars 2026',
    notes: [
      { type: 'NOUVEAU', text: "Barre de formatage : sélecteur d'interligne (×1 à ×2.5)" },
    ]
  },
  {
    version: 'v15.5.2', date: '8 mars 2026',
    notes: [
      { type: 'AMÉLIO', text: 'Aperçus du popup agrandis (260×340px) pour une meilleure lisibilité' },
    ]
  },
  {
    version: 'v15.5.1', date: '8 mars 2026',
    notes: [
      { type: 'AMÉLIO', text: '« Ajouter une page » rendus en haute résolution (2×) — plus de pixelisation' },
    ]
  },
  {
    version: 'v15.5', date: '8 mars 2026',
    notes: [
      { type: 'NOUVEAU', text: '« Obtenir la même page » pour dupliquer une page existante' },
      { type: 'NOUVEAU', text: 'Si une seule page : duplication directe. Si plusieurs pages : sélecteur pour choisir la page source' },
    ]
  },
  {
    version: 'v15.4', date: '8 mars 2026',
    notes: [
      { type: 'FIX', text: "Raccourcis clavier désactivés sur l'écran d'accueil" },
      { type: 'FIX', text: "Menus outils/vue fermés automatiquement au retour à l'accueil" },
      { type: 'FIX', text: "Panneaux d'outils (dessin, forme, texte, etc.) fermés au retour à l'accueil" },
    ]
  },
  {
    version: 'v15.3', date: '8 mars 2026',
    notes: [
      { type: 'AMÉLIO', text: 'Zone de texte : se colle automatiquement autour du contenu à la désélection' },
      { type: 'AMÉLIO', text: "Si redimensionnée manuellement, la zone garde sa taille (pas d'auto-fit)" },
    ]
  },
  {
    version: 'v15.2', date: '8 mars 2026',
    notes: [
      { type: 'AMÉLIO', text: 'Zone de texte déposée hors du PDF : repositionnement automatique avec animation dans la page la plus proche' },
    ]
  },
  {
    version: 'v15.1', date: '8 mars 2026',
    notes: [
      { type: 'AMÉLIO', text: 'Barre du haut refactorisée en top-bar responsive — plus aucun chevauchement au redimensionnement' },
    ]
  },
  {
    version: 'v15', date: '4 mars 2026',
    notes: [
      { type: 'NOUVEAU', text: 'Authentification complète : connexion, inscription, SSO Google / Facebook / Spotify' },
      { type: 'NOUVEAU', text: 'Mode sans compte avec popup de bienvenue pour entrer son prénom' },
      { type: 'NOUVEAU', text: 'Outils de dessin repensés : crayon, surligneur, épaisseur de 1 à 80' },
      { type: 'NOUVEAU', text: 'Sélecteur de couleurs professionnel avec réglage luminosité et code hexadécimal' },
      { type: 'NOUVEAU', text: 'Recherche Google Images intégrée pour insérer des images directement' },
      { type: 'NOUVEAU', text: 'Intégration YouTube : coller un lien pour insérer une vidéo dans le PDF' },
      { type: 'NOUVEAU', text: "Personnalisation de la barre d'outils depuis les paramètres" },
      { type: 'NOUVEAU', text: "Fenêtre de paramètres dédiée lors de l'ajout de nouvelles pages" },
      { type: 'AMÉLIO', text: "Refonte massive de l'interface — véritable écosystème complet" },
    ]
  },
  {
    version: 'v9.5', date: '1 mars 2026',
    notes: [
      { type: 'AMÉLIO', text: 'Passage à Claude Sonnet 4.6 pour la génération du code' },
      { type: 'AMÉLIO', text: 'Amélioration de la stabilité et de la réactivité générale' },
      { type: 'AMÉLIO', text: 'Consolidation de toutes les fonctionnalités des versions précédentes' },
    ]
  },
  {
    version: 'v6.5.1', date: '28 février 2026',
    notes: [
      { type: 'NOUVEAU', text: 'Mode Présentation intégré' },
      { type: 'NOUVEAU', text: 'Rotation des pages (sens horaire et antihoraire)' },
      { type: 'NOUVEAU', text: 'Vue deux pages côte à côte' },
      { type: 'NOUVEAU', text: "Outil Masquage d'écran" },
      { type: 'NOUVEAU', text: 'Reconnaissance de texte OCR' },
      { type: 'NOUVEAU', text: "Thèmes dans les paramètres avec choix de la couleur d'accent" },
    ]
  },
  {
    version: 'v6.5', date: '28 février 2026',
    notes: [
      { type: 'NOUVEAU', text: 'Ouverture de fichiers depuis Google Drive et OneDrive' },
      { type: 'NOUVEAU', text: 'Création de PDF avancée : type de page, format, orientation, couleur de fond' },
      { type: 'NOUVEAU', text: 'Édition de texte enrichie : polices, taille, gras, italique, souligné' },
      { type: 'NOUVEAU', text: 'Clavier de symboles mathématiques' },
      { type: 'NOUVEAU', text: 'Export avancé : PDF original, avec annotations, ou annotations seules' },
      { type: 'NOUVEAU', text: 'Menu des raccourcis clavier dans les paramètres' },
    ]
  },
  {
    version: 'v1.5', date: '14 février 2026',
    notes: [
      { type: 'AMÉLIO', text: 'Rebranding : renommé "JacPDF" (anciennement Éditeur PDF Glassmorphism)' },
      { type: 'AMÉLIO', text: "Remaniement mineur de l'interface utilisateur" },
    ]
  },
  {
    version: 'v1.1', date: '14 février 2026',
    notes: [
      { type: 'NOUVEAU', text: 'Section Crédits dans les paramètres (Jacob Veilleux + Claude Sonnet 4.5)' },
    ]
  },
  {
    version: 'v1.0', date: '14 février 2026',
    notes: [
      { type: 'NOUVEAU', text: 'Première version — interface style Glassmorphism' },
      { type: 'NOUVEAU', text: 'Importation de PDF et création de documents vierges' },
      { type: 'NOUVEAU', text: 'Gestion des fichiers récents' },
      { type: 'NOUVEAU', text: 'Outils de base : Sélection, Texte, Signature, Gomme, Formes' },
      { type: 'NOUVEAU', text: 'Gestion des couleurs premier plan / arrière-plan' },
      { type: 'NOUVEAU', text: 'Exportation simple du PDF' },
      { type: 'NOUVEAU', text: 'Choix de la langue (Français / Anglais)' },
    ]
  },
]

export default function VersionModal({ onClose }) {
  return (
    <div className="vm-overlay" onClick={onClose}>
      <div className="vm-card" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="vm-header">
          <div className="vm-header-left">
            <div className="vm-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2EFF6E" strokeWidth="2">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
            </div>
            <div>
              <p className="vm-title">Notes de version</p>
              <p className="vm-subtitle">JacPDF</p>
            </div>
          </div>
          <button className="vm-close" onClick={onClose}>✕</button>
        </div>

        {/* Version list */}
        <div className="vm-list">
          {VERSIONS.map((v, i) => (
            <div key={i} className="vm-version-block">
              <div className="vm-version-header">
                <span className="vm-version-tag">{v.version}</span>
                <span className="vm-version-date">{v.date}</span>
                {v.actuelle && <span className="vm-actuelle">ACTUELLE</span>}
              </div>
              {v.notes.map((note, j) => (
                <div key={j} className="vm-note-row">
                  <span className={`vm-badge vm-badge-${note.type.toLowerCase()}`}>{note.type}</span>
                  <span className="vm-note-text">{note.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}