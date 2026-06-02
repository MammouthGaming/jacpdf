import { useState, useEffect, useRef } from 'react'
import { SizeSelect } from './Toolbar'
import { textFmtStore } from '@/shared/stores/ui//textFmtStore'
import { formatBarStyleStore } from '@/shared/stores/ui//formatBarStyleStore'
import './FormatBar.css'

const FONTS = [
  'Arial',
  'Archivo Black',
  'Comic Neue',
  'Concert One',
  'Dancing Script',
  'Indie Flower',
  'Inter',
  'Kameron',
  'Kreon',
  'Lexend',
  'Londrina Outline',
  'Merriweather',
  'Montserrat',
  'Mulish',
  'Open Dyslexic',
  'Open Sans',
  'Open Sans Condensed',
  'Oswald',
  'Playfair Display',
  'Playwrite US Modern',
  'Playwrite US Trad',
  'Poiret One',
  'Poppins',
  'PT Sans',
  'PT Sans Narrow',
  'Quicksand',
  'Raleway Dots',
  'Roboto',
  'Roboto Mono',
  'Short Stack',
  'Sniglet',
  'Teachers',
  'Times New Roman',
  'Titillium Web',
  'Ubuntu',
]
const SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96]
const LINE_HEIGHTS = [
  { label: '1pt',   value: 1 },
  { label: '1.2pt', value: 1.2 },
  { label: '1.5pt', value: 1.5 },
  { label: '1.8pt', value: 1.8 },
  { label: '2pt',   value: 2 },
  { label: '2.5pt', value: 2.5 },
  { label: '3pt',   value: 3 },
  { label: '4pt',   value: 4 },
]

// Styles inline extraits en constantes JS : on évite ainsi `style={ { ... } }`
// (les doubles accolades sont sinon interprétées comme des placeholders
// par le système d'édition de pages).
const italicStyle    = { fontFamily: 'Georgia, serif' }
const underlineStyle = { textDecoration: 'underline' }
const disabledBtnStyle = { opacity: 0.35, cursor: 'not-allowed' }
// Style pour les boutons « placés mais pas encore fonctionnels » —
// légère opacité + curseur d'aide pour signaler « bientôt disponible ».
const placeholderBtnStyle = { opacity: 0.55, cursor: 'help' }
const strikeStyle = { textDecoration: 'line-through' }
// Style pour le « 2 » des boutons indice/exposant dans la FormatBar.
// ⚠️ verticalAlign ne marche PAS dans .fbar-btn parce que le bouton
// est display:flex avec align-items:center qui centre tous les enfants
// verticalement, peu importe leur verticalAlign inline. On utilise donc
// position:relative + top pour offset le « 2 » : top négatif = monte
// (exposant), top positif = descend (indice). Les deux « 2 » sont
// déplacés d'environ une demi-ligne par rapport au « X » adjacent, donc
// la différence haut/bas est immédiatement visible.
const subStyle    = { fontSize: '0.55em', position: 'relative', top: '0.4em' }
const supStyle    = { fontSize: '0.55em', position: 'relative', top: '-0.5em' }
const formulaStyle = { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 600 }

