import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  exportTxt,
  exportHtml,
  exportMarkdown,
  exportPdf,
  exportDocx,
  exportDocument,
} from '../utils/exporters'

// Barre de menus style Google Docs pour JacDoc.
// 8 menus : Fichier, Modifier, Afficher, Insertion, Format, Outils,
// Extensions, Aide.
//
// Phase 1 : la plupart des items affichent un alert « bientôt disponible ».
// Les actions évidentes sont câblées via editor.commands (undo/redo, gras,
// italique, headings, listes…) ou via les props zoom/setZoom (menu Afficher).
//
// Props :
//   editor  : instance Tiptap (peut être null avant init → on rend rien).
//   zoom    : valeur courante du zoom (0.5 → 2).
//   setZoom : setter zoom passé par JacDocEditor.

const MENU_LOGOS = {
  drive: new URL('../../../../../logo/Google Drive.svg', import.meta.url).href,
  jaccloud: new URL('../../../../../logo/JacCloud.svg', import.meta.url).href,
}

const MENUS = [
  { id: 'fichier',    label: 'Fichier' },
  { id: 'modifier',   label: 'Modifier' },
  { id: 'afficher',   label: 'Afficher' },
  { id: 'insertion',  label: 'Insertion' },
  { id: 'format',     label: 'Format' },
  { id: 'outils',     label: 'Outils' },
  { id: 'aide',       label: 'Aide' },
]

function isMacOS() {
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || '')
}

