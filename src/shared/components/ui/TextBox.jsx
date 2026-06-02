import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { textFmtStore } from '@/shared/stores/ui/textFmtStore'
import { recentColorsStore } from '@/shared/stores/ui/recentColorsStore'
import FormatBar from '@/apps/jacpdf/components/toolbar/FormatBar'
import ColorPicker from './ColorPicker'
import './TextBox.css'

// ── Helpers contentEditable ──────────────────────────────────────────
// Heuristique : si le texte ne contient AUCUN tag HTML, on le considère
// comme du plaintext legacy (data avant le refactor textarea→contentEditable).
// On l'échappe + convertit les sauts de ligne en <br> avant injection
// dans innerHTML.
function isPlainText(t) { return !/<\/?[a-z][^>]*>/i.test(t || '') }
function escapeHtml(t) {
  return (t || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}
// Pour la check « box vide » — strip tags + entités basiques.
function htmlToPlain(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}
// Variante qui préserve les sauts de ligne (<br> → \n) — utilisée par
// l'auto-calcul pour ne regarder QUE la dernière ligne. Sans ça, du texte
// sur plusieurs lignes (ex. « bonjour\n2+3= ») produirait un strip où le
// regex de calcul matcherait à travers les lignes.
function htmlToPlainPreserveBreaks(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// Auto-calcul style Apple Notes. Si l'utilisateur vient de taper « = » à la
// fin d'une expression arithmétique simple (chiffres + - * / × ÷ . , parens),
// on retourne la chaîne du résultat à insérer juste après le « = ». Sinon
// null. Lecture du toggle : localStorage.jacpdf_autoCalcEnabled (réglé
// dans Paramètres → Général).
//
// Sécurité : whitelist stricte des caractères autorisés AVANT d'évaluer
// (uniquement [0-9 + - * / . ( ) espace]), donc pas de surface d'attaque
// via Function(). On rejette aussi les expressions sans aucun opérateur
// (ex. « 5= » ne déclenche rien) pour éviter les faux positifs.
function tryAutoCalc(html) {
  if (typeof localStorage === 'undefined') return null
  if (localStorage.getItem('jacpdf_autoCalcEnabled') !== 'true') return null
  const plain = htmlToPlainPreserveBreaks(html)
  // Seule la dernière ligne nous intéresse — un calcul sur la ligne du
  // dessus ne doit pas être ré-évalué quand on tape sur une nouvelle ligne.
  const lastLine = (plain.split('\n').pop() || '')
  // Match l'expression la plus longue qui se termine par « = » en fin de
  // ligne (avec espaces optionnels). Capture le contenu avant le « = ».
  // On accepte aussi « x » / « X » comme symbole de multiplication (style
  // « fois » / Apple Notes) en plus de « * » et « × » — plus naturel à
  // taper sur clavier sans avoir à chercher le caractère ×.
  const m = lastLine.match(/([\d+\-*/×÷xX.,()\s]+?)=\s*$/)
  if (!m) return null
  let expr = m[1]
    .replace(/×/g, '*')
    .replace(/[xX]/g, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '.')
    .trim()
  if (!expr) return null
  // Whitelist stricte : refuse tout ce qui n'est pas chiffre/opérateur/parens.
  if (!/^[\d+\-*/.()\s]+$/.test(expr)) return null
  // Doit contenir au moins un opérateur binaire — sinon « 5= » déclencherait.
  if (!/[+\-*/]/.test(expr.slice(1))) return null
  try {
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')()
    if (typeof result !== 'number' || !isFinite(result)) return null
    // Arrondi pour éviter le bruit float (0.1+0.2 → 0.30000000000000004).
    const rounded = Math.round(result * 1e10) / 1e10
    return String(rounded)
  } catch {
    return null
  }
}

export default function TextBox({ id, x, y, width, height, text, fmt: fmtProp, onUpdate, onDelete, onDrop, selected, inSelection, onSelect, onGroupDrag, zoom = 100, autoSize = false, manualSized = false, pagePdfWidth, pagePdfHeight, readOnly = false }) {
  // editing=true UNIQUEMENT si la textbox est sélectionnée au mount (= flow
  // de création où createTextBox set selectedBox=id juste avant). Pour les
  // textboxes qui arrivent via realtime (un autre user a tapé du texte sur
  // un autre device), selected=false au mount → editing=false → l'auto-grow
  // useLayoutEffect ne déclenche pas onUpdate inutilement (avant ce fix, il
  // mesurait avec une fluctuation de 1-2 px, déclenchait un setState, qui
  // déclenchait le mirror, qui tentait un UPDATE qui finissait en RLS deny
  // côté collaborateurs non-owner).
  const [editing, setEditing] = useState(() => Boolean(selected) && !readOnly)
  const [rotation, setRotation] = useState(0)
  const [colorPickerAnchor, setColorPickerAnchor] = useState(null)
  const [fmt, setFmtState] = useState(() => fmtProp || textFmtStore.get())
  // Ref vers le contentEditable (gardée sous le nom textareaRef pour
  // minimiser le diff avec l'ancienne implémentation textarea — utilisée
  // par les handles de resize, le focus on edit, etc.).
  const textareaRef = useRef(null)
  // Dernier HTML qu'on a *poussé* dans innerHTML — sert à distinguer les
  // changements externes (realtime, undo) des changements locaux (frappe
  // utilisateur). Sans cette ref, set innerHTML à chaque render écraserait
  // la position du curseur.
  const lastSetRef = useRef(text)
  const boxRef = useRef(null)
  // Quand on clique dans le rendu readonly d'une textbox, on passe en édition
  // au même endroit visuel. On stocke les coordonnées du clic ici, puis dès
  // que le contentEditable est monté, useLayoutEffect place le caret avec
  // caretPositionFromPoint / caretRangeFromPoint.
  const pendingCaretPointRef = useRef(null)
  // Pendant un resize actif, on gèle le useLayoutEffect auto-grow. Sinon
  // le drag TR rétrécit la width → textarea wrap plus de lignes → scrollH
  // grandit → le hook force height = scrollH+20 et écrase la height que
  // le resize vient de set → le bas de la box saute pendant le drag =
  // « la zone se déplace toute seule ». On remet à false dans onUp.
  const resizingRef = useRef(false)
  // Petite marge de sécurité horizontale pour l'auto-size/shrink-to-fit.
  // Sans ça, la box colle exactement aux glyphes; selon l'arrondi sub-pixel
  // du navigateur, un texte court comme « 667 » peut faire wrapper le dernier
  // caractère même si la largeur mesurée semblait suffisante.
  const AUTO_GROW_X_BUFFER = 3
  // Buffer vertical uniquement pour le snap après resize manuel. Le handle
  // top-right est le plus sensible : il ancre le bas puis remonte la box pour
  // faire rentrer le texte. Sans petite marge, l'arrondi sub-pixel peut laisser
  // la dernière ligne légèrement coupée même si offsetHeight disait que ça rentre.
  const RESIZE_FIT_Y_BUFFER = 6

  // Update local fmt, sync to store, AND persist to parent for export
  const setFmt = (newFmt) => {
    if (readOnly) return

    setFmtState(newFmt)
    textFmtStore.set(newFmt)
    // Quand on change le style d'un texte DÉJÀ présent (ex. taille de police
    // plus grande depuis la FormatBar), la zone doit immédiatement grandir
    // pour garder tout le texte visible. Sinon le wrapper garde ses anciennes
    // dimensions jusqu'à la prochaine frappe et le contenu se retrouve coupé.
    const dims = measureBoxForFmt(newFmt)
    onUpdate(id, { fmt: newFmt, ...(dims || {}) })
  }

  useEffect(() => {
    if (readOnly && editing) {
      setEditing(false)
      setColorPickerAnchor(null)
    }
  }, [editing, readOnly])

  useEffect(() => {
    if (!readOnly && textareaRef.current) textareaRef.current.focus()
  }, [readOnly])

  useEffect(() => {
    if (!editing) return
    const onDown = (e) => {
      if (boxRef.current?.contains(e.target)) return
      if (e.target.closest('.fbar-wrapper')) return
      // Les dropdowns SizeSelect (police, taille, interligne) sont rendues
      // en portal dans document.body, donc elles ne sont PAS dans
      // .fbar-wrapper. Sans cette garde, le pointerdown sur une option de
      // police est vu comme un clic extérieur : TextBox sort de l'édition,
      // la FormatBar se démonte, puis le onClick de l'option n'a jamais le
      // temps d'appliquer la nouvelle police.
      if (e.target.closest('.tb-size-popup')) return
      // Vide ⇒ supprimer (évite les textbox fantômes quand on clique à côté
      // sans rien taper). Avec du texte ⇒ shrink-to-fit (style Kami) +
      // désélection. Le shrink-to-fit ajuste width/height aux dimensions
      // naturelles du texte (la box vient se « coller aux lettres » au lieu
      // de garder la largeur initialW=100 avec du vide à droite).
      // ⚠️ On garde autoSize: FALSE après shrink (mode wrap). Si on passait
      // à autoSize:true (mode no-wrap), re-rentrer dans la box pour ajouter
      // du texte ferait sortir le caret par le bord droit sans wrap — le
      // texte déborderait, caché par overflow:hidden. En restant en wrap
      // mode, les futures éditions ajoutent des lignes (la box grandit en
      // hauteur via le useLayoutEffect non-autoSize) et restent visibles.
      // htmlToPlain : la box peut contenir <br> ou tags vides après un
      // backspace dans un contentEditable, qui ne sont pas du « vide »
      // visuel mais le sont sémantiquement.
      if (htmlToPlain(text) === '') {
        // Si on clique ailleurs pendant qu'une textbox fraîche est encore vide,
        // on la supprime ET on avale le click synthétique qui suit. Sinon le
        // canvas en outil texte reçoit ce même click et recrée immédiatement
        // une nouvelle zone au même endroit — impression que « reclick =
        // nouvelle textbox ».
        suppressNextClickAfterResize()
        onDelete(id)
      } else {
        // Ce clic outside sert à sortir de l'édition / désélectionner, PAS à
        // créer une nouvelle textbox via l'outil texte. On avale donc le click
        // synthétique qui suit le pointerdown, sinon le canvas le reçoit et
        // crée immédiatement une nouvelle zone.
        suppressNextClickAfterResize()
        // Shrink-to-fit Kami-style au blur : la box vient se coller au
        // texte. Pendant la frappe, useLayoutEffect ne fait que grandir
        // (jamais shrink) pour que le texte ne saute pas. Au blur, on
        // mesure les dimensions naturelles du contenu et on commit ces
        // dimensions — ça permet de re-rentrer en édition avec une box
        // déjà collée au texte (même si on a tapé puis effacé du texte).
        //
        // ⚠️ Override `position:absolute; inset:0` du CSS temporairement.
        // Sans ça, scrollWidth est clampé par clientWidth (= wrapper inner)
        // et on ne peut pas mesurer la largeur naturelle du texte. Pattern
        // éprouvé (cf. msg 189). On override aussi width/height à 'auto' pour
        // que offsetWidth/offsetHeight reflètent la dimension naturelle.
        const el = textareaRef.current
        if (el) {
          const prev = {
            position: el.style.position,
            top: el.style.top,
            left: el.style.left,
            right: el.style.right,
            bottom: el.style.bottom,
            width: el.style.width,
            height: el.style.height,
          }
          el.style.position = 'relative'
          el.style.top = 'auto'
          el.style.left = 'auto'
          el.style.right = 'auto'
          el.style.bottom = 'auto'
          // ⚠️ width: 'max-content' (PAS 'auto') : .textbox-editable est
          // display:block, donc width:auto = 100% du parent (= 80 px) au lieu
          // de la largeur naturelle du texte. max-content shrink-wrap au
          // contenu.
          el.style.width = 'max-content'
          el.style.height = 'auto'
          // Force un reflow avant de lire offsetWidth/Height (modern browsers
          // reflow synchronously quand on lit ces props, mais on s'assure).
          void el.offsetWidth
          const natW = Math.ceil(el.offsetWidth) + 20 + AUTO_GROW_X_BUFFER
          const natH = Math.ceil(el.offsetHeight) + 20
          Object.assign(el.style, prev)
          onUpdate(id, { width: natW, height: natH })
        }
        setEditing(false)
        onSelect(null)
      }
    }
    // Capture phase : indispensable pour détecter aussi les clics sur une
    // AUTRE textbox. Les textboxes stoppent la propagation en pointerdown
    // (drag/select), donc un listener document en bubble ne verrait jamais
    // ce clic et une nouvelle textbox vide resterait fantôme.
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [editing, text, id, onDelete, onSelect, onUpdate])

  // ── Auto-grow style Kami ──
  // La box suit toujours le contenu en hauteur (chaque retour de ligne — \n
  // tapé OU wrap auto — la fait descendre).
  // - autoSize=true (box fraîchement posée) : largeur ET hauteur suivent le
  //   texte, mesurées via canvas (pas de wrap : chaque \n = +1 ligne, la
  //   ligne la plus longue dicte la largeur).
  // - autoSize=false (après resize manuel d'une poignée) : largeur figée par
  //   l'utilisateur, hauteur lue via scrollHeight du textarea (donc inclut
  //   le wrap natif). Comme ça la box descend façon Kami même après resize.
  useLayoutEffect(() => {
    // ⚠️ Gate realtime : si la textbox n'est PAS en mode édition, on skip
    // toute mesure (les dims viennent du state, mesurées chez l'auteur
    // original). Évite le bug « upsert failed code 42501 USING expression »
    // côté collaborateurs non-owner sur les docs partagés.
    if (!editing) return
    // Skip pendant un drag de resize actif (préserve l'ancrage des coins).
    if (resizingRef.current) {
      if (textareaRef.current) textareaRef.current.scrollTop = 0
      return
    }
    const el = textareaRef.current
    if (!el) return
    // Sync innerHTML quand le DOM ne reflète pas la prop text. On compare
    // directement el.innerHTML à incoming (et PAS lastSetRef à text avec
    // un &&, sinon au re-mount du contentEditable — sortie puis retour en
    // édition — el.innerHTML='' mais lastSetRef==='hello'==='text', le check
    // skip → la div reste vide visuellement alors que text est intact, et
    // le texte ne « réapparaît » qu'à la sortie d'édition via le readonly).
    // Cas couverts :
    //  - frappe utilisateur : onInput vient de set innerHTML=html ET text=html
    //    avant que ce hook tourne → match → no-op (curseur préservé).
    //  - realtime/undo : text change externe, el.innerHTML diffère → sync.
    //  - re-mount après sortie d'édition : el.innerHTML='' diffère → sync.
    const incoming = isPlainText(text) ? escapeHtml(text) : (text || '')
    if (el.innerHTML !== incoming) {
      el.innerHTML = incoming
      lastSetRef.current = text
    }
    if (pendingCaretPointRef.current) {
      const { clientX, clientY } = pendingCaretPointRef.current
      pendingCaretPointRef.current = null
      el.focus()
      let range = null
      if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(clientX, clientY)
        if (pos && el.contains(pos.offsetNode)) {
          range = document.createRange()
          range.setStart(pos.offsetNode, pos.offset)
          range.collapse(true)
        }
      } else if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(clientX, clientY)
        if (r && el.contains(r.startContainer)) range = r
      }
      // Fallback : si le navigateur ne peut pas résoudre le point exact
      // (clic dans du padding, vieux WebKit, etc.), place le caret à la fin
      // au lieu de ne rien faire.
      if (!range) {
        range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
      }
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
    // ── Persistance React de la taille calculée par CSS ──
    // PIVOT ARCHITECTURAL : on n'auto-grow PLUS via JS measurement +
    // onUpdate. À la place, le wrapper utilise `width: max-content` +
    // `max-width: cssMaxWidth` (cf. wrapperStyle plus bas) — c'est le
    // navigateur qui dimensionne, dans le même cycle de paint que la
    // frappe. Aucune race React re-render possible. Ici on lit juste
    // les dimensions résultantes pour persister dans le state React :
    //  - Cloud mirror (UPDATE row text_boxes.width/height).
    //  - Au blur : la box passe en non-cssAutoGrow, wrapperStyle utilise
    //    alors width/height inline (= ces valeurs persistées).
    //  - Undo/redo : les snapshots contiennent les bonnes dimensions.
    //
    // Pour le mode non-autoSize (largeur figée après resize manuel), CSS
    // ne fait pas l'auto-grow horizontal — on continue de mesurer
    // offsetHeight via override pour faire descendre la box quand
    // pre-wrap ajoute des lignes.
    if (editing && !manualSized && boxRef.current) {
      const w = Math.ceil(boxRef.current.offsetWidth)
      const h = Math.ceil(boxRef.current.offsetHeight)
      if (Math.abs(w - width) > 1 || Math.abs(h - height) > 1) {
        onUpdate(id, { width: w, height: h, autoSize: true, manualSized: false })
      }
    } else if (boxRef.current) {
      // Resize manuel : largeur figée, hauteur suit le wrap pre-wrap.
      const prevPos = el.style.position
      const prevTop = el.style.top, prevLeft = el.style.left
      const prevRight = el.style.right, prevBottom = el.style.bottom
      const prevWidth = el.style.width, prevHeight = el.style.height
      el.style.position = 'relative'
      el.style.top = 'auto'; el.style.left = 'auto'
      el.style.right = 'auto'; el.style.bottom = 'auto'
      el.style.width = `${Math.max(40, width - 20)}px`
      el.style.height = 'auto'
      void el.offsetHeight
      const measuredH = Math.ceil(el.offsetHeight) + 20
      el.style.position = prevPos
      el.style.top = prevTop; el.style.left = prevLeft
      el.style.right = prevRight; el.style.bottom = prevBottom
      el.style.width = prevWidth
      el.style.height = prevHeight
      const newHeight = Math.max(height, measuredH)
      if (Math.abs(newHeight - height) > 1) {
        onUpdate(id, { height: newHeight })
      }
    }
    el.scrollLeft = 0
    el.scrollTop = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, autoSize, manualSized, width, zoom, fmt.size, fmt.font, fmt.bold, fmt.italic, fmt.lineHeight, editing, x, pagePdfWidth])

  const handleDrag = (e) => {
    if (readOnly) {
      e.preventDefault()
      e.stopPropagation()
      onSelect(id)
      return
    }

    // GARDE BULLETPROOF : si un resize-handle vient d'être cliqué dans
    // la même bulle d'événement, on skip le drag.
    // Théoriquement le e.stopPropagation() de handleResizeTR/BR/BL bloque
    // déjà ce handler, mais en pratique ça peut rater (React batching,
    // HMR, portails, ordre de listeners synthétiques vs natifs…). Sans
    // ce garde, les deux onMove tournent en parallèle pendant un drag
    // de poignée : handleResizeTR set width/height/y avec les bonnes
    // maths d'ancrage du coin opposé, mais handleDrag écrase x/y en
    // suivant la souris (startPdfX + dxScreen/scale) → la box translate
    // au lieu de rester ancrée. C'est le bug « le coin opposé bouge ».
    if (resizingRef.current) return
    if (e.target?.closest?.('.tb-handle, .tb-handle-rotate-area, .tb-rotate-resize')) return
    e.preventDefault(); e.stopPropagation(); onSelect(id)
    const wrapper = boxRef.current.closest('.editor-page-wrapper')
    const scale = zoom / 100
    // x/y are in PDF points (scale 1). Screen coords must be divided by scale.
    const startX = e.clientX
    const startY = e.clientY
    const startPdfX = x
    const startPdfY = y
    let finalClientX = e.clientX
    let finalClientY = e.clientY
    const onMove = (e) => {
      finalClientX = e.clientX
      finalClientY = e.clientY
      const dxScreen = e.clientX - startX
      const dyScreen = e.clientY - startY
      if (inSelection && onGroupDrag) {
        // handled by bounding box drag — skip
      } else {
        // Drag libre, sans clamp — l'utilisateur peut amener la box hors
        // du PDF s'il le souhaite. Le snap au bord se fait au drop
        // (cf. applyTextBoxDrop dans lib/pdf/textBoxOps.js).
        onUpdate(id, {
          x: startPdfX + dxScreen / scale,
          y: startPdfY + dyScreen / scale,
        })
      }
    }
    const onUp = () => {
      if (!inSelection) onDrop?.(id, finalClientX, finalClientY)
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  const suppressNextClickAfterResize = (timeoutMs = 250) => {
    // Quand on relâche une poignée après un resize (surtout TR), le navigateur
    // peut générer un `click` synthétique sur l'élément sous la souris — parfois
    // le canvas. En outil texte, ce click créait une NOUVELLE textbox. On pose
    // donc un listener capture one-shot qui avale le prochain click global AVANT
    // qu'il atteigne le canvas React.
    window.__jacpdfSuppressNextTextClick = true
    const onClick = (ev) => {
      if (!window.__jacpdfSuppressNextTextClick) return
      ev.preventDefault()
      ev.stopPropagation()
      window.__jacpdfSuppressNextTextClick = false
      window.removeEventListener('click', onClick, true)
    }
    window.addEventListener('click', onClick, true)
    // Safety net si aucun click synthétique n'est émis.
    setTimeout(() => {
      window.__jacpdfSuppressNextTextClick = false
      window.removeEventListener('click', onClick, true)
    }, timeoutMs)
  }

  const suppressClickAfterTextPointerUp = () => {
    // Sélection de texte : l'utilisateur peut pointerdown dans la textbox,
    // dragger la sélection, puis relâcher hors de la zone. Le canvas peut voir
    // soit le pointerup/click final, soit un click synthétique retardé. On pose
    // donc le flag IMMÉDIATEMENT au pointerdown (pas seulement au pointerup),
    // puis on le garde encore un peu après le relâchement.
    window.__jacpdfSuppressNextTextClick = true
    const onUp = () => {
      suppressNextClickAfterResize(1500)
      window.removeEventListener('pointerup', onUp, true)
    }
    window.addEventListener('pointerup', onUp, true)
  }

  const makeTextMeasureProbe = (fmtOverride = fmt, htmlOverride = null) => {
    const f = fmtOverride
    const probe = document.createElement('div')
    probe.innerHTML = htmlOverride ?? textareaRef.current?.innerHTML ?? (isPlainText(text) ? escapeHtml(text) : (text || ''))
    probe.style.position = 'fixed'
    probe.style.left = '-99999px'
    probe.style.top = '-99999px'
    probe.style.visibility = 'hidden'
    probe.style.pointerEvents = 'none'
    probe.style.boxSizing = 'border-box'
    probe.style.height = 'auto'
    probe.style.padding = '6px 8px'
    probe.style.fontFamily = `'${f.font}', sans-serif`
    probe.style.fontSize = `${f.size}px`
    probe.style.lineHeight = String(f.lineHeight)
    probe.style.fontWeight = f.bold ? '700' : '400'
    probe.style.fontStyle = f.italic ? 'italic' : 'normal'
    return probe
  }

  const measureMinWidthToFitText = (fmtOverride = fmt, htmlOverride = null) => {
    const probe = makeTextMeasureProbe(fmtOverride, htmlOverride)
    // min-content = largeur minimum sans casser un mot en lettres une par une.
    // Ça laisse le wrap normal fonctionner aux espaces, mais empêche le cas
    // screenshot où une box trop étroite transforme « rhfe » en colonne.
    probe.style.width = 'min-content'
    probe.style.whiteSpace = 'pre-wrap'
    probe.style.wordBreak = 'normal'
    probe.style.overflowWrap = 'normal'
    document.body.appendChild(probe)
    const w = Math.ceil(probe.offsetWidth) + 20 + AUTO_GROW_X_BUFFER
    probe.remove()
    return w
  }

  const measureWrappedHeightForWidth = (outerW, fmtOverride = fmt, htmlOverride = null) => {
    const innerW = Math.max(20, outerW - 20)
    const probe = makeTextMeasureProbe(fmtOverride, htmlOverride)
    probe.style.width = `${innerW}px`
    probe.style.whiteSpace = 'pre-wrap'
    probe.style.wordBreak = 'break-word'
    probe.style.overflowWrap = 'anywhere'
    document.body.appendChild(probe)
    const h = Math.ceil(probe.offsetHeight) + 20 + RESIZE_FIT_Y_BUFFER
    probe.remove()
    return h
  }

  const measureBoxForFmt = (nextFmt) => {
    const html = textareaRef.current?.innerHTML ?? (isPlainText(text) ? escapeHtml(text) : (text || ''))
    if (htmlToPlain(html) === '') return null

    // Même logique de cap que l'auto-grow pendant la frappe : la box peut
    // s'élargir jusqu'au bord droit du PDF, puis elle wrappe et ajuste sa
    // hauteur. Important : au changement de taille depuis la FormatBar, on
    // doit aussi SHRINK si la police devient plus petite (sinon la zone garde
    // un gros vide autour du texte jusqu'au blur).
    const maxOuterW = pagePdfWidth != null
      ? Math.max(40, pagePdfWidth - x + 20)
      : Infinity
    const minW = 30 / (zoom / 100)
    const minH = 30 / (zoom / 100)

    if (!manualSized) {
      const fitW = measureMinWidthToFitText(nextFmt, html)
      const finalW = isFinite(maxOuterW)
        ? Math.min(Math.max(minW, fitW), maxOuterW)
        : Math.max(minW, fitW)
      const fitH = measureWrappedHeightForWidth(finalW, nextFmt, html)
      return {
        width: finalW,
        height: Math.max(minH, fitH),
        autoSize: true,
        manualSized: false,
      }
    }

    const fitH = measureWrappedHeightForWidth(width, nextFmt, html)
    return { height: Math.max(minH, fitH) }
  }

  const handleResizeBR = (e) => {
    // Resize = geste interne à la textbox. On bloque la propagation pour que
    // le canvas en outil texte ne puisse jamais interpréter le release/click
    // final comme une demande de création d'une nouvelle zone.
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = true
    // En mode édition : le textarea a un style.height inline posé par
    // onChange (pour l'auto-grow pendant la frappe). Le wrapper utilise
    // minHeight (pas height fixe), donc le textarea trop grand POUSSE le
    // wrapper à son ancienne hauteur → impossible de rétrécir la box en
    // mode édition, et comme y bouge pendant un TR, la BL visuelle semble
    // descendre = « la zone se déplace ». On clear le inline pour que la
    // CSS height:100% reprenne et que le textarea suive le wrapper.
    if (textareaRef.current) textareaRef.current.style.height = ''
    const sx = e.clientX, sy = e.clientY, sw = width, sh = height
    // Scale des deltas souris : sw/sh sont en points PDF, e.clientX/Y en px
    // écran. Sans diviser par scale, à zoom 200% la box grandit 2× plus vite
    // que la souris → le curseur distance le coin en cours de resize.
    const scale = zoom / 100
    // minW/minH appliqués UNIQUEMENT au mouseup (snap façon Kami).
    // Pendant le drag, dragMin (10) laisse l'utilisateur descendre plus
    // bas visuellement — la box rétrécit avec la souris. Au relâchement
    // on remonte à 30×30 PDF pt min. 30 (vs l'ancien 80) = assez petit
    // pour faire des boxes étroites style image 1 utilisateur, mais
    // assez grand pour que la zone reste utilisable (sinon les poignées
    // delete/TR/BR se chevauchent et la box devient invisible — c'est le
    // bug « pourquoi je peux faire ça de nouveau ?? »).
    // PAS de plancher haut-zoom ici (contrairement à l'autoSize useLayoutEffect) :
    // une fois que l'utilisateur resize MANUELLEMENT au zoom élevé, on veut qu'il
    // puisse faire des box visuellement aussi petites qu'il veut. Le minW/minH
    // est en PDF pt donc à zoom 317%, 30/scale = 9.5 PDF pt = 30 px visuel snap.
    const minW = 30 / scale, minH = 30 / scale
    const dragMin = 10 / scale
    let lastW = sw, lastH = sh
    const onMove = (e) => {
      lastW = Math.max(dragMin, sw + (e.clientX - sx) / scale)
      lastH = Math.max(dragMin, sh + (e.clientY - sy) / scale)
      onUpdate(id, { width: lastW, height: lastH, autoSize: false, manualSized: true })
    }
    const onUp = () => {
      resizingRef.current = false
      suppressNextClickAfterResize()
      // Snap au relâchement : BR ancre le top-left → largeur finale clampée,
      // puis hauteur minimum recalculée pour que TOUT le texte wrappé rentre
      // dans la box (style Kami). Pendant le drag on peut temporairement
      // couper le texte; au release la box remonte juste assez.
      const fitW = measureMinWidthToFitText()
      const finalW = Math.max(minW, lastW, fitW)
      const fitH = measureWrappedHeightForWidth(finalW)
      onUpdate(id, { width: finalW, height: Math.max(minH, lastH, fitH), autoSize: false, manualSized: true })
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  const handleResizeTR = (e) => {
    // Resize = geste interne à la textbox. Anciennement on laissait remonter
    // au canvas pour gérer certains cas de désélection, mais ça causait le bug
    // inverse : au release du resize top-right, l'outil texte recevait un click
    // et créait une nouvelle textbox. On bloque donc la propagation + on pose
    // un flag global très court pour ignorer le click synthétique éventuel.
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = true
    if (textareaRef.current) textareaRef.current.style.height = ''
    const sx = e.clientX, sy = e.clientY, sw = width, sh = height, sy0 = y
    const scale = zoom / 100
    // Min 30×30 PDF pt appliqué au mouseup (cf. handleResizeBR pour le
    // pourquoi du 30 vs 80). Pas de plancher haut-zoom : cf. handleResizeBR.
    const minW = 30 / scale, minH = 30 / scale
    const dragMin = 10 / scale
    let lastW = sw, lastH = sh, lastY = sy0
    const onMove = (e) => {
      const dw = (e.clientX - sx) / scale, dy = (e.clientY - sy) / scale
      lastW = Math.max(dragMin, sw + dw)
      lastH = Math.max(dragMin, sh - dy)
      // y suit la souris mais clampé pour pas dépasser le bottom (sy0+sh)
      // moins dragMin (sinon la box passe au-dessus de son propre bottom).
      lastY = sy0 + Math.min(dy, sh - dragMin)
      onUpdate(id, { width: lastW, height: lastH, y: lastY, autoSize: false, manualSized: true })
    }
    const onUp = () => {
      resizingRef.current = false
      suppressNextClickAfterResize()
      // Snap au relâchement : TR ancre le bottom-left. Pour garder
      // bottom = sy0+sh fixe après le clamp de hauteur à minH, on
      // recalcule finalY = (sy0+sh) - finalH. Sans ce recalcul, un snap
      // qui bumpe height à minH ferait sauter le bottom vers le bas.
      const fitW = measureMinWidthToFitText()
      const finalW = Math.max(minW, lastW, fitW)
      const fitH = measureWrappedHeightForWidth(finalW)
      const finalH = Math.max(minH, lastH, fitH)
      const finalY = sy0 + sh - finalH
      onUpdate(id, { width: finalW, height: finalH, y: finalY, autoSize: false, manualSized: true })
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  const handleResizeBL = (e) => {
    // Resize = geste interne à la textbox. On bloque la propagation pour que
    // le canvas en outil texte ne crée pas une nouvelle zone au release.
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = true
    if (textareaRef.current) textareaRef.current.style.height = ''
    const sx = e.clientX, sy = e.clientY, sw = width, sh = height, sx0 = x
    const scale = zoom / 100
    // Min 30×30 PDF pt appliqué au mouseup (cf. handleResizeBR pour le
    // pourquoi du 30 vs 80). Pas de plancher haut-zoom : cf. handleResizeBR.
    const minW = 30 / scale, minH = 30 / scale
    const dragMin = 10 / scale
    let lastW = sw, lastH = sh, lastX = sx0
    const onMove = (e) => {
      const dx = (e.clientX - sx) / scale, dy = (e.clientY - sy) / scale
      lastW = Math.max(dragMin, sw - dx)
      lastH = Math.max(dragMin, sh + dy)
      lastX = sx0 + Math.min(dx, sw - dragMin)
      onUpdate(id, { width: lastW, height: lastH, x: lastX, autoSize: false, manualSized: true })
    }
    const onUp = () => {
      resizingRef.current = false
      suppressNextClickAfterResize()
      // Snap au relâchement : BL ancre le top-right. Pour garder
      // right = sx0+sw fixe après le clamp de largeur à minW, on
      // recalcule finalX = (sx0+sw) - finalW.
      const fitW = measureMinWidthToFitText()
      const finalW = Math.max(minW, lastW, fitW)
      const finalX = sx0 + sw - finalW
      const fitH = measureWrappedHeightForWidth(finalW)
      onUpdate(id, { width: finalW, height: Math.max(minH, lastH, fitH), x: finalX, autoSize: false, manualSized: true })
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  const handleRotate = (e) => {
    // Rotation = geste interne à la textbox. Si l'utilisateur sort de l'arc
    // avant de relâcher, le click synthétique peut tomber sur le canvas et,
    // en outil texte, créer une nouvelle zone. Même protection que resize :
    // on bloque l'event au départ et on avale le click final au pointerup.
    e.preventDefault(); e.stopPropagation()
    const box = boxRef.current.getBoundingClientRect()
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx), r0 = rotation
    const onMove = (e) => setRotation(r0 + (Math.atan2(e.clientY - cy, e.clientX - cx) - a0) * (180 / Math.PI))
    const onUp = () => {
      suppressNextClickAfterResize()
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  const textStyle = {
    fontFamily: `'${fmt.font}', sans-serif`,
    fontSize: fmt.size,
    lineHeight: fmt.lineHeight,
    color: fmt.color,
    fontWeight: fmt.bold ? 700 : 400,
    fontStyle: fmt.italic ? 'italic' : 'normal',
    // Combine soulignement + barré (les deux peuvent être actifs en même
    // temps). CSS accepte une chaîne `"underline line-through"` pour cumuler.
    textDecoration: [fmt.underline && 'underline', fmt.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
    textAlign: fmt.align,
  }

  // Inverse-scale les poignées pour qu'elles restent à la même taille visuelle
  // peu importe le zoom (sinon elles deviennent énormes au zoom élevé puisque
  // le wrapper de page a transform: scale(zoom/100)). Match le comportement Kami.
  // Clamp à 0.4 minimum pour que les poignées ne deviennent pas microscopiques
  // aux très gros zooms (400%+). Match le comportement Kami : elles restent
  // confortables à grabber au lieu d'être strictement constantes en pixels.
  // Les poignées restent confortables au zoom-in, mais au dézoom elles ne
  // grossissent plus artificiellement : elles suivent la page comme la bordure.
  // Avant : 100 / zoom faisait scale(2) à 50% → boutons/arc énormes vs textbox.
  // Maintenant : cap max à 1. À zoom < 100%, transform=1 et le wrapper de page
  // scale déjà tout naturellement avec la textbox.
  const handleScale = Math.min(1, Math.max(0.4, 100 / zoom))
  const handleStyle = { transform: `scale(${handleScale})` }

  // Mode autoSize : pas de wrap, la box grandit avec le texte.
  // Mode non-autoSize (après resize manuel) : wrap natif du textarea/div.
  // overflow:hidden dans les deux cas : empêche le textarea de scroller en
  // interne pendant le bref délai entre la frappe et l'update de hauteur,
  // sinon on voit le texte monter avant que la box s'allonge.
  // Wrap : forcé INLINE pour couper court à toute pollution CSS (un reset
  // global ou un parent avec white-space: nowrap aurait pu empoisonner le
  // contentEditable). En mode autoSize=false (cas par défaut depuis qu'on
  // matche Kami), on impose pre-wrap + overflow-wrap: anywhere + word-break:
  // break-word — la triple combo garantit que le texte coupe TOUJOURS au
  // bord droit, même pour des mots ultra-longs sans espace (« aaaaaaa... »).
  // Sans ça, taper jusqu'au bord droit faisait sortir le texte sous overflow:
  // hidden au lieu de wrapper → illusion que la frappe « ne continuait pas ».
  // En mode wrap (autoSize=false), on OVERRIDE le `position: absolute;<br>  // inset: 0` du CSS pour passer en `position: relative; width: 100%;<br>  // height: 100%; box-sizing: border-box`. Raison : avec position:absolute
  // + inset:0, la largeur du contentEditable est calculée implicitement
  // par le navigateur (containing-block.width - left - right). Cette
  // largeur « implicite » est parfois ignorée par pre-wrap quand le parent
  // a un transform: scale() (= notre wrapper de page à zoom non-100%),
  // résultat : le texte ne wrappe pas et déborde sous overflow:hidden.
  // Une largeur EXPLICITE via `width: 100%` + box-sizing: border-box règle
  // définitivement le pb : le navigateur a une cible nette pour wrap.
  // ── Wrap au bord du PDF (TOUJOURS pre-wrap en édition) ──
  // La box grandit horizontalement avec le texte parce que useLayoutEffect
  // cale sa width sur max-content du contenu (capé à pagePdfWidth - x).
  // Quand la box atteint le bord du PDF, sa width arrête de grandir et
  // pre-wrap prend le relais → le texte wrappe à la ligne suivante au
  // lieu de déborder hors page.
  //
  // ⚠️ Pourquoi pas de mode hybride pre / pre-wrap selon atPageEdge ?
  // Tentative initiale : white-space: pre tant que la box n'est pas au
  // bord (pour le feel Kami autoSize), pre-wrap quand elle l'atteint.
  // BUG : un contentEditable en pre + overflow:hidden auto-scrolle
  // HORIZONTALEMENT pour garder le caret visible dès que le texte
  // dépasse la width interne. Résultat : le DÉBUT du texte disparaît
  // à gauche pendant la frappe (« le texte de gauche s'en va à
  // gauche »). La bascule vers pre-wrap arrive trop tard pour effacer
  // le scrollLeft accumulé sur les frames précédentes, et la combo
  // wrap + scroll left coexistent visuellement.
  // Solution : pre-wrap CONSTANT. La sensation « la box suit le texte
  // horizontalement » vient uniquement du useLayoutEffect qui ajuste
  // width = max-content (sans wrap, parce que max-content reflète la
  // largeur naturelle du texte sur une seule ligne tant qu'il n'y a
  // pas de \n manuel). Quand max-content > maxAllowedW, la cap kicks
  // in, width plafonne, pre-wrap fait wrapper. Aucune frame ne peut
  // scroller horizontalement : white-space: pre-wrap n'autorise pas
  // le débordement horizontal.
  // ── CSS-driven auto-grow horizontal (mode édition + autoSize) ──
  // Architecture : on laisse le navigateur dimensionner le wrapper via
  // `width: max-content` + `max-width: cssMaxWidth` au lieu de calculer la
  // width côté JS via useLayoutEffect→onUpdate. Pourquoi :
  //  - Aucune frame intermédiaire avec une vieille width étroite. Le
  //    browser layout le wrapper en MÊME TEMPS que le contentEditable
  //    change de contenu (même cycle de paint). Pas de race React 18.
  //  - max-content reflète la natural width du texte sans wrap. Tant que
  //    natural < cssMaxWidth, le wrapper grandit. Quand natural atteint
  //    cssMaxWidth, le cap CSS clamp et pre-wrap sur le contentEditable
  //    wrappe le texte → la box descend en hauteur (max-content height).
  //  - minWidth/minHeight = dims courantes garantissent le grow-only
  //    pendant la frappe (la box ne shrink JAMAIS). Le shrink-to-fit
  //    Kami se fait au blur via le handler click-outside plus haut.
  // useLayoutEffect (plus haut) ne fait plus que LIRE offsetWidth/Height
  // pour persister dans le state React (cloud mirror, undo, blur).
  const cssAutoGrow = editing && !manualSized
  // Cap réel de la box en mode autoSize. Le wrapper a une border transparente
  // de 10px de chaque côté et son `left` est x - 10. Donc le bord visible droit
  // tombe à x + width - 20. Pour toucher pagePdfWidth : width = pagePdfWidth - x + 20.
  const cssMaxWidth = pagePdfWidth != null
    ? Math.max(60, pagePdfWidth - x + 20)
    : null
  const renderWidth = cssAutoGrow && cssMaxWidth != null
    ? Math.min(width, cssMaxWidth)
    : width
  const cssAtPdfEdge = cssAutoGrow && cssMaxWidth != null && renderWidth >= cssMaxWidth - 1

  const textareaStyle = cssAutoGrow ? {
    ...textStyle,
    // Mode autoSize : on garde la structure CSS normale de .textbox-editable
    // (position:absolute; inset:0). La box est une width numérique pilotée par
    // `syncAutoGrowFromDom` dans onInput. Surtout PAS de fit-content/max-content
    // ici : avec contentEditable + transform scale, l'intrinsic sizing CSS peut
    // décider de wrapper avant que le state React ait propagé la nouvelle width.
    // Avant le bord PDF : `pre` = aucune ligne automatique possible. Au bord :
    // `pre-wrap` = le PDF force la ligne suivante.
    whiteSpace: cssAtPdfEdge ? 'pre-wrap' : 'pre',
    wordBreak: cssAtPdfEdge ? 'break-word' : 'normal',
    overflowWrap: cssAtPdfEdge ? 'anywhere' : 'normal',
    overflow: 'hidden',
  } : {
    ...textStyle,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    overflow: 'hidden',
  }
  const contentStyle = {
    ...textStyle,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  }

  // Position du wrapper de la textbox — left/top en points PDF, décalés de
  // -10 pour compenser la border transparente (cf. commentaire dans le JSX).
  // IMPORTANT : même en autoSize, on rend une width/height NUMÉRIQUE. La
  // croissance se fait dans onInput, synchroniquement, puis React reçoit
  // width/height dans le même update que text. Aucun intrinsic CSS ici.
  const wrapperStyle = {
    left: x - 10,
    top: y - 10,
    width: renderWidth,
    height,
    transform: `rotate(${rotation}deg)`,
    transformOrigin: 'center center',
  }

  // Extrait dans une const pour éviter la double-accolade JSX inline
  // (pattern style=... ou prop=...) qui se fait compresser/casser
  // par le pipeline d'édition. Inlineé dans le JSX = bug vécu plusieurs
  // fois dans cette session.
  const readonlyHtmlProp = { __html: isPlainText(text) ? escapeHtml(text) : (text || '') }

  // ── Auto-grow SYNCHRONE pendant la frappe ──
  // C'est la pièce qui manquait : attendre useLayoutEffect/onUpdate crée un
  // délai React où le contentEditable peut déjà wrapper dans l'ancienne width.
  // Ici on mesure ET on applique la width directement dans onInput, donc dans
  // le même event que la frappe, avant le prochain paint.
  const syncAutoGrowFromDom = (el) => {
    if (manualSized || !boxRef.current || !el) return null

    const wrapper = boxRef.current
    const maxOuterW = pagePdfWidth != null
      ? Math.max(40, pagePdfWidth - x + 20)
      : Infinity

    const prev = {
      position: el.style.position,
      top: el.style.top,
      left: el.style.left,
      right: el.style.right,
      bottom: el.style.bottom,
      inset: el.style.inset,
      display: el.style.display,
      width: el.style.width,
      maxWidth: el.style.maxWidth,
      minWidth: el.style.minWidth,
      height: el.style.height,
      whiteSpace: el.style.whiteSpace,
      wordBreak: el.style.wordBreak,
      overflowWrap: el.style.overflowWrap,
      overflow: el.style.overflow,
    }

    // Mesure naturelle SANS wrap. Tant que cette largeur tient avant le bord
    // du PDF, la box doit continuer horizontalement.
    el.style.position = 'relative'
    el.style.top = 'auto'; el.style.left = 'auto'
    el.style.right = 'auto'; el.style.bottom = 'auto'
    el.style.inset = 'auto'
    el.style.display = 'inline-block'
    el.style.width = 'max-content'
    el.style.maxWidth = 'none'
    el.style.minWidth = '0'
    el.style.height = 'auto'
    el.style.whiteSpace = 'pre'
    el.style.wordBreak = 'normal'
    el.style.overflowWrap = 'normal'
    el.style.overflow = 'visible'
    void el.offsetWidth

    // offsetWidth du contentEditable inclut son padding; +20 = border
    // transparente du wrapper (10 gauche + 10 droite).
    const naturalOuterWRaw = Math.ceil(el.offsetWidth) + 20
    const naturalOuterW = naturalOuterWRaw + AUTO_GROW_X_BUFFER
    const nextW = isFinite(maxOuterW)
      ? Math.min(Math.max(width, naturalOuterW), maxOuterW)
      : Math.max(width, naturalOuterW)

    const atPdfEdge = isFinite(maxOuterW) && naturalOuterWRaw > maxOuterW
    const innerW = Math.max(20, nextW - 20)

    // Layout final appliqué tout de suite. Avant le bord : pre = aucune ligne.
    // Au bord : pre-wrap = le PDF force la ligne suivante.
    el.style.width = `${innerW}px`
    el.style.maxWidth = `${innerW}px`
    el.style.minWidth = `${innerW}px`
    el.style.whiteSpace = atPdfEdge ? 'pre-wrap' : 'pre'
    el.style.wordBreak = atPdfEdge ? 'break-word' : 'normal'
    el.style.overflowWrap = atPdfEdge ? 'anywhere' : 'normal'
    el.style.height = 'auto'
    void el.offsetHeight

    const nextH = Math.max(height, Math.ceil(el.offsetHeight) + 20)

    wrapper.style.width = `${nextW}px`
    wrapper.style.height = `${nextH}px`

    el.scrollLeft = 0
    el.scrollTop = 0

    // On laisse React rerender avec text+width+height ensemble. Les styles
    // inline temporaires peuvent ensuite être remplacés par textareaStyle :
    // l'important est que la frame de frappe n'ait jamais eu le temps de
    // wrapper dans l'ancienne petite largeur.
    Object.assign(el.style, {
      position: prev.position,
      top: prev.top,
      left: prev.left,
      right: prev.right,
      bottom: prev.bottom,
      inset: prev.inset,
      display: prev.display,
      width: prev.width,
      maxWidth: prev.maxWidth,
      minWidth: prev.minWidth,
      height: prev.height,
      whiteSpace: prev.whiteSpace,
      wordBreak: prev.wordBreak,
      overflowWrap: prev.overflowWrap,
      overflow: prev.overflow,
    })

    return { width: nextW, height: nextH }
  }

  return (
    <>
      <div
        ref={boxRef}
        className={`textbox ${selected ? 'selected' : ''} ${inSelection ? 'in-selection' : ''}`}
        // left/top représentent la position VISIBLE (= bordure verte). On
        // décale l'outer wrapper de -10 PDF pt pour compenser la border
        // transparente de 10px (zone de grab invisible). Sans ce décalage :
        // l'utilisateur clique à (cx, cy), outer corner atterrit là, mais la
        // bordure visible est 10 × scale px À L'INTÉRIEUR → au zoom 200% ça
        // fait 20 px de décalage, 40 px à 400%. Résultat : « la souris ne
        // suit pas » pendant un resize (le corner visible traîne 20-40 px
        // derrière le handle/curseur) ET la box semble téléporter en bas-
        // droite au placement.
        style={wrapperStyle}
        onPointerDown={(e) => handleDrag(e)}
        onClick={(e) => { e.stopPropagation(); onSelect(id) }}
        onDoubleClick={() => {
          if (readOnly) return
          setEditing(true)
          setTimeout(() => textareaRef.current?.focus(), 0)
        }}
      >
        {editing ? (
          <div
            ref={textareaRef}
            className="textbox-editable"
            // .no-wrap retiré pour de bon : on reste TOUJOURS en
            // white-space: pre-wrap en édition (cf. commentaire détaillé
            // sur textareaStyle plus haut). Le mode hybride pre/pre-wrap
            // au bord du PDF causait un scroll horizontal résiduel dans
            // le contentEditable — bug fixé en supprimant entièrement
            // pre.
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            style={textareaStyle}
            onInput={(e) => {
              // contentEditable : on lit innerHTML après chaque frappe.
              // Pas besoin du grow synchrone (la div n'a pas de height
              // figée à débloquer comme un textarea natif). useLayoutEffect
              // s'occupe d'agrandir le wrapper si scrollHeight déborde.
              const html = e.currentTarget.innerHTML
              // ── Auto-calcul style Apple Notes ──
              // Gate stricte sur inputType : on ne déclenche QUE quand
              // l'utilisateur vient littéralement de taper le caractère
              // « = » (insertText avec data === '='). Toute autre opération
              // (delete forward/backward, cut, paste, autre frappe) skip
              // l'auto-calc — sinon, quand l'user efface le résultat inséré,
              // onInput refire avec une ligne qui se termine encore par « = »
              // et ré-insère le résultat → impossible à effacer.
              // Le toggle vit dans Paramètres → Général (localStorage
              // jacpdf_autoCalcEnabled). Lu à chaque frappe dans tryAutoCalc.
              const it = e.nativeEvent && e.nativeEvent.inputType
              const data = e.nativeEvent && e.nativeEvent.data
              const justTypedEquals = it === 'insertText' && data === '='
              if (justTypedEquals) {
                const calc = tryAutoCalc(html)
                if (calc !== null) {
                  let inserted = false
                  try {
                    inserted = document.execCommand('insertText', false, ' ' + calc)
                  } catch { inserted = false }
                  if (!inserted) {
                    // Fallback Selection API (browsers où execCommand est désactivé).
                    const sel = window.getSelection()
                    if (sel && sel.rangeCount > 0) {
                      const range = sel.getRangeAt(0)
                      const node = document.createTextNode(' ' + calc)
                      range.insertNode(node)
                      range.setStartAfter(node)
                      range.collapse(true)
                      sel.removeAllRanges()
                      sel.addRange(range)
                    }
                  }
                  const finalHtml = e.currentTarget.innerHTML
                  lastSetRef.current = finalHtml
                  const dims = syncAutoGrowFromDom(e.currentTarget)
                  onUpdate(id, { text: finalHtml, ...(!manualSized ? { autoSize: true, manualSized: false } : {}), ...(dims || {}) })
                  return
                }
              }
              lastSetRef.current = html
              const dims = syncAutoGrowFromDom(e.currentTarget)
              onUpdate(id, { text: html, ...(!manualSized ? { autoSize: true, manualSized: false } : {}), ...(dims || {}) })
            }}
            onKeyDown={(e) => {
              // ─── Sortie d'un slot math gris [data-math-slot] via les
              // flèches ← / → ───
              // Quand le caret est dans un slot d'un template math (par
              // ex. l'indice de a_b ou le numérateur d'une fraction
              // empilée), le browser se traite naturellement le slot
              // comme un span normal mais le ZWSP à l'intérieur crée
              // 2 positions de caret "identiques" qui forcent l'utili-
              // sateur à spammer la flèche pour s'échapper. On simplifie
              // : dès que le caret est au bord (début pour ←, fin pour
              // →) du contenu utile du slot (textContent moins les
              // ZWSP), un seul appui sort le caret juste avant/après le
              // span. Comme ça la frappe se fait naturellement : on
              // tape l'indice, flèche droite une fois, on continue sur
              // la ligne suivante.
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              const sel = window.getSelection()
              if (!sel || sel.rangeCount === 0) return
              const range = sel.getRangeAt(0)
              // Si l'utilisateur a une selection (pas juste un caret),
              // on laisse le browser faire son boulot (extension de
              // selection avec Shift+← par ex.).
              if (!range.collapsed) return
              // Remonter depuis startContainer pour trouver l'ancetre
              // [data-math-slot] le plus proche, en s'arrêtant au div
              // contentEditable lui-même (pas la peine d'aller plus haut).
              let node = range.startContainer
              let slot = null
              while (node && node !== e.currentTarget) {
                if (node.nodeType === 1 && node.hasAttribute && node.hasAttribute('data-math-slot')) {
                  slot = node
                  break
                }
                node = node.parentNode
              }
              if (!slot) return
              // Calculer la position du caret à l'intérieur du slot
              // (en nombre de caractères utiles, ZWSP exclus). On clone
              // la range, on l'étend du début du slot jusqu'à la position
              // courante, et on mesure la longueur en strippant les ZWSP.
              // ⚠️ On construit le caractère ZWSP via String.fromCharCode
              // au lieu d'une regex //g parce que le pipeline d'édition
              // strippe les ZWSP des regex littérales du source, ce qui les
              // transforme en // (regex vide = SyntaxError au parse).
              // split/join évite complètement le problème d'escape.
              const ZWSP = String.fromCharCode(0x200B)
              const preRange = range.cloneRange()
              preRange.selectNodeContents(slot)
              preRange.setEnd(range.startContainer, range.startOffset)
              const caretOffset = (preRange.toString() || '').split(ZWSP).join('').length
              const slotLen = (slot.textContent || '').split(ZWSP).join('').length
              if (e.key === 'ArrowRight' && caretOffset >= slotLen) {
                // Caret au bout (ou slot vide) : on sort à droite du span.
                e.preventDefault()
                const out = document.createRange()
                out.setStartAfter(slot)
                out.collapse(true)
                sel.removeAllRanges()
                sel.addRange(out)
              } else if (e.key === 'ArrowLeft' && caretOffset === 0) {
                // Caret tout au début (ou slot vide) : on sort à gauche.
                e.preventDefault()
                const out = document.createRange()
                out.setStartBefore(slot)
                out.collapse(true)
                sel.removeAllRanges()
                sel.addRange(out)
              }
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              suppressClickAfterTextPointerUp()
            }}
          />
        ) : (
          <div
            className="textbox-content"
            style={contentStyle}
            // L'intérieur sert au texte : clic = entrer en édition et placer
            // le caret à l'endroit cliqué. Le drag reste réservé à la bordure.
            onPointerDown={(e) => {
              e.stopPropagation()
              suppressClickAfterTextPointerUp()
              if (readOnly) {
                onSelect(id)
                return
              }

              pendingCaretPointRef.current = { clientX: e.clientX, clientY: e.clientY }
              onSelect(id)
              setEditing(true)
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            // dangerouslySetInnerHTML pour rendre le HTML enrichi (B/I/U/S/
            // sub/sup) en mode lecture. Plaintext legacy : escapeHtml +
            // saut de ligne → <br>.
            dangerouslySetInnerHTML={readonlyHtmlProp}
          />
        )}

        {/* Handles toujours rendus : CSS les cache/affiche selon hover/selected.
            Nécessaire pour afficher les boutons au survol d'une textbox non
            sélectionnée (style Kami), pas seulement le contour. */}
        {!readOnly && (
        <>
          <button className="tb-handle tb-handle-delete" style={handleStyle} onPointerDown={(e) => { e.stopPropagation(); onDelete(id) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div className="tb-handle tb-handle-tr" style={handleStyle} onPointerDown={handleResizeTR}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </div>
          <div className="tb-handle tb-handle-br" style={handleStyle} onPointerDown={handleResizeBR}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </div>
          {/* Resize bottom-left désactivé sur demande utilisateur. On
              garde uniquement la zone de rotation (cercle vert, quadrant
              bas-gauche). Pour ré-activer : remettre <div
              className="tb-rotate-resize" onPointerDown={handleResizeBL}>
              ...svg... </div> à l'intérieur. handleResizeBL et la classe
              CSS .tb-rotate-resize sont conservés pour faciliter le
              retour arrière. */}
          <div className="tb-handle-rotate-area" style={handleStyle} onPointerDown={handleRotate} />
        </>
        )}
      </div>

      {editing && !readOnly && createPortal(
        <FormatBar
          fmt={fmt}
          onChange={setFmt}
          colorMode="picker"
          onOpenColorPicker={(anchorRect) => setColorPickerAnchor(anchorRect)}
          showList={false}
        />,
        document.body
      )}

      {/* ColorPicker rendu via portail vers document.body : son parent
          .textbox a transform: rotate(...) qui crée un containing block
          et casse le position:fixed du popup (les top/left finissent
          interprétés relativement à la textbox transformée au lieu du
          viewport → popup décalé à droite, cf. screenshots user 6 mai
          19:17-19:22). En rendant via createPortal hors du subtree
          transformé, le fixed retombe sur le viewport. */}
      {colorPickerAnchor && createPortal(
        <ColorPicker
          color={fmt.color}
          recentColors={recentColorsStore.get('text')}
          anchorRect={colorPickerAnchor}
          onInsert={(color) => {
            setFmt({ ...fmt, color })
            recentColorsStore.add('text', color)
          }}
          onClose={() => setColorPickerAnchor(null)}
        />,
        document.body
      )}
    </>
  )
}