// === Emoji picker ===
// Set d'emojis fréquents groupés par catégorie. Pas de recherche pour
// rester simple ; on pourra brancher emoji-picker-element plus tard pour
// couvrir tout l'unicode si besoin.
const EMOJI_CATEGORIES = [
  { name: 'Sourires', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😋','😛','🤪','🤨','🧐','🤓','😎','🥳','🤗','🤔','😏','😴','😌','🥲','🥹','😬','😮','😲','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🥺','😢','😭','😤','😠','😡','🤬','🤢','🤮','🤧','😷','🤒','🤕','🥴','😵','🤠','🤡','👻','💀','👽','🤖','🎃','😺','😻','😼','😽','🙀','😿','😾'] },
  { name: 'Gestes & corps', emojis: ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤝','🙌','👏','🙏','💪','🦾','🫶','🤲','🤜','🤛','✊','👊','🛵','👀','👁️','👂','🦻','👃','👄','🦷','🧠','🫀','🫁'] },
  { name: 'Cœurs', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️'] },
  { name: 'Objets', emojis: ['⭐','🌟','✨','💫','🔥','💯','✅','❌','⚠️','📌','📍','🎯','🎉','🎊','🎁','🎈','🎂','📝','📚','💡','🔔','🔑','🔒','🔓','💼','📎','✂️','📅','🕐','🏆','🥇','🥈','🥉','🎵','🎶','📷','📹','💻','📱','⌨️','🖨️'] },
  { name: 'Symboles', emojis: ['➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','🔄','🔁','🔂','▶️','⏸️','⏹️','⏺️','⏭️','⏮️','🔼','🔽','➕','➖','✖️','➗','💲','♾️','❓','❔','❗','❕','‼️','⁉️','💭','💬','🗨️','🔯'] },
]

// Position du popup : au-dessus du bouton si celui-ci est dans la moitié
// basse du viewport (variant 'classic' = FormatBar en bas), sinon en
// dessous (variant 'topbar' = FormatBar en haut). Aligné à droite avec
// le bouton puisque le bouton emoji est le dernier de la barre.
// Le popup est positionné en CSS pur via .fbar-emoji-picker
// (position:absolute relative à .fbar-emoji-host qui wrap le bouton).
// On évite ainsi le piou-piou de position:fixed dans un parent
// transformé : .fbar-wrapper a translateX(-50%) qui crée un containing
// block pour les position:fixed descendants, donc des coords viewport
// calculées en JS étaient appliquées RELATIVEMENT au wrapper, pas au
// viewport. La solution CSS pure (position:absolute relative au host)
// bypass ce piou-piou.

// Composant interne : popup affichant les catégories d'emojis. onPick reçoit
// l'emoji sélectionné ; onClose est appelé sur clic extérieur (hors trigger
// et hors picker). Le listener pointerdown est attaché APRÈS le render donc
// le clic qui a ouvert le picker ne le re-déclenche pas.
function EmojiPicker({ onPick, onClose }) {
  useEffect(() => {
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('.fbar-emoji-picker')) return
      // Même comportement que le ColorPicker : si on clique dans la FormatBar
      // pendant que le menu emoji est ouvert, on ferme le menu ET on laisse le
      // bouton cliqué faire son action. Cas spécial : recliquer sur le bouton
      // emoji doit seulement fermer le menu, pas le rouvrir dans le même click.
      if (e.target.closest && e.target.closest('.fbar-wrapper')) {
        if (e.target.closest('.fbar-emoji-trigger')) {
          window.__jacpdfSuppressEmojiPickerReopen = true
          setTimeout(() => { window.__jacpdfSuppressEmojiPickerReopen = false }, 0)
        }
        onClose()
        return
      }
      onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [onClose])

  return (
    <div className="fbar-emoji-picker">
      {EMOJI_CATEGORIES.map(cat => (
        <div key={cat.name} className="fbar-emoji-cat">
          <div className="fbar-emoji-cat-title">{cat.name}</div>
          <div className="fbar-emoji-grid">
            {cat.emojis.map((em, i) => (
              <button
                key={cat.name + '-' + i}
                className="fbar-emoji-cell"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.preventDefault(); onPick(em) }}
                title={em}
              >{em}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Polices qui n'existent qu'en un seul poids ou sans italique — on grise
// les boutons B/I correspondants quand l'une d'elles est sélectionnée, et
// on auto-clear le style actif au changement de police (cf. onChange du
// SizeSelect font ci-dessous). Synchronisé avec FONT_REGISTRY de bakePdf.js
// (les polices absentes de ces sets sont supposées supporter B+I).
const FONTS_NO_BOLD = new Set([
  'Archivo Black', 'Concert One', 'Indie Flower', 'Londrina Outline',
  'Playwrite US Modern', 'Playwrite US Trad', 'Poiret One', 'Raleway Dots',
  'Short Stack',
])
const FONTS_NO_ITALIC = new Set([
  'Archivo Black', 'Concert One', 'Dancing Script', 'Indie Flower',
  'Kameron', 'Kreon', 'Lexend', 'Londrina Outline', 'Open Sans Condensed',
  'Oswald', 'Playwrite US Modern', 'Playwrite US Trad', 'Poiret One',
  'PT Sans Narrow', 'Quicksand', 'Raleway Dots', 'Short Stack', 'Sniglet',
])

// === Math symbols picker ===
// Catalogue de symboles mathématiques groupés par catégorie. Pour la
// recherche : on filtre par nom de catégorie + keywords (les symboles
// eux-mêmes sont visuels donc difficiles à matcher au clavier ; les
// keywords donnent un point d'entrée textuel à chaque catégorie).
const MATH_CATEGORIES = [
  {
    name: 'Lettres grecques',
    keywords: 'grec greek alpha beta gamma delta epsilon theta lambda mu pi sigma omega phi',
    symbols: ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','π','ρ','σ','τ','υ','φ','χ','ψ','ω','Γ','Δ','Θ','Λ','Ξ','Π','Σ','Φ','Ψ','Ω'],
  },
  {
    name: 'Opérateurs de base',
    keywords: 'operator plus moins fois divise egal infini',
    symbols: ['+','−','×','÷','=','±','∓','≠','≈','≅','≡','∝','∞','‰','‱'],
  },
  {
    name: 'Comparaison',
    keywords: 'compare inferior superior',
    symbols: ['<','>','≤','≥','≪','≫','≺','≻','≼','≽'],
  },
  {
    name: 'Ensembles',
    keywords: 'set ensemble union intersection inclusion appartient',
    symbols: ['∅','∪','∩','∖','∁','⊂','⊃','⊆','⊇','∈','∉','∋','∌','ℕ','ℤ','ℚ','ℝ','ℂ','∀','∃','∄'],
  },
  {
    name: 'Calcul & analyse',
    keywords: 'somme produit integrale derivee racine',
    symbols: ['∑','∏','∫','∬','∭','∮','∂','∇','∆','′','″','‴','√','∛','∜','ƒ'],
  },
  {
    name: 'Flèches',
    keywords: 'arrow fleche implication equivalence',
    symbols: ['→','←','↑','↓','↔','↕','⇒','⇐','⇑','⇓','⇔','↦','↪','↩','⟶','⟵','⟷','⟹','⟸','⟺'],
  },
  {
    name: 'Logique',
    keywords: 'logic et ou non therefore donc',
    symbols: ['∧','∨','¬','⊕','⊻','∴','∵','⊢','⊨','⊥','⊤','□','◇'],
  },
  {
    name: 'Géométrie',
    keywords: 'geometrie angle degre parallele perpendiculaire',
    symbols: ['°','∠','∡','∢','⟂','∥','∦','△','▱','○','⌒','⌢','⊿'],
  },
  {
    name: 'Divers',
    keywords: 'misc autre constante',
    symbols: ['…','⋯','⋮','⋱','ℵ','ℏ','ℓ','℘','§','¶','†','‡','★','☆','♦'],
  },
]

// Styles JSX pour les templates math (évite les doubles accolades inline
// qui pourraient être interprétées comme placeholders d'URL compressées).
const tplWrapStyle = { fontStyle: 'italic', fontFamily: 'Times New Roman, serif' }
const tplSubSupStyle = { fontSize: '0.7em' }
// Style pour la prévisualisation du template "surligné" dans le picker
// (text-decoration: overline). Extrait en const pour éviter le piège
// JSX style=... qui se fait casser par le pipeline d'édition.
const tplOverlineStyle = { textDecoration: 'overline' }
// Styles pour la prévisualisation du template "fraction empilée" dans le
// picker. Le wrapper utilise inline-flex column pour empiler numérateur,
// barre et dénominateur. La barre est un span block de hauteur 0 avec
// border-top, qui sert de trait de fraction. Le rendu réel dans le
// textbox utilise les mêmes règles via les selectors [data-math-fraction]
// définis dans TextBox.css.
const tplFracStackedStyle = { display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', verticalAlign: 'middle', fontSize: '0.85em', lineHeight: 1.1, textAlign: 'center' }
const tplFracStackedBarStyle = { display: 'block', height: 0, borderTop: '1px solid currentColor', margin: '1px 0' }

// Templates math à la Kami : symboles avec placeholders qui s'insèrent
// comme du HTML structuré (sub/sup) plutôt qu'un simple caractère.
// Affichés en haut du picker, en vert. Le `display` JSX rend le visuel
// dans la cellule ; le `html` est inséré au caret via insertHTML.
// Cachés quand l'utilisateur tape une recherche (pour laisser place aux
// résultats filtrés).
// Slot éditable : span vide avec ZWSP à l'intérieur (pour avoir une
// position de caret valide quand le slot est vide). La classe .math-slot
// donne le visuel gris (cf. TextBox.css). La classe .math-slot-new est
// un marker temporaire qui sert à retrouver les slots fraîchement
// insérés pour y placer le caret automatiquement (cf. onPick dans
// EquationBar) ; le marker est retiré immédiatement après.
// Style INLINE (et non classe CSS) pour les slots : execCommand('insertHTML')
// dans Chrome passe par un Sanitizer qui STRIPPE les attributs `class`
// mais préserve `style` et `data-*`. C'est pour ça que les slots
// n'étaient pas gris : le `class="math-slot"` disparaissait à l'insertion.
// Le ZWSP  à l'intérieur garantit une position de caret valide
// quand le slot est vide ET empêche certains browsers de "compresser"
// le span vide en le retirant. data-math-slot="new" est notre marker
// temporaire pour retrouver les slots fraîchement insérés et y placer
// le caret (puis on le change en data-math-slot="1" pour le retirer du
// selector ; cf. onPick dans EquationBar).
const SLOT_STYLE = 'display:inline-block;min-width:14px;min-height:1em;background:rgba(150,150,150,0.28);border-radius:3px;padding:0 3px;margin:0 1px;vertical-align:baseline;font-size:inherit;color:inherit'
const SLOT = '<span style="' + SLOT_STYLE + '" data-math-slot="new"></span>'

const MATH_TEMPLATES = [
  // ─── Row 1 ─── Structures de base : indices, exposants,
  // fractions, racines, sommations, intégrales avec bornes.
  {
    name: 'subscript',
    title: 'Indice (aᵢ)',
    display: <span style={tplWrapStyle}>a<sub style={tplSubSupStyle}>b</sub></span>,
    html: SLOT + '<sub>' + SLOT + '</sub>',
  },
  {
    name: 'superscript',
    title: 'Exposant (aⁿ)',
    display: <span style={tplWrapStyle}>a<sup style={tplSubSupStyle}>b</sup></span>,
    html: SLOT + '<sup>' + SLOT + '</sup>',
  },
  {
    name: 'fraction',
    title: 'Fraction inline (ᵃ⁄ᵇ)',
    display: <span style={tplWrapStyle}><sup style={tplSubSupStyle}>a</sup>⁄<sub style={tplSubSupStyle}>b</sub></span>,
    html: '<sup>' + SLOT + '</sup>⁄<sub>' + SLOT + '</sub>',
  },
  {
    name: 'frac-stacked',
    title: 'Fraction empilée (a⁄b vertical)',
    display: (
      <span style={tplFracStackedStyle}>
        <span>a</span>
        <span style={tplFracStackedBarStyle}></span>
        <span>b</span>
      </span>
    ),
    // Wrapper data-math-fraction="wrap" + barre data-math-fraction="bar".
    // Les CSS rules dans TextBox.css transforment l'ensemble en fraction
    // verticale avec numérateur en haut, barre, dénominateur en bas.
    html: '<span data-math-fraction="wrap">' + SLOT + '<span data-math-fraction="bar"></span>' + SLOT + '</span>',
  },
  {
    name: 'sqrt',
    title: 'Racine carrée',
    display: <span style={tplWrapStyle}>√x</span>,
    html: '√' + SLOT,
  },
  {
    name: 'nth-root',
    title: 'Racine n-ième',
    display: <span style={tplWrapStyle}><sup style={tplSubSupStyle}>n</sup>√x</span>,
    html: '<sup>' + SLOT + '</sup>√' + SLOT,
  },
  {
    name: 'sum',
    title: 'Somme avec bornes',
    display: <span style={tplWrapStyle}><sup style={tplSubSupStyle}>n</sup>∑<sub style={tplSubSupStyle}>i=1</sub></span>,
    html: '<sup>' + SLOT + '</sup>∑<sub>' + SLOT + '</sub>' + SLOT,
  },
  {
    name: 'integral',
    title: 'Intégrale avec bornes',
    display: <span style={tplWrapStyle}><sup style={tplSubSupStyle}>b</sup>∫<sub style={tplSubSupStyle}>a</sub></span>,
    html: '<sup>' + SLOT + '</sup>∫<sub>' + SLOT + '</sub>' + SLOT,
  },

  // ─── Row 2 ─── Délimiteurs et modificateurs : parenthèses,
  // crochets, accolades, valeur absolue, partie entière inf./sup.,
  // surlignage, limite.
  {
    name: 'parens',
    title: 'Parenthèses (a)',
    display: <span style={tplWrapStyle}>(x)</span>,
    html: '(' + SLOT + ')',
  },
  {
    name: 'brackets',
    title: 'Crochets [a]',
    display: <span style={tplWrapStyle}>[x]</span>,
    html: '[' + SLOT + ']',
  },
  {
    name: 'braces',
    title: 'Accolades {a}',
    // En JSX, '{' et '}' inline seraient interprétés comme expression
    // delimiters — on les enrobe dans des chaînes.
    display: <span style={tplWrapStyle}>{'{'}x{'}'}</span>,
    html: '{' + SLOT + '}',
  },
  {
    name: 'abs',
    title: 'Valeur absolue |a|',
    display: <span style={tplWrapStyle}>|x|</span>,
    html: '|' + SLOT + '|',
  },
  {
    name: 'floor',
    title: 'Partie entière ⌊xa⌋',
    display: <span style={tplWrapStyle}>⌊x⌋</span>,
    html: '⌊' + SLOT + '⌋',
  },
  {
    name: 'ceil',
    title: 'Partie entière sup. ⌈a⌉',
    display: <span style={tplWrapStyle}>⌈x⌉</span>,
    html: '⌈' + SLOT + '⌉',
  },
  {
    name: 'overline',
    title: 'Surligné (ā)',
    display: <span style={tplWrapStyle}><span style={tplOverlineStyle}>x</span></span>,
    // Le wrapper span garde le text-decoration:overline ; le slot dedans
    // hérite naturellement de la décoration quand l'utilisateur tape.
    html: '<span style="text-decoration:overline">' + SLOT + '</span>',
  },
  {
    name: 'limit',
    title: 'Limite (lim x→a)',
    display: <span style={tplWrapStyle}>lim<sub style={tplSubSupStyle}>x→a</sub></span>,
    // 3 slots : variable (x), cible (a), expression (f(x)).
    html: 'lim<sub>' + SLOT + '→' + SLOT + '</sub>' + SLOT,
  },
]

// Popup affichant les catégories de symboles. Même mécanique que
// EmojiPicker : positionné en CSS absolu via .fbar-eq-symbol-host (qui
// wrap le bouton trigger), close-on-click-outside, focus de l'éditable
// préservé via onMouseDown(preventDefault) sur les cellules.
//
// Le champ search filtre les catégories par .name + .keywords (pas par
// les symboles eux-mêmes — trop pénible à saisir au clavier). On affichera
// un message "Aucun symbole trouvé" si la recherche ne matche rien.
//
// onPick reçoit { text } pour les symboles plats ou { html } pour les
// templates Kami-style (sub/sup) ; le caller route vers insertText ou
// insertHTML selon le cas.
function MathSymbolPicker({ onPick, onClose }) {
  const [query, setQuery] = useState('')
  useEffect(() => {
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('.fbar-eq-symbol-picker')) return
      if (e.target.closest && e.target.closest('.fbar-eq-symbol-trigger')) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? MATH_CATEGORIES.filter(c => c.name.toLowerCase().includes(q) || c.keywords.toLowerCase().includes(q))
    : MATH_CATEGORIES

  return (
    <div className="fbar-eq-symbol-picker">
      <div className="fbar-eq-symbol-search-wrap">
        <svg className="fbar-eq-symbol-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7"/>
          <line x1="16.5" y1="16.5" x2="21" y2="21"/>
        </svg>
        <input
          type="text"
          className="fbar-eq-symbol-search"
          placeholder="Rechercher des symboles"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!q && (
        <div className="fbar-eq-symbol-templates">
          {MATH_TEMPLATES.map((t, i) => (
            <button
              key={'tpl-' + i}
              className="fbar-eq-symbol-template-cell"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.preventDefault(); onPick({ html: t.html }) }}
              title={t.title}
            >{t.display}</button>
          ))}
        </div>
      )}
      {filtered.map(cat => (
        <div key={cat.name} className="fbar-eq-symbol-cat">
          <div className="fbar-eq-symbol-cat-title">{cat.name}</div>
          <div className="fbar-eq-symbol-grid">
            {cat.symbols.map((s, i) => (
              <button
                key={cat.name + '-' + i}
                className="fbar-eq-symbol-cell"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.preventDefault(); onPick({ text: s }) }}
                title={s}
              >{s}</button>
            ))}
          </div>
        </div>
      ))}
      {filtered.length === 0 && (
        <div className="fbar-eq-symbol-empty">Aucun symbole trouvé</div>
      )}
    </div>
  )
}

// === Equation bar ===
// Barre alternative qui prend la place de la FormatBar quand le mode
// équation est actif. Pour l'instant : layout placeholder qui matche le
// mockup (Retour, Math, A souligné, A surligné, taille, stepper, π).
// Tous les contrôles sauf "Retour" sont des placeholders ; on les câblera
// un par un selon les indications de l'utilisateur.
function EquationBar({ onExit }) {
  // État du popup symboles math (déclenché par le bouton π).
  const [symbolOpen, setSymbolOpen] = useState(false)
  return (
    <div className="fbar fbar-eq">
      <button
        className="fbar-btn"
        onPointerDown={(e) => { e.preventDefault(); onExit() }}
        title="Retour"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <div className="fbar-divider" />
      <span className="fbar-eq-label">Math</span>
      <div className="fbar-divider" />
      <button
        className="fbar-btn"
        style={placeholderBtnStyle}
        onPointerDown={(e) => e.preventDefault()}
        title="Couleur du texte (bientôt)"
      >
        <span className="fbar-eq-letter-underline">A</span>
      </button>
      <button
        className="fbar-btn"
        style={placeholderBtnStyle}
        onPointerDown={(e) => e.preventDefault()}
        title="Surlignage (bientôt)"
      >
        <span className="fbar-eq-letter-hatched">A</span>
      </button>
      <div className="fbar-divider" />
      <button
        className="fbar-eq-size"
        style={placeholderBtnStyle}
        onPointerDown={(e) => e.preventDefault()}
        title="Taille (bientôt)"
      >
        <span>14px</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <button
        className="fbar-btn"
        style={placeholderBtnStyle}
        onPointerDown={(e) => e.preventDefault()}
        title="Ajuster (bientôt)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="8 6 12 2 16 6"/>
          <polyline points="8 18 12 22 16 18"/>
          <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 2"/>
        </svg>
      </button>
      <div className="fbar-divider" />
      <div className="fbar-eq-symbol-host">
        <button
          className="fbar-btn fbar-eq-symbol-trigger"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.preventDefault(); setSymbolOpen(o => !o) }}
          title="Symboles"
        >
          <span className="fbar-eq-pi">π</span>
        </button>
        {symbolOpen && (
          <MathSymbolPicker
            onPick={(c) => {
              if (c.html) {
                document.execCommand('insertHTML', false, c.html)
                // Après insertHTML, on retrouve les slots fraîchement
                // insérés via leur classe-marker .math-slot-new (les
                // anciens slots existants n'ont plus cette classe), on
                // retire le marker, puis on place le caret au début du
                // premier slot pour que l'utilisateur puisse taper tout
                // de suite dans la zone ("indice", "n", "radicand", etc).
                const editable = document.activeElement
                if (editable && editable.classList && editable.classList.contains('textbox-editable')) {
                  // Selector data-math-slot="new" plutôt que classe — cf.
                  // commentaire SLOT_STYLE pour le pourquoi du data-* vs class.
                  const fresh = Array.from(editable.querySelectorAll('[data-math-slot="new"]'))
                  fresh.forEach(s => s.setAttribute('data-math-slot', '1'))
                  if (fresh[0]) {
                    const range = document.createRange()
                    range.selectNodeContents(fresh[0])
                    range.collapse(true)
                    const sel = window.getSelection()
                    sel.removeAllRanges()
                    sel.addRange(range)
                  }
                }
              } else {
                document.execCommand('insertText', false, c.text)
              }
              setSymbolOpen(false)
            }}
            onClose={() => setSymbolOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

/**
 * FormatBar unifiée — utilisée à la fois par la toolbar globale (mode store)
 * et par TextBox.jsx (mode controlled, color picker custom, sans bouton liste).
 *
 * Modes fmt :
 *   - Controlled : passer { fmt, onChange }. Le composant n'écoute pas
 *     textFmtStore et délègue toutes les mutations à onChange.
 *   - Store      : ne rien passer. Le composant lit/écrit textFmtStore
 *     directement et se ren-render à chaque update du store.
 *
 * Couleur :
 *   - colorMode='inline' (défaut) : <input type="color"> caché sous le
 *     bouton "A". Convient quand FormatBar n'est PAS dans un parent
 *     transformé (toolbar globale).
 *   - colorMode='picker' : appel onOpenColorPicker(buttonRect) au clic ;
 *     le caller ouvre un ColorPicker custom (TextBox utilise ça parce
 *     que son parent .textbox a transform: rotate qui casserait un popup
 *     position:fixed — cf. fix tool-337).
 *
 * Boutons optionnels :
 *   - showList=true (défaut) : bouton liste à puces. Désactivé par TextBox
 *     parce qu'un <textarea> natif ne supporte pas les listes.
 *
 * Variant (position) :
 *   - variant='classic' : flottante en bas du viewport (24px du bottom).
 *   - variant='topbar'  : collée sous la topbar style Kami (96px du top).
 *   - variant non passé : souscrit au formatBarStyleStore et live-update
 *     au toggle utilisateur dans Apparence > Barre de formatage du texte.
 */
export default function FormatBar({
  fmt: fmtProp,
  onChange,
  colorMode = 'inline',
  onOpenColorPicker,
  showList = true,
  variant: variantProp,
}) {
  // Source du fmt : controlled si fmtProp défini, sinon store (subscribe).
  const [storeFmt, setStoreFmt] = useState(() => textFmtStore.get())
  useEffect(() => {
    if (fmtProp !== undefined) return
    return textFmtStore.subscribe(setStoreFmt)
  }, [fmtProp])
  const fmt = fmtProp !== undefined ? fmtProp : storeFmt
  const setFmt = onChange || ((next) => textFmtStore.set(next))
  const set = (key, val) => setFmt({ ...fmt, [key]: val })

  // Re-render à chaque selectionchange pour que cmdActive(...) reflète
  // l'état du formatage sous le caret/sélection courante du contentEditable.
  // Le listener est document-wide ; le re-render reste cheap puisqu'il ne
  // touche que cette FormatBar (rendue uniquement quand une textbox est
  // en édition).
  const [, forceRev] = useState(0)
  useEffect(() => {
    const onSelChange = () => forceRev(r => r + 1)
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, [])
  // queryCommandState peut throw dans certains contextes (iframe, etc.).
  // Wrap en try/catch pour rester safe.
  const cmdActive = (cmd) => {
    try { return document.queryCommandState(cmd) } catch { return false }
  }
  // Walk DOM manuel pour détecter si le caret est dans un <ol>/<ul> —
  // queryCommandState('insertOrderedList') est peu fiable cross-browser
  // (Firefox notamment renvoie souvent false même quand le caret EST dans
  // une liste). Plus robuste : on remonte les ancestors depuis anchorNode.
  const inListTag = (tag) => {
    try {
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return false
      let node = sel.anchorNode
      while (node && node !== document.body) {
        if (node.nodeType === 1 && node.tagName.toLowerCase() === tag) return true
        node = node.parentNode
      }
      return false
    } catch { return false }
  }

  const runCommand = (e, cmd) => {
    // Feedback visuel immédiat : execCommand change bien le format sous le
    // caret, mais selectionchange ne fire pas toujours tout de suite. Sans
    // forceRev, le bouton (B/I/U/liste/etc.) ne devenait vert qu'à la frappe
    // suivante. On force donc un render maintenant + un micro-tick après que
    // le navigateur ait appliqué l'état de commande.
    e.preventDefault()
    document.execCommand(cmd)
    forceRev(r => r + 1)
    setTimeout(() => forceRev(r => r + 1), 0)
  }

  // État du popup emoji. Position calculée en CSS pure (cf. FormatBar.css
  // .fbar-emoji-picker ancré sur .fbar-emoji-host), donc plus besoin de
  // tracker un rect du bouton trigger.
  const [emojiOpen, setEmojiOpen] = useState(false)
  const fbarWrapperRef = useRef(null)
  const fbarRef = useRef(null)
  const fbarSlideDragRef = useRef({ active: false, startX: 0, startSlide: 0, pointerId: null })
  const [fbarSlideX, setFbarSlideX] = useState(0)
  // Mode équation : remplace temporairement la FormatBar par l'EquationBar
  // (cf. component déclaré ci-dessous). Le bouton "ƒₓ" l'active ; la
  // flèche retour de l'EquationBar le désactive.
  const [equationMode, setEquationMode] = useState(false)

  // Capacités de la police courante (auto-désactive B/I si non supporté).
  const fontHasBold = !FONTS_NO_BOLD.has(fmt.font)
  const fontHasItalic = !FONTS_NO_ITALIC.has(fmt.font)

  // Variant : prop > store (subscribe live).
  const [storeVariant, setStoreVariant] = useState(() => formatBarStyleStore.get())
  useEffect(() => {
    if (variantProp !== undefined) return
    return formatBarStyleStore.subscribe(setStoreVariant)
  }, [variantProp])
  const variant = variantProp !== undefined ? variantProp : storeVariant

  const nextAlign = () => {
    const cycle = { left: 'center', center: 'right', right: 'left' }
    set('align', cycle[fmt.align] || 'left')
  }

  const AlignIcon = () => {
    if (fmt.align === 'center') return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    )
    if (fmt.align === 'right') return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    )
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    )
  }

  // Barre de couleur sous le "A" — reflet de la couleur courante du texte.
  const colorBarStyle = { background: fmt.color || '#000' }

  // Comme le titre du PDF dans la topbar : si la FormatBar dépasse de la
  // fenêtre, on peut la faire glisser horizontalement pour voir les boutons
  // cachés à gauche/droite. On ne démarre pas le drag depuis les boutons ou
  // les menus pour ne pas casser les actions existantes.
  const clampFbarSlide = (next) => {
    const bar = fbarRef.current
    if (!bar) return 0
    const safeViewportW = window.innerWidth - 24
    const overflow = Math.max(0, bar.getBoundingClientRect().width - safeViewportW)
    if (overflow <= 0) return 0
    const max = overflow / 2
    return Math.max(-max, Math.min(max, next))
  }

  const handleFbarSlidePointerDown = (e) => {
    if (
      e.target.closest?.('button, input, select, textarea, .tb-size-select, .tb-size-popup, .fbar-emoji-picker, .fbar-eq-symbol-picker')
    ) return
    const maxProbe = Math.abs(clampFbarSlide(999999))
    if (maxProbe <= 0) return

    fbarSlideDragRef.current = {
      active: true,
      startX: e.clientX,
      startSlide: fbarSlideX,
      pointerId: e.pointerId,
    }
    fbarWrapperRef.current?.setPointerCapture?.(e.pointerId)
  }

  const handleFbarSlidePointerMove = (e) => {
    const drag = fbarSlideDragRef.current
    if (!drag.active) return
    setFbarSlideX(clampFbarSlide(drag.startSlide + (e.clientX - drag.startX)))
    e.preventDefault()
  }

  const handleFbarSlidePointerUp = () => {
    const drag = fbarSlideDragRef.current
    if (drag.pointerId != null) {
      fbarWrapperRef.current?.releasePointerCapture?.(drag.pointerId)
    }
    fbarSlideDragRef.current = { active: false, startX: 0, startSlide: 0, pointerId: null }
    setFbarSlideX(prev => clampFbarSlide(prev))
  }

  const handleFbarWheel = (e) => {
    const maxProbe = Math.abs(clampFbarSlide(999999))
    if (maxProbe <= 0) return
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    setFbarSlideX(prev => clampFbarSlide(prev - delta))
    e.preventDefault()
  }

  useEffect(() => {
    const onResize = () => setFbarSlideX(prev => clampFbarSlide(prev))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const fbarWrapperStyle = { '--fbar-slide-x': `${fbarSlideX}px` }

  return (
    <div
      ref={fbarWrapperRef}
      className={`fbar-wrapper style-${variant || 'classic'}`}
      style={fbarWrapperStyle}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerDownCapture={handleFbarSlidePointerDown}
      onPointerMove={handleFbarSlidePointerMove}
      onPointerUp={handleFbarSlidePointerUp}
      onPointerCancel={handleFbarSlidePointerUp}
      onWheel={handleFbarWheel}
      onClick={(e) => e.stopPropagation()}
    >
      {equationMode && <EquationBar onExit={() => setEquationMode(false)} />}
      {!equationMode && (
      <div className="fbar" ref={fbarRef}>

        {/* Font family */}
        <SizeSelect
          value={fmt.font}
          options={FONTS}
          onChange={(v) => setFmt({
            ...fmt,
            font: v,
            // Si la nouvelle police ne supporte pas un style actif, on le clear.
            bold: FONTS_NO_BOLD.has(v) ? false : fmt.bold,
            italic: FONTS_NO_ITALIC.has(v) ? false : fmt.italic,
          })}
          className="fbar-custom-select fbar-font-select"
          popupMinWidth={190}
          optionFontFamily
        />

        <div className="fbar-divider" />

        {/* Font size */}
        <SizeSelect
          value={fmt.size}
          options={SIZES}
          onChange={(v) => set('size', v)}
          optionSuffix="px"
          className="fbar-custom-select fbar-size-select"
        />

        <div className="fbar-divider" />

        {/* Line height */}
        <SizeSelect
          value={fmt.lineHeight}
          options={LINE_HEIGHTS}
          onChange={(v) => set('lineHeight', v)}
          className="fbar-custom-select fbar-lh-select"
          popupMinWidth={110}
        />

        <div className="fbar-divider" />

        {/* Text color */}
        {colorMode === 'picker' ? (
          <button
            className="fbar-color-btn"
            title="Couleur du texte"
            onPointerDown={(e) => {
              e.preventDefault()
              // Si le ColorPicker est déjà ouvert, son listener capture ferme
              // le popup avant que ce handler tourne. Dans le cas où on reclique
              // sur le même bouton couleur, on ne doit PAS le rouvrir dans le
              // même pointerdown : clic couleur = toggle fermer.
              if (window.__jacpdfSuppressColorPickerReopen) {
                window.__jacpdfSuppressColorPickerReopen = false
                return
              }
              onOpenColorPicker?.(e.currentTarget.getBoundingClientRect())
            }}
          >
            <span className="fbar-color-letter">A</span>
            <div className="fbar-color-bar" style={colorBarStyle} />
          </button>
        ) : (
          <div className="fbar-color-btn" title="Couleur du texte">
            <span className="fbar-color-letter">A</span>
            <div className="fbar-color-bar" style={colorBarStyle} />
            <input type="color" className="fbar-color-input" value={fmt.color} onChange={(e) => set('color', e.target.value)} />
          </div>
        )}

        <div className="fbar-divider" />

        {/* Bold — par sélection via execCommand. queryCommandState reflète
            l'état du formatage sous le caret. Si la police courante ne
            supporte pas le gras, on bloque le toggle (le browser ferait
            sinon un faux-gras synthétique qui n'apparaîtrait pas dans le
            PDF puisque embedFont fallback à Helvetica). */}
        <button
          className={`fbar-btn ${cmdActive('bold') ? 'active' : ''}`}
          onPointerDown={(e) => { if (fontHasBold) runCommand(e, 'bold'); else e.preventDefault() }}
          style={!fontHasBold ? disabledBtnStyle : undefined}
          title={fontHasBold ? 'Gras' : `${fmt.font} ne supporte pas le gras`}
        ><strong>B</strong></button>
        {/* Italic — par sélection via execCommand. */}
        <button
          className={`fbar-btn ${cmdActive('italic') ? 'active' : ''}`}
          onPointerDown={(e) => { if (fontHasItalic) runCommand(e, 'italic'); else e.preventDefault() }}
          style={!fontHasItalic ? disabledBtnStyle : undefined}
          title={fontHasItalic ? 'Italique' : `${fmt.font} ne supporte pas l'italique`}
        ><em style={italicStyle}>I</em></button>
        {/* Underline — par sélection via execCommand. */}
        <button className={`fbar-btn ${cmdActive('underline') ? 'active' : ''}`} onPointerDown={(e) => runCommand(e, 'underline')}><span style={underlineStyle}>U</span></button>
        {/* Barré — par sélection via execCommand('strikeThrough'). */}
        <button
          className={`fbar-btn ${cmdActive('strikeThrough') ? 'active' : ''}`}
          onPointerDown={(e) => runCommand(e, 'strikeThrough')}
          title="Barré"
        ><span style={strikeStyle}>S</span></button>

        <div className="fbar-divider" />

        {/* Indice — par sélection via execCommand('subscript'). Le browser
            gère lui-même la mutuelle exclusion avec superscript. */}
        <button
          className={`fbar-btn ${cmdActive('subscript') ? 'active' : ''}`}
          onPointerDown={(e) => runCommand(e, 'subscript')}
          title="Indice"
        >X<span style={subStyle}>2</span></button>
        {/* Exposant — par sélection via execCommand('superscript'). */}
        <button
          className={`fbar-btn ${cmdActive('superscript') ? 'active' : ''}`}
          onPointerDown={(e) => runCommand(e, 'superscript')}
          title="Exposant"
        >X<span style={supStyle}>2</span></button>

        <div className="fbar-divider" />

        {/* Align */}
        <button className="fbar-btn" onPointerDown={(e) => { e.preventDefault(); nextAlign() }}><AlignIcon /></button>

        {/* List (optionnel — caché dans TextBox parce que <textarea> natif ne
            supporte pas les listes). */}
        {showList && (
          <button className={`fbar-btn ${fmt.list ? 'active' : ''}`} onPointerDown={(e) => { e.preventDefault(); set('list', !fmt.list) }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>
        )}

        {/* Liste numérotée — par sélection via execCommand('insertOrderedList').
            Le browser insère/retire un <ol><li> autour des lignes
            sélectionnées ; bakePdf.js parse <ol>/<li> pour préfixer chaque
            item de « 1. », « 2. », etc. à l'export.
            Pattern onMouseDown(preventDefault) + onClick(exec) au lieu de
            onPointerDown : c'est le pattern canonique des toolbars contentEditable
            (Slate, TipTap), plus fiable cross-browser pour les commandes
            block-level que le pointerdown qui peut laisser le focus partir
            avant que execCommand ne tourne. État actif via inListTag('ol')
            — queryCommandState('insertOrderedList') est buggy sur Firefox. */}
        <button
          className={`fbar-btn ${inListTag('ol') ? 'active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => runCommand(e, 'insertOrderedList')}
          title="Liste numérotée"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="10" y1="6" x2="21" y2="6"/>
            <line x1="10" y1="12" x2="21" y2="12"/>
            <line x1="10" y1="18" x2="21" y2="18"/>
            <path d="M4 4v4M3 8h2" strokeLinecap="round"/>
            <path d="M3 14h3l-3 4h3" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Liste à puces — même pattern que la liste numérotée mais avec
            execCommand('insertUnorderedList'). Le browser insère/retire un
            <ul><li> autour des lignes sélectionnées ; bakePdf.js parse
            <ul>/<li> pour préfixer chaque item de « • » à l'export.
            État actif via inListTag('ul'). */}
        <button
          className={`fbar-btn ${inListTag('ul') ? 'active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => runCommand(e, 'insertUnorderedList')}
          title="Liste à puces"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="10" y1="6" x2="21" y2="6"/>
            <line x1="10" y1="12" x2="21" y2="12"/>
            <line x1="10" y1="18" x2="21" y2="18"/>
            <circle cx="4" cy="6" r="1.5" fill="currentColor"/>
            <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="4" cy="18" r="1.5" fill="currentColor"/>
          </svg>
        </button>

        <div className="fbar-divider" />

        {/* Équation — bouton grisé en attente d'une nouvelle
            implémentation. L'ancien flow (slots gris [data-math-slot]
            avec templates Kami) ET la tentative MathLive ont été
            retirés sur demande utilisateur car aucun des deux ne
            donnait un éditeur d'équation utilisable. On garde le
            bouton visible pour préserver le layout de la barre et
            signaler que la feature reviendra. */}
        <button
          className="fbar-btn"
          style={placeholderBtnStyle}
          onMouseDown={(e) => e.preventDefault()}
          title="Équation (bientôt)"
        ><span style={formulaStyle}>ƒ<span style={subStyle}>x</span></span></button>

        {/* Emoji — ouvre un popup avec une grille d'emojis courants. Clic
            sur un emoji → execCommand('insertText') l'insère au caret dans
            le contentEditable. onMouseDown(preventDefault) sur le trigger
            ET sur chaque cellule du picker pour préserver le focus de
            l'éditable, sinon execCommand n'aurait pas de cible.
            Wrappé dans .fbar-emoji-host (position:relative) pour que le
            popup en position:absolute s'ancre directement sur le bouton —
            collé sans gap, et qui ne souffre pas du piou-piou position:fixed
            dans .fbar-wrapper qui a un translateX(-50%). */}
        <div className="fbar-emoji-host">
          <button
            className="fbar-btn fbar-emoji-trigger"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              // Si le menu emoji est déjà ouvert, son listener capture le ferme
              // au pointerdown. Recliquer sur le bouton emoji = toggle fermer,
              // donc on empêche le click suivant de le rouvrir immédiatement.
              if (window.__jacpdfSuppressEmojiPickerReopen) {
                window.__jacpdfSuppressEmojiPickerReopen = false
                return
              }
              setEmojiOpen(o => !o)
            }}
            title="Emoji"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </button>
          {emojiOpen && (
            <EmojiPicker
              onPick={(em) => { document.execCommand('insertText', false, em); setEmojiOpen(false) }}
              onClose={() => setEmojiOpen(false)}
            />
          )}
        </div>

      </div>
      )}
    </div>
  )
}