export default function JacDocMenuBar({
  editor,
  title,
  zoom,
  setZoom,
  onRename,
  onOpenHeaderFooter,
  readingMode = false,
  onToggleReadingMode,
  showRuler = true,
  onToggleRuler,
  // « Afficher le nombre de mots lors de la frappe » (style Google
  // Docs) : bool contrôlé par JacDocEditor, persisté par document.
  // L'état OFF masque la pilule flottante « N mots ».
  liveWordCount = true,
  onToggleLiveWordCount,
  exportOptions = null,
}) {
  const [openId, setOpenId] = useState(null)
  // Position viewport du dropdown ouvert (calculée à partir du rect
  // du bouton qui ouvre le menu). On utilise position: fixed pour que
  // le dropdown s'affiche même quand le menubar passe en mode compact
  // (display: none sur les boutons via `.is-collapsed`) — sinon le
  // dropdown serait dans un sous-arbre invisible et ne rendrait pas.
  // Même pattern que .jacdoc-fontsel-popup ailleurs dans la base.
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const menuBtnRefs = useRef({})
  const dropdownRef = useRef(null)
  // Mode compact « ⋯ » PROGRESSIF du menubar : on cache les menus
  // (Fichier, Modifier, …) UN PAR UN depuis la droite quand la place
  // manque. `visibleCount` = nombre de menus rendus inline, le reste
  // (MENUS.slice(visibleCount)) bascule dans le popover ⋯. Calque du
  // pattern Historique/Commentaires de la topbar mais granulaire au
  // lieu d'all-or-nothing : 1 bouton de moins à chaque rapetissement.
  const [visibleCount, setVisibleCount] = useState(MENUS.length)
  const visibleCountRef = useRef(MENUS.length)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowBtnRef = useRef(null)
  const overflowWrapRef = useRef(null)
  // Largeurs naturelles individuelles des 7 boutons de menu, mesurées
  // au premier rendu (où ils sont tous visibles). Servent de référence
  // stable pour décider quels boutons cacher en rétrécissement et
  // symétriquement décompacter en agrandissement — sans ça les boutons
  // cachés (display:none → rect = 0) rendraient les mesures suivantes
  // incohérentes.
  const naturalWidthsRef = useRef([])
  const gapPxRef = useRef(0)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState(title || '')
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replaceDraft, setReplaceDraft] = useState('')
  const [findMessage, setFindMessage] = useState('')
  const [spellcheckOn, setSpellcheckOn] = useState(true)
  // Modale « Nombre de mots » style Google Docs > Outils. Remplace
  // l'ancien window.alert par un dialog propre qui affiche mots,
  // caractères et caractères sans espaces, avec une section Sélection
  // si l'utilisateur a sélectionné du texte au préalable.
  const [wordCountOpen, setWordCountOpen] = useState(false)
  const barRef = useRef(null)
  const renameInputRef = useRef(null)
  const findInputRef = useRef(null)
  const mod = isMacOS() ? '⌘' : 'Ctrl'

  // Fermeture : clic dehors / Esc.
  // Le dropdown est rendu en position: fixed et HORS de barRef
  // (sibling), donc on doit aussi vérifier dropdownRef sinon un clic
  // sur un item du menu fermerait le menu avant que son onClick ne
  // s'exécute. Idem pour le popover ⋯ : si on clique dans son popover,
  // ça ne doit pas fermer le menu actif.
  useEffect(() => {
    if (!openId) return
    const onDown = (e) => {
      if (barRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      setOpenId(null)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpenId(null) }
    // setTimeout 0 → le mousedown qui a OUVERT le menu ne le referme pas.
    const t = setTimeout(() => {
      window.addEventListener('mousedown', onDown)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [openId])

  // Quand un menu est ouvert et que la fenêtre/page scrolle ou change
  // de taille, le dropdown en position: fixed n'est plus aligné avec
  // son bouton. On ferme simplement plutôt que de tracker en continu —
  // l'utilisateur rouvrira après son geste de redimensionnement.
  useEffect(() => {
    if (!openId) return
    const onSR = () => setOpenId(null)
    window.addEventListener('resize', onSR)
    window.addEventListener('scroll', onSR, true)
    return () => {
      window.removeEventListener('resize', onSR)
      window.removeEventListener('scroll', onSR, true)
    }
  }, [openId])

  // Fermeture du popover ⋯ (menubar compact) : clic dehors / Escape.
  useEffect(() => {
    if (!overflowOpen) return
    const onDown = (e) => {
      if (overflowWrapRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      setOverflowOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOverflowOpen(false) }
    const t = setTimeout(() => {
      window.addEventListener('mousedown', onDown)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [overflowOpen])

  // Mesure responsive du menubar (collapse PROGRESSIF) : on cache les
  // menus (Fichier, Modifier, …) un à un depuis la droite quand la
  // place manque. Algorithme :
  //   1. Au premier rendu, tous les boutons sont visibles inline → on
  //      mémorise leur largeur individuelle dans naturalWidthsRef
  //      (référence stable pour les recalculs futurs où certains
  //      boutons seront display:none et auraient rect = 0).
  //   2. À chaque resize, on cherche le plus grand `k` tel que les `k`
  //      premiers boutons + leurs gaps + l'espace réservé au bouton ⋯
  //      (si k < N) rentrent dans la largeur dispo.
  //   3. setVisibleCount(k). Le bouton ⋯ + son popover apparaissent
  //      automatiquement quand visibleCount < MENUS.length.
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    let raf = 0
    // Espace réservé pour le bouton ⋯ quand il y a au moins 1 menu
    // dans l'overflow. Le bouton fait 32px (cf. CSS .jacdoc-menubar-
    // overflow-btn) + un peu de marge pour le gap qui le sépare du
    // dernier menu visible.
    const OVERFLOW_RESERVED = 40
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const bar2 = barRef.current
        if (!bar2) return
        const W = bar2.clientWidth

        // Re-mesure les largeurs naturelles SEULEMENT quand tous les
        // boutons sont visibles inline — sinon les boutons cachés
        // (display:none) ont un rect de 0 et fausseraient la référence.
        if (visibleCountRef.current === MENUS.length) {
          const buttons = Array.from(
            bar2.querySelectorAll(':scope > .jacdoc-menu > .jacdoc-menu-btn')
          )
          if (buttons.length === MENUS.length) {
            const widths = buttons.map((b) => b.getBoundingClientRect().width)
            if (widths.every((w) => w > 0)) {
              naturalWidthsRef.current = widths
              const gapStr = window.getComputedStyle(bar2).columnGap
                || window.getComputedStyle(bar2).gap
                || '0'
              gapPxRef.current = parseFloat(gapStr) || 0
            }
          }
        }

        const widths = naturalWidthsRef.current
        if (widths.length !== MENUS.length) return
        const gap = gapPxRef.current
        const totalNatural = widths.reduce((s, w) => s + w, 0)
          + Math.max(0, MENUS.length - 1) * gap

        let k
        if (totalNatural <= W + 1) {
          // Tout rentre : pas besoin du bouton ⋯.
          k = MENUS.length
        } else {
          // Au moins 1 menu doit aller dans l'overflow. On réserve la
          // place pour le bouton ⋯ et on remplit de gauche à droite
          // jusqu'au dernier menu qui rentre encore.
          const avail = W - OVERFLOW_RESERVED
          let cum = 0
          k = 0
          for (let i = 0; i < MENUS.length; i++) {
            const next = cum + (i > 0 ? gap : 0) + widths[i]
            if (next <= avail) {
              cum = next
              k = i + 1
            } else {
              break
            }
          }
        }

        if (k !== visibleCountRef.current) {
          visibleCountRef.current = k
          setVisibleCount(k)
        }
      })
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro) ro.observe(bar)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // Modale de renommage JacDoc — pas un prompt navigateur.
  useEffect(() => {
    if (!renameOpen) return
    setRenameDraft(title || '')
    const t = setTimeout(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }, 0)
    const onKey = (e) => {
      if (e.key === 'Escape') setRenameOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [renameOpen, title])

  // Modale Rechercher / remplacer.
  useEffect(() => {
    if (!findOpen) return
    const t = setTimeout(() => {
      findInputRef.current?.focus()
      findInputRef.current?.select()
    }, 0)
    const onKey = (e) => {
      if (e.key === 'Escape') setFindOpen(false)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) findNext()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [findOpen, findQuery, replaceDraft])

  if (!editor) return null

  const close = () => setOpenId(null)

  const openLocalDocument = () => {
    window.dispatchEvent(new CustomEvent('jacsuite:importJacDoc'))
    close()
  }

  const openJacDocCloud = () => {
    window.dispatchEvent(new CustomEvent('jacsuite:openJacDocCloud'))
    close()
  }

  const openGoogleDrive = () => {
    window.dispatchEvent(new CustomEvent('jacsuite:openJacDocGoogleDrive'))
    close()
  }

  const saveToGoogleDrive = () => {
    window.dispatchEvent(new CustomEvent('jacsuite:saveJacDocGoogleDrive'))
    close()
  }

  // Helper : exécute un chain Tiptap puis ferme le menu.
  const run = (chainFn) => () => {
    chainFn(editor.chain().focus()).run()
    close()
  }
  // Helper : action non implémentée → alert + fermeture.
  const notYet = (label) => () => {
    window.alert(label + ' — bientôt disponible dans JacDoc.')
    close()
  }

  const zoomInAction = () => {
    setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))
    close()
  }
  const zoomOutAction = () => {
    setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))
    close()
  }
  const zoomResetAction = () => { setZoom(1); close() }

  const askLink = () => {
    const url = window.prompt('URL du lien :')
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    close()
  }
  const askImage = () => {
    const url = window.prompt('URL de l\'image :')
    if (url) editor.chain().focus().setImage({ src: url }).run()
    close()
  }
  const insertText = (text) => {
    editor.chain().focus().insertContent(text).run()
    close()
  }
  const copySelection = async () => {
    const text = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, '\n')
    if (text && navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
    close()
  }
  const cutSelection = async () => {
    const text = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, '\n')
    if (text && navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
    if (text) editor.chain().focus().deleteSelection().run()
    close()
  }
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard?.readText?.()
      if (text) editor.chain().focus().insertContent(text).run()
    } catch {
      window.alert('Le navigateur bloque le collage automatique. Utilise ' + mod + '+V.')
    }
    close()
  }
  const duplicateSelection = () => {
    const text = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, '\n')
    if (text) editor.chain().focus().insertContent(text).run()
    close()
  }
  const collectMatches = (query) => {
    const matches = []
    if (!query) return matches
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      let idx = node.text.toLowerCase().indexOf(query.toLowerCase())
      while (idx !== -1) {
        matches.push({ from: pos + idx, to: pos + idx + query.length })
        idx = node.text.toLowerCase().indexOf(query.toLowerCase(), idx + query.length)
      }
    })
    return matches
  }
  const findNext = () => {
    const query = findQuery.trim()
    if (!query) { setFindMessage('Écris quelque chose à rechercher.'); return }
    const matches = collectMatches(query)
    if (!matches.length) { setFindMessage('Aucun résultat.'); return }
    const cursor = editor.state.selection.to
    const next = matches.find((m) => m.from > cursor) || matches[0]
    editor.chain().focus().setTextSelection(next).run()
    setFindMessage((matches.indexOf(next) + 1) + ' / ' + matches.length)
  }
  const replaceCurrent = () => {
    const query = findQuery.trim()
    if (!query) { setFindMessage('Écris quelque chose à rechercher.'); return }
    const { from, to } = editor.state.selection
    const selected = editor.state.doc.textBetween(from, to)
    if (selected.toLowerCase() === query.toLowerCase()) {
      editor.chain().focus().insertContent(replaceDraft).run()
      setFindMessage('Remplacé.')
      return
    }
    findNext()
  }
  const replaceAll = () => {
    const query = findQuery.trim()
    if (!query) { setFindMessage('Écris quelque chose à rechercher.'); return }
    const matches = collectMatches(query)
    if (!matches.length) { setFindMessage('Aucun résultat.'); return }
    let tr = editor.state.tr
    matches.slice().reverse().forEach((m) => {
      tr = tr.insertText(replaceDraft, m.from, m.to)
    })
    editor.view.dispatch(tr.scrollIntoView())
    setFindMessage(matches.length + ' remplacement' + (matches.length > 1 ? 's' : '') + '.')
  }
  const openFindReplace = () => {
    const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
    if (selected) setFindQuery(selected)
    setFindOpen(true)
    close()
  }
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.()
    else await document.exitFullscreen?.()
    close()
  }
  const toggleSpellcheck = () => {
    const next = !spellcheckOn
    setSpellcheckOn(next)
    editor.view.dom.setAttribute('spellcheck', next ? 'true' : 'false')
    close()
  }
  const transformSelection = (mode) => {
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to)
    if (!text) { close(); return }
    const next =
      mode === 'upper' ? text.toUpperCase() :
      mode === 'lower' ? text.toLowerCase() :
      text.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    editor.chain().focus().insertContent(next).run()
    close()
  }
  const getTargetText = () => {
    const { from, to } = editor.state.selection
    const selected = editor.state.doc.textBetween(from, to, '\n')
    return selected || editor.getText()
  }
  const replaceTargetText = (nextText) => {
    const { from, to } = editor.state.selection
    if (from !== to) editor.chain().focus().insertContent(nextText).run()
    else editor.chain().focus().selectAll().insertContent(nextText).run()
    close()
  }
  const smartCleanText = () => {
    const text = getTargetText()
    const next = text
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?([,;:!?])/g, '$1')
      .replace(/([.!?])([A-Za-zÀ-ÿ])/g, '$1 $2')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase())
      .trim()
    replaceTargetText(next)
  }
  const smartProfessionalText = () => {
    const text = getTargetText()
    const next = text
      .replace(/\b(jsp|je sais pas)\b/gi, 'je ne suis pas certain')
      .replace(/\b(ca|ça)\b/gi, 'cela')
      .replace(/\b(ok|okay)\b/gi, 'd’accord')
      .replace(/\b(truc|affaire)\b/gi, 'élément')
      .replace(/\bgenre\b/gi, 'notamment')
      .replace(/\bpis\b/gi, 'puis')
      .replace(/\bpas pire\b/gi, 'satisfaisant')
    replaceTargetText(next)
  }
  const smartSimplifyText = () => {
    const text = getTargetText()
    const next = text
      .replace(/\bcependant\b/gi, 'mais')
      .replace(/\bnéanmoins\b/gi, 'mais')
      .replace(/\bafin de\b/gi, 'pour')
      .replace(/\bdans le but de\b/gi, 'pour')
      .replace(/\butiliser\b/gi, 'prendre')
      .replace(/\bprocéder à\b/gi, 'faire')
    replaceTargetText(next)
  }
  const smartSummarizeText = () => {
    const text = getTargetText()
    const sentences = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
    const next = sentences.slice(0, Math.min(3, sentences.length)).join(' ')
    replaceTargetText(next || text)
  }
  const toggleReadingMode = () => {
    if (typeof onToggleReadingMode === 'function') onToggleReadingMode()
    close()
  }
  // Bascule l'affichage des règles (horizontale + verticale) — comme
  // Word > Afficher > Règle. Le state et la persistance sont gérés côté
  // JacDocEditor ; ici on ne fait que déclencher le callback.
  const toggleRulerVisibility = () => {
    if (typeof onToggleRuler === 'function') onToggleRuler()
    close()
  }
  // Stats texte (mots / caractères / caractères sans espaces). Calculées
  // à la volée dans le rendu de la modale plutôt qu'en state pour rester
  // simple ; ouvert = snapshot du document au moment de l'ouverture.
  const computeTextStats = (text) => {
    const safe = text || ''
    const trimmed = safe.trim()
    const words = trimmed ? (trimmed.match(/\S+/g) || []).length : 0
    const chars = safe.length
    const charsNoSpaces = safe.replace(/\s/g, '').length
    return { words, chars, charsNoSpaces }
  }

  // Compteur de mots : ouvre la modale style Google Docs. Le rendu
  // (plus bas dans le composant) lit les stats du document + de la
  // sélection courante quand le state passe à true.
  const countAll = () => {
    setWordCountOpen(true)
    close()
  }
  const showShortcuts = () => {
    window.alert(
      'Raccourcis JacDoc\n\n' +
      mod + '+B : gras\n' +
      mod + '+I : italique\n' +
      mod + '+U : souligné\n' +
      mod + '+K : lien\n' +
      mod + '+Entrée : saut de page\n' +
      mod + '+Z : annuler\n' +
      mod + '+Shift+Z : rétablir\n' +
      mod + '+P : imprimer'
    )
    close()
  }
  const showAbout = () => {
    window.alert('JacDoc — Éditeur de documents pour JacSuite.\nVersion bêta.')
    close()
  }

  const renameDocument = () => {
    setRenameDraft(title || '')
    setRenameOpen(true)
    close()
  }

  const submitRename = (e) => {
    e?.preventDefault()
    const cleanTitle = renameDraft.trim()
    const currentTitle = title || ''
    if (cleanTitle && cleanTitle !== currentTitle && typeof onRename === 'function') {
      onRename(cleanTitle)
    }
    setRenameOpen(false)
  }

  // Items par menu. `sep: true` marque un séparateur.
  const SEP = { sep: true }
  const items = {
    fichier: [
      { label: 'Nouveau document', hint: mod + '+N', onClick: () => {
          window.dispatchEvent(new CustomEvent('jacsuite:createJacDoc'))
          close()
        } },
      {
        label: 'Ouvrir…',
        hint: mod + '+O',
        onClick: openLocalDocument,
        submenu: [
          {
            label: 'JacDoc Cloud',
            onClick: openJacDocCloud,
            icon: (
              <img src={MENU_LOGOS.jaccloud} alt="" className="jacdoc-menu-item-logo" draggable="false" />
            ),
          },
          {
            label: 'Google Drive',
            onClick: openGoogleDrive,
            icon: (
              <img src={MENU_LOGOS.drive} alt="" className="jacdoc-menu-item-logo" draggable="false" />
            ),
          },
        ],
      },
      { label: 'Renommer', onClick: renameDocument },
      { label: 'Enregistrer dans Google Drive', onClick: saveToGoogleDrive },
      SEP,
      // Téléchargement du document courant dans différents formats.
      // Chaque fonction d'export est dans `../utils/exporters.js` et
      // recycle editor.getHTML() / getText() pour produire le fichier.
      // Les libs lourdes (turndown, html2pdf.js, html-docx-js) sont
      // chargées en lazy import au 1er clic sur l'export concerné.
      //
      // « Téléchargement rapide » : utilise le « Format par défaut »
      // configuré dans Paramètres → JacDoc → Export. Tous les autres
      // réglages d'export (qualité PDF, nom du fichier, métadonnées,
      // après-export) s'appliquent automatiquement via exportDocument.
      { label: 'Téléchargement rapide', hint: mod + '+⇧+E', onClick: () => { exportDocument(editor, title, exportOptions); close() } },
      { label: 'Télécharger en PDF',          onClick: () => { exportPdf(editor, title, exportOptions);      close() } },
      { label: 'Télécharger en Word (.docx)', onClick: () => { exportDocx(editor, title, exportOptions);     close() } },
      { label: 'Télécharger en HTML',         onClick: () => { exportHtml(editor, title, exportOptions);     close() } },
      { label: 'Télécharger en Markdown',     onClick: () => { exportMarkdown(editor, title); close() } },
      { label: 'Télécharger en texte brut',   onClick: () => { exportTxt(editor, title);      close() } },
      SEP,
      // Impression native : déclenche le dialog du navigateur. Le CSS
      // @media print de JacDocEditor.css masque tout le chrome (topbar,
      // toolbar, règles, pilules) pour ne garder que le contenu du doc.
      { label: 'Imprimer', hint: mod + '+P', onClick: () => { window.print(); close() } },
      SEP,
      { label: 'Supprimer', onClick: notYet('Supprimer') },
    ],
    modifier: [
      { label: 'Annuler', hint: mod + '+Z', onClick: run((c) => c.undo()) },
      { label: 'Rétablir', hint: mod + '+⇧+Z', onClick: run((c) => c.redo()) },
      SEP,
      { label: 'Couper', hint: mod + '+X', onClick: cutSelection },
      { label: 'Copier', hint: mod + '+C', onClick: copySelection },
      { label: 'Coller', hint: mod + '+V', onClick: pasteFromClipboard },
      { label: 'Dupliquer la sélection', onClick: duplicateSelection },
      SEP,
      { label: 'Tout sélectionner', hint: mod + '+A', onClick: run((c) => c.selectAll()) },
      { label: 'Rechercher et remplacer', hint: mod + '+F', onClick: openFindReplace },
    ],
    afficher: [
      { label: 'Zoom avant', hint: mod + '++', onClick: zoomInAction },
      { label: 'Zoom arrière', hint: mod + '+-', onClick: zoomOutAction },
      { label: 'Réinitialiser le zoom (100%)', hint: mod + '+0', onClick: zoomResetAction },
      SEP,
      // Bouton « Afficher / Masquer la règle » façon Word. Le libellé
      // bascule entre les deux états pour refléter l'action à venir.
      { label: showRuler ? 'Masquer la règle' : 'Afficher la règle', onClick: toggleRulerVisibility },
      { label: readingMode ? 'Quitter le mode lecture' : 'Mode lecture', onClick: toggleReadingMode },
      { label: 'Plein écran', hint: 'F11', onClick: toggleFullscreen },
    ],
    insertion: [
      { label: 'Lien', hint: mod + '+K', onClick: askLink },
      { label: 'Image', onClick: askImage },
      SEP,
      { label: 'Date', onClick: () => insertText(new Date().toLocaleDateString('fr-CA')) },
      { label: 'Heure', onClick: () => insertText(new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })) },
      { label: 'Date et heure', onClick: () => insertText(new Date().toLocaleString('fr-CA')) },
      { label: 'Caractère spécial…', onClick: () => {
          const char = window.prompt('Caractère à insérer :')
          if (char) editor.chain().focus().insertContent(char).run()
          close()
        } },
      SEP,
      { label: 'Trait horizontal', onClick: run((c) => c.setHorizontalRule()) },
      { label: 'Bloc de code', onClick: run((c) => c.toggleCodeBlock()) },
      { label: 'Citation', onClick: run((c) => c.toggleBlockquote()) },
      { label: 'Liste de tâches', onClick: run((c) => c.toggleTaskList()) },
      SEP,
      // Saut de page dur — même raccourci que Word/Google Docs.
      // Le node PageBreak est défini dans JacDocEditor.jsx.
      { label: 'Saut de page', hint: mod + '+⏎', onClick: run((c) => c.insertPageBreak()) },
      // Modale en-tête/pied de page — déclenche le callback fourni par
      // JacDocEditor (state hfModalOpen). Si le callback n'est pas fourni
      // (ex : prévisualisation read-only), on ferme juste le menu.
      { label: 'Haut et bas de page…', onClick: () => {
          if (typeof onOpenHeaderFooter === 'function') onOpenHeaderFooter()
          close()
        } },
    ],
    format: [
      { label: 'Gras', hint: mod + '+B', onClick: run((c) => c.toggleBold()) },
      { label: 'Italique', hint: mod + '+I', onClick: run((c) => c.toggleItalic()) },
      { label: 'Souligné', hint: mod + '+U', onClick: run((c) => c.toggleUnderline()) },
      { label: 'Barré', onClick: run((c) => c.toggleStrike()) },
      { label: 'Code en ligne', onClick: run((c) => c.toggleCode()) },
      { label: 'Effacer la mise en forme', onClick: run((c) => c.unsetAllMarks().clearNodes()) },
      SEP,
      { label: 'Titre 1', hint: mod + '+⇧+1', onClick: run((c) => c.toggleHeading({ level: 1 })) },
      { label: 'Titre 2', hint: mod + '+⇧+2', onClick: run((c) => c.toggleHeading({ level: 2 })) },
      { label: 'Titre 3', hint: mod + '+⇧+3', onClick: run((c) => c.toggleHeading({ level: 3 })) },
      { label: 'Paragraphe normal', onClick: run((c) => c.setParagraph()) },
      SEP,
      { label: 'Liste à puces', onClick: run((c) => c.toggleBulletList()) },
      { label: 'Liste numérotée', onClick: run((c) => c.toggleOrderedList()) },
      { label: 'Augmenter le retrait de liste', onClick: run((c) => c.sinkListItem('listItem')) },
      { label: 'Diminuer le retrait de liste', onClick: run((c) => c.liftListItem('listItem')) },
      SEP,
      { label: 'Aligner à gauche', onClick: run((c) => c.setTextAlign('left')) },
      { label: 'Centrer', onClick: run((c) => c.setTextAlign('center')) },
      { label: 'Aligner à droite', onClick: run((c) => c.setTextAlign('right')) },
      { label: 'Justifier', onClick: run((c) => c.setTextAlign('justify')) },
      SEP,
      { label: 'MAJUSCULES', onClick: () => transformSelection('upper') },
      { label: 'minuscules', onClick: () => transformSelection('lower') },
      { label: 'Capitaliser Chaque Mot', onClick: () => transformSelection('title') },
    ],
    outils: [
      { label: 'Compteur de mots', onClick: countAll },
      SEP,
      { label: 'Corriger automatiquement', onClick: smartCleanText },
      { label: 'Rendre plus professionnel', onClick: smartProfessionalText },
      { label: 'Simplifier le texte', onClick: smartSimplifyText },
      { label: 'Résumer la sélection', onClick: smartSummarizeText },
      SEP,
      { label: spellcheckOn ? 'Désactiver la correction navigateur' : 'Activer la correction navigateur', onClick: toggleSpellcheck },
      { label: 'Copier le texte brut du document', onClick: async () => {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(editor.getText())
          close()
        } },
    ],
    aide: [
      { label: 'À propos de JacDoc', onClick: showAbout },
      { label: 'Raccourcis clavier', onClick: showShortcuts },
      { label: 'Signaler un problème', onClick: () => {
          window.location.href = 'mailto:support@jacdoc.local?subject=Problème JacDoc'
          close()
        } },
    ],
  }

  // Positionne le dropdown en coordonnées viewport à partir du rect
  // du bouton qui l'ouvre. Le bouton peut être soit un bouton de menu
  // normal (Fichier, Modifier, …) soit un item du popover ⋯ quand le
  // menubar est en mode compact — peu importe lequel, la position est
  // lue depuis menuBtnRefs.current[id] qui pointe toujours sur le
  // bouton actuellement visible (le callback ref de l'item du popover
  // s'exécute APRÈS celui du bouton normal et écrase donc la valeur).
  const positionDropdownFor = (id) => {
    const btn = menuBtnRefs.current[id]
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 4, left: rect.left })
  }

  const handleClick = (id) => {
    if (openId === id) { setOpenId(null); return }
    positionDropdownFor(id)
    setOpenId(id)
  }
  const handleEnter = (id) => {
    if (openId === null || openId === id) return
    positionDropdownFor(id)
    setOpenId(id)
  }

  return (
    <>
      <div className="jacdoc-menubar" ref={barRef} role="menubar">
        {MENUS.map((m, idx) => {
          const isOpen = openId === m.id
          // Caché quand son index dépasse visibleCount — le menu bascule
          // alors dans le popover ⋯ ci-dessous. On garde le bouton en
          // DOM (juste display:none via .is-hidden) pour ne pas perdre
          // les refs et pouvoir remesurer plus tard.
          const isHidden = idx >= visibleCount
          const wrapClass =
            'jacdoc-menu'
            + (isOpen ? ' is-open' : '')
            + (isHidden ? ' is-hidden' : '')
          return (
            <div key={m.id} className={wrapClass}>
              <button
                type="button"
                className="jacdoc-menu-btn"
                ref={(el) => { menuBtnRefs.current[m.id] = el }}
                onClick={() => handleClick(m.id)}
                onMouseEnter={() => handleEnter(m.id)}
                aria-haspopup="true"
                aria-expanded={isOpen}
              >
                {m.label}
              </button>
            </div>
          )
        })}
        {/* Bouton ⋯ + popover qui regroupe les menus qui ne rentrent
            plus. Visible dès qu'au moins 1 menu déborde, placé à la fin
            du menubar pour rester aligné avec les boutons restants. */}
        {visibleCount < MENUS.length && (
          <div className="jacdoc-menubar-overflow" ref={overflowWrapRef}>
            <button
              type="button"
              className={'jacdoc-menubar-overflow-btn' + (overflowOpen ? ' is-open' : '')}
              ref={overflowBtnRef}
              onClick={() => setOverflowOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              aria-label="Plus de menus"
              title="Plus de menus"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
            {overflowOpen && (
              <div className="jacdoc-menubar-overflow-menu" role="menu">
                {MENUS.slice(visibleCount).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitem"
                    className={
                      'jacdoc-menubar-overflow-item'
                      + (openId === m.id ? ' is-active' : '')
                    }
                    ref={(el) => { menuBtnRefs.current[m.id] = el }}
                    onClick={() => handleClick(m.id)}
                    onMouseEnter={() => handleEnter(m.id)}
                  >
                    <span>{m.label}</span>
                    <span aria-hidden="true" style={ { opacity: 0.5, marginLeft: 'auto' } }>›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Dropdown du menu actif — extrait du loop pour utiliser
          position: fixed avec top/left calculés depuis le rect du
          bouton qui l'ouvre. Sans ça, en mode compact `.is-collapsed`
          les boutons sont en display: none et leur dropdown enfant
          serait inaccessible. */}
      {openId && (
        <div
          ref={dropdownRef}
          className="jacdoc-menu-dropdown"
          role="menu"
          style={ { top: dropdownPos.top, left: dropdownPos.left } }
        >
          {(items[openId] || []).map((it, i) => {
            if (it.sep) {
              return <div key={i} className="jacdoc-menu-sep" aria-hidden="true" />
            }

            if (it.submenu) {
              return (
                <div key={i} className="jacdoc-menu-item-wrap has-submenu">
                  <button
                    type="button"
                    role="menuitem"
                    className="jacdoc-menu-item jacdoc-menu-item-parent"
                    onClick={it.onClick}
                    disabled={it.disabled}
                  >
                    <span className="jacdoc-menu-item-label">{it.label}</span>
                    {it.hint && <span className="jacdoc-menu-item-hint">{it.hint}</span>}
                    <span className="jacdoc-menu-item-arrow" aria-hidden="true">›</span>
                  </button>
                  <div className="jacdoc-menu-submenu" role="menu">
                    {it.submenu.map((sub, j) => (
                      <button
                        key={j}
                        type="button"
                        role="menuitem"
                        className="jacdoc-menu-item"
                        onClick={sub.onClick}
                        disabled={sub.disabled}
                      >
                        {sub.icon && <span className="jacdoc-menu-item-icon" aria-hidden="true">{sub.icon}</span>}
                        <span className="jacdoc-menu-item-label">{sub.label}</span>
                        {sub.hint && <span className="jacdoc-menu-item-hint">{sub.hint}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )
            }

            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                className="jacdoc-menu-item"
                onClick={it.onClick}
                disabled={it.disabled}
              >
                <span className="jacdoc-menu-item-label">{it.label}</span>
                {it.hint && <span className="jacdoc-menu-item-hint">{it.hint}</span>}
              </button>
            )
          })}
        </div>
      )}

      {findOpen && (
        <div
          className="jacdoc-find-modal-overlay"
          onClick={() => setFindOpen(false)}
          role="presentation"
        >
          <form
            className="jacdoc-find-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); findNext() }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jacdoc-find-title"
          >
            <div className="jacdoc-find-modal-header">
              <h2 id="jacdoc-find-title" className="jacdoc-find-modal-title">
                Rechercher et remplacer
              </h2>
              <button
                type="button"
                className="jacdoc-find-modal-close"
                onClick={() => setFindOpen(false)}
                title="Fermer"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="jacdoc-find-modal-body">
              <label className="jacdoc-find-modal-field">
                <span className="jacdoc-find-modal-label">Rechercher</span>
                <input
                  ref={findInputRef}
                  type="text"
                  className="jacdoc-find-modal-input"
                  value={findQuery}
                  onChange={(e) => { setFindQuery(e.target.value); setFindMessage('') }}
                  placeholder="Mot ou phrase"
                />
              </label>
              <label className="jacdoc-find-modal-field">
                <span className="jacdoc-find-modal-label">Remplacer par</span>
                <input
                  type="text"
                  className="jacdoc-find-modal-input"
                  value={replaceDraft}
                  onChange={(e) => setReplaceDraft(e.target.value)}
                  placeholder="Nouveau texte"
                />
              </label>
              {findMessage && <div className="jacdoc-find-modal-message">{findMessage}</div>}
            </div>

            <div className="jacdoc-find-modal-actions">
              <button type="button" className="jacdoc-find-modal-btn" onClick={findNext}>
                Suivant
              </button>
              <button type="button" className="jacdoc-find-modal-btn" onClick={replaceCurrent}>
                Remplacer
              </button>
              <button type="button" className="jacdoc-find-modal-btn is-primary" onClick={replaceAll}>
                Tout remplacer
              </button>
            </div>
          </form>
        </div>
      )}

      {renameOpen && (
        <div
          className="jacdoc-rename-modal-overlay"
          onClick={() => setRenameOpen(false)}
          role="presentation"
        >
          <form
            className="jacdoc-rename-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitRename}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jacdoc-rename-title"
          >
            <div className="jacdoc-rename-modal-header">
              <h2 id="jacdoc-rename-title" className="jacdoc-rename-modal-title">
                Renommer le document
              </h2>
              <button
                type="button"
                className="jacdoc-rename-modal-close"
                onClick={() => setRenameOpen(false)}
                title="Fermer"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <label className="jacdoc-rename-modal-field">
              <span className="jacdoc-rename-modal-label">Nom du document</span>
              <input
                ref={renameInputRef}
                type="text"
                className="jacdoc-rename-modal-input"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                maxLength={200}
                placeholder="Document sans titre"
              />
            </label>

            <div className="jacdoc-rename-modal-actions">
              <button
                type="button"
                className="jacdoc-rename-modal-btn"
                onClick={() => setRenameOpen(false)}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="jacdoc-rename-modal-btn is-primary"
                disabled={!renameDraft.trim()}
              >
                Renommer
              </button>
            </div>
          </form>
        </div>
      )}

      {wordCountOpen && (() => {
        // Snapshot au moment du rendu : mots/caractères du document
        // complet + de la sélection si elle existe. Layout calqué sur
        // Google Docs > Outils > Nombre de mots (sections empilées,
        // libellés à gauche, valeurs aligness à droite, tabular-nums).
        const fullText = editor.getText()
        const fullStats = computeTextStats(fullText)
        const { from, to } = editor.state.selection
        const selText = from !== to
          ? editor.state.doc.textBetween(from, to, '\n')
          : ''
        const selStats = selText ? computeTextStats(selText) : null
        const fmt = (n) => n.toLocaleString('fr-CA')

        const sectionTitleStyle = {
          fontSize: 11,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.55)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 4,
        }
        const rowStyle = {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          padding: '8px 0',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          fontSize: 14,
        }
        const lastRowStyle = { ...rowStyle, borderBottom: 'none' }
        const valueStyle = { fontVariantNumeric: 'tabular-nums', fontWeight: 600 }

        return (
          <div
            className="jacdoc-rename-modal-overlay"
            onClick={() => setWordCountOpen(false)}
            role="presentation"
          >
            <div
              className="jacdoc-rename-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="jacdoc-wordcount-title"
              style={ { minWidth: 340 } }
            >
              <div className="jacdoc-rename-modal-header">
                <h2 id="jacdoc-wordcount-title" className="jacdoc-rename-modal-title">
                  Nombre de mots
                </h2>
                <button
                  type="button"
                  className="jacdoc-rename-modal-close"
                  onClick={() => setWordCountOpen(false)}
                  title="Fermer"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>

              <div style={ { display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 22px 8px' } }>
                {selStats && (
                  <div>
                    <div style={sectionTitleStyle}>Sélection</div>
                    <div style={rowStyle}><span>Mots</span><span style={valueStyle}>{fmt(selStats.words)}</span></div>
                    <div style={rowStyle}><span>Caractères</span><span style={valueStyle}>{fmt(selStats.chars)}</span></div>
                    <div style={lastRowStyle}><span>Caractères (sans espaces)</span><span style={valueStyle}>{fmt(selStats.charsNoSpaces)}</span></div>
                  </div>
                )}
                <div>
                  {selStats && <div style={sectionTitleStyle}>Document complet</div>}
                  <div style={rowStyle}><span>Mots</span><span style={valueStyle}>{fmt(fullStats.words)}</span></div>
                  <div style={rowStyle}><span>Caractères</span><span style={valueStyle}>{fmt(fullStats.chars)}</span></div>
                  <div style={lastRowStyle}><span>Caractères (sans espaces)</span><span style={valueStyle}>{fmt(fullStats.charsNoSpaces)}</span></div>
                </div>
              </div>

              <div
                className="jacdoc-rename-modal-actions"
                style={ { justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' } }
              >
                <label
                  style={ { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', userSelect: 'none' } }
                >
                  <input
                    type="checkbox"
                    checked={!!liveWordCount}
                    onChange={(e) => {
                      if (typeof onToggleLiveWordCount === 'function') {
                        onToggleLiveWordCount(e.target.checked)
                      }
                    }}
                    style={ { accentColor: '#7c5cff', width: 14, height: 14 } }
                  />
                  <span>Afficher le nombre de mots lors de la frappe</span>
                </label>
                <button
                  type="button"
                  className="jacdoc-rename-modal-btn is-primary"
                  onClick={() => setWordCountOpen(false)}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}