import { useState, useEffect, useRef, useCallback, memo } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import TextBox from '@/shared/components/ui/TextBox'
import { findDrawingAt, findTextboxAt } from '@/apps/jacpdf/lib/pdf/geometry'
import { usePerformanceSettings } from '@/shared/hooks/system/usePerformanceSettings'

// Rendu d'UNE page PDF + son overlay annotations + ses textboxes.
// L'état (drawings, textBoxes, sélections...) vit dans EditorInstance — ici
// on ne gère que le rendu canvas, les events pointer (crayon, surligneur,
// efface, forme, select), et l'UI du rectangle de sélection avec ses 8
// poignées de redimensionnement.
function PdfPage({ pdf, pageNumber, zoom, rotation, onVisible, onPageSizeKnown, textBoxes = [], drawings = [], activeTool, pencilSettings = { color: '#111111', size: 3 }, highlightSettings = { color: '#FFFF00', size: 18 }, eraserSettings = { mode: 'free', size: 20 }, shapeSettings = { shape: 'rect', color: '#111111', size: 3 }, onDrawingComplete, onDrawingDelete, onDrawingsErase, onDrawingSelect, onDrawingMove, onDrawingResize, onDrawingDrop, onDrawingDragStart, onDrawingDragEnd, onTextBoxDrop, selectedDrawingId, selectedDrawingIds = [], selectedCommentId, onCommentCreate, onCommentSelect, onDrawingMultiSelect, onDrawingGroupMove, onDrawingGroupDrop, draggingDrawingId, selectedBox, selectedBoxes = [], onSelect, onUpdate, onDelete, onGroupDrag, pageWidth = 612, pageHeight = 792, stylusActiveRef, currentUserId = null, canEditOthers = true, readOnly = false, searchQuery = '', ocrWordBoxes = [] }) {
  // Réglages de performance (Lot 7) — renderQuality, imageSmoothing,
  // rerenderOnZoom. Sur Équilibré, ces valeurs reproduisent le comportement
  // historique (renderQuality=2 ≡ dpr=2 sur Retina, smoothing on, re-render
  // aux paliers de zoom).
  const perfSettings = usePerformanceSettings()
  const canvasRef = useRef(null)
  const drawCanvasRef = useRef(null)
  const wrapperRef = useRef(null)
  const renderTaskRef = useRef(null)
  const [needsRender, setNeedsRender] = useState(0)
  const wasVisibleRef = useRef(false)
  // Couche texte pdf.js — spans absolument positionnés au-dessus du canvas
  // pour permettre la sélection texte native (souris) + le surlignage des
  // résultats de recherche.
  const textLayerRef = useRef(null)
  const searchOverlayRef = useRef(null)
  // Cache des items texte (positions en PDF points, déjà calculées par le
  // textLayer effect). Le surlignage de recherche s'en sert pour positionner
  // les marks SANS dépendre du rendu navigateur — sinon les largeurs de
  // glyphes du font système (sans-serif) ne correspondent pas à celles du
  // PDF et les highlights dérivent caractère-par-caractère.
  const textItemsRef = useRef([])
  const [textLayerReady, setTextLayerReady] = useState(0)
  const isDrawingRef = useRef(false)
  const currentPointsRef = useRef([])
  const imageCacheRef = useRef({})
  const [imageLoadTick, setImageLoadTick] = useState(0)
  const [localMarquee, setLocalMarquee] = useState(null) // rectselect en coords PDF points
  // Aperçu du curseur pour crayon/surligneur/efface — cercle de la taille
  // exacte du trait qui suit le pointeur. Améliore la précision : l'utilisateur
  // voit la largeur réelle du trait AVANT de cliquer (au lieu d'un crosshair
  // indifférent). null = aucun aperçu (autre outil ou pointeur sorti du canvas).
  const [cursorPreview, setCursorPreview] = useState(null)

  const getDrawingBbox = (d) => {
    if (!d) return null
    if (d.type === 'comment') return { x: d.x - 10, y: d.y - 10, width: 20, height: 20 }
    if (d.type === 'image') return { x: d.x, y: d.y, width: d.width, height: d.height }
    if (d.type === 'shape') {
      if (d.shape === 'line') {
        const x1 = d.x, y1 = d.y, x2 = d.x + d.width, y2 = d.y + d.height
        return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(d.width), height: Math.abs(d.height) }
      }
      return { x: d.x, y: d.y, width: d.width, height: d.height }
    }
    if ((d.type === 'drawing' || d.type === 'highlight') && d.points?.length) {
      const xs = d.points.map(p => p.x), ys = d.points.map(p => p.y)
      const minX = Math.min(...xs), minY = Math.min(...ys)
      const maxX = Math.max(...xs), maxY = Math.max(...ys)
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }
    return null
  }

  const rectsIntersect = (a, b) =>
    a.x <= b.x + b.width && a.x + a.width >= b.x &&
    a.y <= b.y + b.height && a.y + a.height >= b.y

  // Nettoie le cache d'images quand un drawing image n'existe plus dans la liste.
  // Sans ça, imageCacheRef accumule des Image() jamais libérés sur une session longue.
  useEffect(() => {
    const validIds = new Set(
      drawings.filter(d => d.type === 'image').map(d => String(d.id))
    )
    Object.keys(imageCacheRef.current).forEach(id => {
      if (!validIds.has(String(id))) {
        delete imageCacheRef.current[id]
      }
    })
  }, [drawings])

  // Lot 7 — purge totale du cache au démontage de la page (changement de
  // fichier PDF ou fermeture d'onglet) pour aider le GC à libérer les
  // bitmaps Image() le plus tôt possible.
  useEffect(() => {
    return () => {
      imageCacheRef.current = {}
    }
  }, [])

  // Redraw all saved drawings (+ optional live stroke) on overlay canvas.
  // liveDrawing: { points, color, size, type } pour l'affichage en temps réel.
  const redrawOverlay = useCallback((liveDrawing = null) => {
    const dc = drawCanvasRef.current
    if (!dc) return
    const ctx = dc.getContext('2d')
    ctx.clearRect(0, 0, dc.width, dc.height)
    // Masque l'annotation en cours de drag cross-page — elle est rendue par
    // l'overlay SVG au niveau de .editor-canvas, sinon le canvas bitmap de la
    // page d'origine (taille exacte de la page) clippe l'annotation dès
    // qu'elle sort des bounds pendant le drag → elle disparaît.
    const visible = drawings.filter(d => d.id !== draggingDrawingId)
    const all = liveDrawing
      ? [...visible, liveDrawing]
      : visible
    // On dessine les surlignages EN-DESSOUS des tracés crayon.
    const sorted = [...all].sort((a, b) => {
      const ta = a.type === 'highlight' ? 0 : 1
      const tb = b.type === 'highlight' ? 0 : 1
      return ta - tb
    })
    sorted.forEach(d => {
      if (d.type === 'image') {
        const cache = imageCacheRef.current
        let img = cache[d.id]
        if (!img) {
          img = new Image()
          img.onload = () => setImageLoadTick(n => n + 1)
          img.src = d.src
          cache[d.id] = img
        }
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, d.x, d.y, d.width, d.height)
        }
        return
      }
      if (d.type === 'shape') {
        ctx.save()
        ctx.strokeStyle = d.color || '#111111'
        ctx.lineWidth = d.size || 3
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        const { shape: sh, x: sx, y: sy, width: w, height: h } = d
        if (sh === 'rect') {
          ctx.rect(sx, sy, w, h)
        } else if (sh === 'circle') {
          ctx.ellipse(sx + w/2, sy + h/2, Math.abs(w/2), Math.abs(h/2), 0, 0, Math.PI * 2)
        } else if (sh === 'triangle') {
          ctx.moveTo(sx + w/2, sy)
          ctx.lineTo(sx + w, sy + h)
          ctx.lineTo(sx, sy + h)
          ctx.closePath()
        } else if (sh === 'line') {
          ctx.moveTo(sx, sy)
          ctx.lineTo(sx + w, sy + h)
        }
        ctx.stroke()
        ctx.restore()
        return
      }
      if (!d.points || d.points.length < 2) return
      ctx.save()
      ctx.beginPath()
      ctx.strokeStyle = d.color || '#111111'
      ctx.lineWidth = d.size || 3
      if (d.type === 'highlight') {
        ctx.globalAlpha = 0.4
        ctx.lineCap = 'butt'
      } else {
        ctx.lineCap = 'round'
      }
      ctx.lineJoin = 'round'
      ctx.moveTo(d.points[0].x, d.points[0].y)
      d.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.stroke()
      ctx.restore()
    })
  }, [drawings, imageLoadTick, draggingDrawingId])

  useEffect(() => { redrawOverlay() }, [redrawOverlay])

  // Curseur, pointer-events et z-index sur le canvas de dessin selon l'outil actif + mode efface
  // En mode efface : on élève z-index pour que le drawCanvas passe AU-DESSUS des textboxes —
  // sinon les textbox interceptent le clic avant qu'il n'arrive sur le canvas.
  // En mode dessin (pencil/highlight/eraser/shapes) : on coupe les pointer-events
  // des spans de la couche texte → les clics tombent sur drawCanvas et non sur
  // les <span> de texte. En mode select/text/hand, les spans restent
  // interactifs → sélection de texte à la souris.
  useEffect(() => {
    const dc = drawCanvasRef.current
    if (!dc) return
    const interactive = activeTool === 'pencil' || activeTool === 'highlight' || activeTool === 'eraser' || activeTool === 'shapes' || activeTool === 'select' || activeTool === 'rectselect' || activeTool === 'comment'
    dc.style.pointerEvents = interactive ? 'auto' : 'none'
    const tl = textLayerRef.current
    if (tl) {
      const drawingTool = activeTool === 'pencil' || activeTool === 'highlight' || activeTool === 'eraser' || activeTool === 'shapes' || activeTool === 'rectselect' || activeTool === 'comment'
      tl.style.setProperty('--pdf-text-pe', drawingTool ? 'none' : 'auto')
    }
    // touch-action: none — empêche le navigateur de scroller/zoomer la page
    // quand on dessine au doigt ou au stylet sur le canvas (Lot 4). Sans ça,
    // le browser fire pointercancel dès qu'il interprète le drag comme un
    // scroll → le tracé est tronqué.
    dc.style.touchAction = 'none'
    // textboxes sont à z-index: 10, on doit passer au-dessus
    dc.style.zIndex = activeTool === 'eraser' ? '50' : ''
    if (activeTool === 'pencil' || activeTool === 'highlight' || activeTool === 'shapes' || activeTool === 'rectselect' || activeTool === 'comment') dc.style.cursor = 'crosshair'
    else if (activeTool === 'eraser') {
      dc.style.cursor = eraserSettings.mode === 'free' ? 'cell' : 'crosshair'
    } else dc.style.cursor = 'default'
  }, [activeTool, eraserSettings.mode])

  // Sync overlay canvas size with page canvas size
  useEffect(() => {
    const pdfCanvas = canvasRef.current
    const dc = drawCanvasRef.current
    if (!pdfCanvas || !dc) return
    const observer = new ResizeObserver(() => {
      // dc bitmap reste en PDF points (pas en taille bitmap haute-rés du
      // pdfCanvas) — les drawings sont définis en coords PDF points, on garde
      // 1:1. Le wrapper scale(zoom/100) gère l'upscale visuel comme avant.
      dc.width  = pageWidth
      dc.height = pageHeight
      redrawOverlay()
    })
    observer.observe(pdfCanvas)
    return () => observer.disconnect()
  }, [pageWidth, pageHeight, redrawOverlay])

  // ── Rendu haute résolution (qualité PDF) ──
  // Avant : on rendait toujours à scale 1 (= taille PDF en points). Le wrapper
  // appliquait ensuite transform: scale(zoom/100) → le browser upscalait le
  // bitmap = flou. Sur Retina (dpr=2) le PDF était même flou à 100% parce que
  // 1 PDF point = 1 CSS pixel = 2 device pixels (browser interpole). Pour un
  // gros PDF avec scans haute-rés 300 dpi, on perdait tous les détails.
  //
  // Maintenant : bitmap rendu à dpr × tier (tier dépend du zoom). CSS size
  // reste = PDF points (donc le wrapper scale(zoom/100) marche pareil), mais
  // le bitmap a plus de pixels → net sur Retina + au zoom in. Tier quantifié
  // (1, 1.5, 2, 3, 4) pour éviter de re-rendre à CHAQUE % de zoom (coûteux
  // sur gros PDFs) — entre deux paliers, le CSS transform absorbe les
  // ajustements fins.
  const zoomTier = (() => {
    // Lot 7 — si rerenderOnZoom est désactivé (preset Performance), on
    // plafonne à 1×. Le canvas garde sa résolution PDF de base et le
    // browser upscale en CSS au zoom (= flou au gros zoom mais 0 re-render,
    // beaucoup plus rapide).
    if (!perfSettings.rerenderOnZoom) return 1
    const z = zoom / 100
    if (z > 3) return 4
    if (z > 2) return 3
    if (z > 1.5) return 2
    if (z > 1) return 1.5
    return 1
  })()

  useEffect(() => {
    if (!pdf || !canvasRef.current) return

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel()
      renderTaskRef.current = null
    }

    let cancelled = false

    // Lot 7 — étape E. Wrap rendering in a retry-once helper. Si le 1er
    // render échoue (autre qu'un cancel volontaire), on retry après 120 ms.
    // Couvre les cas transitoires : context lost (GPU process redemarre),
    // OOM passager, race entre deux renders rapides. En dev, on log pour
    // debug ; en prod, échec final silencieux (l'utilisateur peut scroller
    // out/in pour re-trigger un nouveau render via wasVisibleRef).
    const doRender = async (attempt = 0) => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled || !canvasRef.current) return
        const viewport = page.getViewport({ scale: 1, rotation })
        // Lot 7 — informe le parent de la vraie dimension de cette page dès
        // qu'on l'a lue, pour qu'il mette à jour pageSizes au lieu de garder
        // le fallback Letter du chargement initial (évite de précharger toutes
        // les pages au boot pour leurs dimensions).
        onPageSizeKnown?.(pageNumber, viewport.width, viewport.height)
        const canvas = canvasRef.current
        // Lot 7 — renderQuality remplace dpr. Pilote la qualité de base
        // (1× / 2× / 3×) indépendamment du devicePixelRatio. Sur Retina
        // (dpr=2), Équilibré (=2) donne le même rendu qu'avant ; preset
        // Beauté oversample même sur Retina (3×), preset Performance reste
        // à 1× (léger upscale CSS, plus rapide).
        const renderScale = perfSettings.renderQuality * zoomTier
        const bitmapW = Math.floor(viewport.width  * renderScale)
        const bitmapH = Math.floor(viewport.height * renderScale)
        // ── Double-buffering anti-clignotement ──
        // Avant : on faisait `canvas.width = ...` AVANT le rendu. Or réassigner
        // canvas.width/height EFFACE instantanément le canvas visible, et le
        // rendu pdf.js qui suit est asynchrone (await task.promise). Entre les
        // deux, la page apparaissait BLANCHE → un flash à chaque palier de zoom
        // (dézoom/zoom = franchissement de zoomTier → re-render → clignotement).
        // Maintenant : on rend dans un canvas hors-écran, puis on copie le
        // résultat fini sur le canvas visible en UNE étape synchrone. Le canvas
        // visible garde son ancien bitmap (légèrement upscalé en CSS par le
        // wrapper le temps du rendu) au lieu de devenir blanc → plus de flash.
        const off = document.createElement('canvas')
        off.width  = bitmapW
        off.height = bitmapH
        const offCtx = off.getContext('2d')
        // Transform passé à pdf.js pour qu'il dessine à la résolution bitmap
        // sans changer le viewport logique (= coords PDF points conservées).
        const transform = renderScale !== 1
          ? [renderScale, 0, 0, renderScale, 0, 0]
          : null
        const task = page.render({ canvasContext: offCtx, viewport, transform })
        renderTaskRef.current = task
        await task.promise
        if (cancelled || !canvasRef.current) return
        // Swap synchrone : on (re)dimensionne le canvas visible puis on blit le
        // bitmap hors-écran d'un coup. Le canvas n'est jamais montré vide.
        canvas.width  = bitmapW
        canvas.height = bitmapH
        // CSS size = taille en PDF points → le wrapper scale(zoom/100) calcule
        // le rendu visuel à partir de cette base, comme avant.
        canvas.style.width  = viewport.width + 'px'
        canvas.style.height = viewport.height + 'px'
        // Lot 7 — imageSmoothing pilote l'upscaling CSS du bitmap quand le
        // wrapper transform: scale(zoom/100) agrandit la page. "pixelated"
        // économise la GPU sur le compositing en preset Performance.
        canvas.style.imageRendering = perfSettings.imageSmoothing ? 'auto' : 'pixelated'
        canvas.getContext('2d').drawImage(off, 0, 0)
      } catch (err) {
        // Cancel volontaire (changement de zoom, démontage) → silence.
        if (cancelled) return
        if (err?.name === 'RenderingCancelledException') return
        if (attempt === 0) {
          if (import.meta.env.DEV) {
            console.warn(`[PdfPage] p${pageNumber} render failed, retry once`, err)
          }
          setTimeout(() => { if (!cancelled) doRender(1) }, 120)
        } else if (import.meta.env.DEV) {
          console.error(`[PdfPage] p${pageNumber} render failed twice, giving up`, err)
        }
      }
    }
    doRender()

    return () => {
      cancelled = true
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
        renderTaskRef.current = null
      }
    }
  }, [pdf, pageNumber, rotation, needsRender, zoomTier, perfSettings.renderQuality, perfSettings.imageSmoothing]) // re-render quand on franchit un palier de zoom OU quand un réglage perf change

  // ── Couche texte (sélection souris + base pour le surlignage recherche) ──
  // On rend nos PROPRES <span> au lieu de passer par pdfjsLib.TextLayer.
  // La classe v5 produisait un léger décalage des spans par rapport au canvas
  // (cumul des erreurs d'arrondi entre --scale-factor, le transform CSS du
  // wrapper, et le bitmap haute-DPI) → cliquer sur le texte raté le span
  // (sélection impossible) et les highlights de recherche tombaient à côté.
  //
  // Algorithme :
  //   1. Pour chaque item de page.getTextContent(), on calcule la matrice
  //      finale via Util.transform(viewport.transform, item.transform).
  //      tx[4]/tx[5] = position en PDF points, hypot(tx[2],tx[3]) = hauteur
  //      de fonte, atan2(tx[1],tx[0]) = angle.
  //   2. On crée un <span> avec font-family système à cette position. Le
  //      texte rendu avec sans-serif n'a PAS la même largeur que les glyphes
  //      PDF originaux → deuxième passe au rAF suivant pour mesurer
  //      offsetWidth (= largeur LAYOUT, indépendante du transform CSS
  //      d'ancestor) et appliquer scaleX(expected/natural). Résultat : la
  //      hitbox du span recouvre EXACTEMENT le texte rasterisé du canvas →
  //      la souris sélectionne juste, et Range.getClientRects renvoie des
  //      rectangles alignés pour le surlignage de recherche.
  //
  // PDF scanné sans couche texte = items vide → aucun span. Pas de
  // sélection mais le texte OCR reste utilisé pour la recherche.
  useEffect(() => {
    if (!pdf) return
    const container = textLayerRef.current
    if (!container) return
    container.innerHTML = ''
    let cancelled = false
    pdf.getPage(pageNumber).then(async (page) => {
      if (cancelled) return
      const viewport = page.getViewport({ scale: 1, rotation })
      container.style.width = `${viewport.width}px`
      container.style.height = `${viewport.height}px`
      try {
        const textContent = await page.getTextContent()
        if (cancelled) return
        const frag = document.createDocumentFragment()
        const items = []
        const itemInfo = []
        for (const item of textContent.items) {
          if (!item.str) continue
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
          const fontHeight = Math.hypot(tx[2], tx[3])
          if (fontHeight < 0.5) continue
          const left = tx[4]
          const top = tx[5] - fontHeight
          const angle = Math.atan2(tx[1], tx[0])
          const span = document.createElement('span')
          span.textContent = item.str
          span.style.left = `${left}px`
          span.style.top = `${top}px`
          span.style.fontSize = `${fontHeight}px`
          span.style.fontFamily = 'sans-serif'
          if (angle !== 0) span.dataset.angle = String(angle)
          if (item.width > 0) span.dataset.expectedWidth = String(item.width)
          frag.appendChild(span)
          items.push(span)
          // Cache pour la recherche : on retient la bbox PDF de chaque item.
          // Les whitespace-only items sont conservés (pour ne pas casser les
          // index inter-items futurs) mais ne matcheront jamais une query.
          if (item.width > 0) {
            itemInfo.push({
              left,
              top,
              width: item.width,
              fontHeight,
              angle,
              str: item.str,
              lower: item.str.toLowerCase(),
            })
          }
        }
        if (cancelled) return
        container.appendChild(frag)
        textItemsRef.current = itemInfo
        // Deuxième passe : ajuste scaleX pour que la largeur rendue avec
        // sans-serif corresponde à item.width (largeur PDF). Sans ça, les
        // espaces inter-mot ne s'alignent pas et les highlights dérivent.
        requestAnimationFrame(() => {
          if (cancelled) return
          for (const span of items) {
            const expected = parseFloat(span.dataset.expectedWidth || '0')
            const angle = parseFloat(span.dataset.angle || '0')
            const naturalW = span.offsetWidth
            const transforms = []
            if (angle !== 0) transforms.push(`rotate(${angle}rad)`)
            if (expected > 0 && naturalW > 0) {
              transforms.push(`scaleX(${expected / naturalW})`)
            }
            if (transforms.length > 0) {
              span.style.transform = transforms.join(' ')
              span.style.transformOrigin = '0 0'
            }
          }
          setTextLayerReady(n => n + 1)
        })
      } catch {}
    })
    return () => { cancelled = true }
  }, [pdf, pageNumber, rotation])

  // ── Surlignage des résultats de recherche ──
  // Approche en deux temps :
  //   1. RATIO : on mesure quelle fraction du span est occupée par le
  //      sous-texte recherché, via le ratio de largeurs de
  //      getBoundingClientRect() sur des sub-ranges. Comme c'est un RATIO,
  //      tous les transforms (scaleX du span + scale du wrapper) s'annulent
  //      automatiquement dans la division → invariant au zoom.
  //   2. POSITIONNEMENT : on traduit la fraction en pixels PDF en utilisant
  //      span.style.left (origine en PDF points) + fraction * expectedWidth
  //      (= largeur PDF originale de l'item, stockée en data-attribute lors
  //      du textLayer effect). Le mark est appendu à l'overlay qui partage
  //      le même système de coords PDF → aligné visuellement avec le canvas.
  //
  // Cette approche évite les pièges des tentatives précédentes :
  //   - Pas d'interpolation linéaire (qui supposait des glyphes uniformes
  //     et échouait sur les polices serif stylisées).
  //   - Pas de soustraction directe r.left - overlayRect.left avec /cssScale
  //     (sensible aux transforms en cascade qui peuvent fausser les coords).
  //
  // La légère imprécision restante : les ratios sont calculés avec les
  // métriques sans-serif, alors que le PDF utilise sa propre fonte. La
  // dérive est bornée à l'intérieur d'UN item et reste typiquement < 5%
  // de la largeur de l'item.
  useEffect(() => {
    const overlay = searchOverlayRef.current
    const textLayer = textLayerRef.current
    if (!overlay || !textLayer) return
    overlay.innerHTML = ''
    const query = (searchQuery || '').toLowerCase()
    if (!query.trim()) return
    const spans = textLayer.querySelectorAll('span')
    spans.forEach(span => {
      const node = span.firstChild
      if (!node || node.nodeType !== Node.TEXT_NODE) return
      const text = node.nodeValue || ''
      const lower = text.toLowerCase()
      if (!text || !lower.includes(query)) return
      const expected = parseFloat(span.dataset.expectedWidth || '0')
      if (expected <= 0) return
      const fontHeight = parseFloat(span.style.fontSize) || 0
      const spanLeft = parseFloat(span.style.left) || 0
      const spanTop = parseFloat(span.style.top) || 0
      const angle = parseFloat(span.dataset.angle || '0')
      // Largeur totale du span en pixels écran (post-tous-transforms).
      const totalScreenW = span.getBoundingClientRect().width
      if (totalScreenW === 0) return
      let from = 0
      while (true) {
        const idx = lower.indexOf(query, from)
        if (idx === -1) break
        try {
          // Sub-range pour le préfixe (0 → idx) et pour le match (idx → idx+len).
          const startRange = document.createRange()
          startRange.setStart(node, 0)
          startRange.setEnd(node, idx)
          const matchRange = document.createRange()
          matchRange.setStart(node, idx)
          matchRange.setEnd(node, idx + query.length)
          // Fractions invariantes au transform (ratios = transforms s'annulent).
          const fracStart = startRange.getBoundingClientRect().width / totalScreenW
          const fracW = matchRange.getBoundingClientRect().width / totalScreenW
          const mark = document.createElement('div')
          mark.className = 'pdf-search-mark'
          mark.style.left = `${spanLeft + fracStart * expected}px`
          mark.style.top = `${spanTop}px`
          mark.style.width = `${fracW * expected}px`
          mark.style.height = `${fontHeight}px`
          if (angle !== 0) {
            mark.style.transform = `rotate(${angle}rad)`
            mark.style.transformOrigin = '0 0'
          }
          overlay.appendChild(mark)
        } catch {}
        from = idx + query.length
      }
    })

    // ── Surlignage des matchs OCR ──
    // Pour chaque mot reconnu par Tesseract dont le texte contient un
    // token de la requête, on dessine un rectangle jaune à sa bbox.
    // Multi-mot (ex. "Jacob Veilleux") : on split la requête sur les
    // espaces et on highlight chaque token indépendamment — simple,
    // robuste, et la répartition spatiale déjà correcte grâce à Tesseract.
    const tokens = query.split(/\s+/).filter(t => t.length > 0)
    let ocrMatchCount = 0
    if (tokens.length > 0 && ocrWordBoxes && ocrWordBoxes.length > 0) {
      for (const w of ocrWordBoxes) {
        const wt = (w.text || '').toLowerCase()
        if (!wt) continue
        // Match si le mot OCR contient l'un des tokens de la requête.
        // Ex: query="jac" matche le mot OCR "Jacob".
        if (!tokens.some(tok => wt.includes(tok))) continue
        const mark = document.createElement('div')
        mark.className = 'pdf-search-mark'
        mark.style.left = `${w.x0}px`
        mark.style.top = `${w.y0}px`
        mark.style.width = `${Math.max(1, w.x1 - w.x0)}px`
        mark.style.height = `${Math.max(1, w.y1 - w.y0)}px`
        overlay.appendChild(mark)
        ocrMatchCount++
      }
    }
  }, [searchQuery, textLayerReady, ocrWordBoxes, pageNumber])

  useEffect(() => {
    if (!wrapperRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry.intersectionRatio > 0.5
        if (isVisible) {
          onVisible(pageNumber)
          // Re-render if coming back into view after being hidden
          if (!wasVisibleRef.current) {
            setNeedsRender(n => n + 1)
          }
        }
        wasVisibleRef.current = isVisible
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-30% 0px -30% 0px' }
    )
    observer.observe(wrapperRef.current)
    return () => observer.disconnect()
  }, [pageNumber, onVisible])

  const scale = zoom / 100
  const localMarqueeStyle = localMarquee ? {
    position: 'absolute',
    left: localMarquee.x,
    top: localMarquee.y,
    width: localMarquee.width,
    height: localMarquee.height,
    border: '1.5px solid var(--accent)',
    background: 'rgba(var(--accent-rgb), 0.12)',
    pointerEvents: 'none',
    zIndex: 60,
    boxSizing: 'border-box',
  } : null

  // Style du cercle d'aperçu — coords PDF points (suit le wrapper transform).
  // Pour la gomme : juste un contour rouge (pas de remplissage) puisqu'elle
  // n'a pas de couleur. Pour crayon/surligneur : disque rempli de la couleur
  // du trait, avec l'opacité correspondante (surligneur ≈ 0.45, crayon ≈ 0.85).
  const cursorPreviewStyle = cursorPreview ? {
    position: 'absolute',
    left: cursorPreview.x - cursorPreview.size / 2,
    top: cursorPreview.y - cursorPreview.size / 2,
    width: cursorPreview.size,
    height: cursorPreview.size,
    borderRadius: '50%',
    background: cursorPreview.isEraser ? 'transparent' : cursorPreview.color,
    border: cursorPreview.isEraser
      ? '2px solid #ef4444'
      : '1px solid rgba(0, 0, 0, 0.35)',
    opacity: cursorPreview.opacity,
    pointerEvents: 'none',
    zIndex: 70,
    boxSizing: 'border-box',
  } : null

  const getCommentAnchorStyle = (comment) => ({
    left: comment.x,
    top: comment.y,
  })


  const handleCanvasMouseDown = (e) => {
    const dc = drawCanvasRef.current
    if (!dc) return
    // Palm rejection (Lot 4) : si un stylet est en train d'écrire, on ignore
    // tous les contacts touch (paume/pouce qui repose sur l'écran) pour ne pas
    // créer de tracés parasites pendant qu'on écrit. stylusActiveRef est
    // piloté par le tracker de pointers au niveau .editor-canvas dans
    // EditorInstance et reste actif 500ms après le lift du stylet pour
    // tolérer les micro-décollements naturels entre traits.
    if (e.pointerType === 'touch' && stylusActiveRef?.current) return
    // Ignore les pointers secondaires (2e doigt d'un pinch) — sinon on
    // poserait un trait parasite pendant un pinch-to-zoom (Lot 4).
    if (e.pointerType === 'touch' && e.isPrimary === false) return
    // Capture le pointer (Lot 4) : tous les pointermove/up de ce pointerId
    // continuent d'être livrés à ce canvas même quand le doigt/stylet sort
    // des bounds du canvas pendant le tracé. Sinon un trait qui dépasse la
    // page se coupe net (le up va à un autre élément).
    if (e.pointerId != null && dc.setPointerCapture) {
      try { dc.setPointerCapture(e.pointerId) } catch (err) {}
    }
    const rect = dc.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top)  / scale

    // ── COMMENTAIRE : note en marge ancrée à un point de la page ──
    if (activeTool === 'comment') {
      e.preventDefault()
      e.stopPropagation()
      onCommentCreate?.({
        id: Date.now(),
        type: 'comment',
        x,
        y,
        text: '',
      })
      return
    }

    // ── RECTSELECT : sélection multiple des annotations (drawings) via marquee ──
    if (activeTool === 'rectselect') {
      e.preventDefault()
      // Ne stoppe pas la propagation : le parent garde son marquee global pour
      // les textboxes, pendant que cette page sélectionne les drawings.
      const startX = x, startY = y
      setLocalMarquee({ x: startX, y: startY, width: 0, height: 0 })
      const onMove = (ev) => {
        const nx = (ev.clientX - rect.left) / scale
        const ny = (ev.clientY - rect.top)  / scale
        setLocalMarquee({
          x: Math.min(startX, nx),
          y: Math.min(startY, ny),
          width: Math.abs(nx - startX),
          height: Math.abs(ny - startY),
        })
      }
      const onUp = (ev) => {
        const nx = (ev.clientX - rect.left) / scale
        const ny = (ev.clientY - rect.top)  / scale
        const box = {
          x: Math.min(startX, nx),
          y: Math.min(startY, ny),
          width: Math.abs(nx - startX),
          height: Math.abs(ny - startY),
        }
        const ids = drawings
          .filter(d => {
            const b = getDrawingBbox(d)
            if (!b || !rectsIntersect(box, b)) return false
            // Permissions : exclus les drawings d'autres users si je n'ai
            // pas editOthers — sinon le marquee les attrape visuellement
            // et le drag du groupe ouvre ReadOnlyBlockedModal après coup.
            // Les legacy sans createdBy passent (considérées comme miennes
            // — le mirror les rétro-attribue à mon id à l'ouverture).
            if (!canEditOthers && d.createdBy && d.createdBy !== currentUserId) return false
            return true
          })
          .map(d => d.id)
        onDrawingMultiSelect?.(ids)
        setLocalMarquee(null)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }

    // ── SELECT : sélection d'une annotation (crayon, surlign., forme, image) ──
    if (activeTool === 'select') {
      const commentHit = drawings.find(d => d.type === 'comment' && Math.hypot((d.x || 0) - x, (d.y || 0) - y) <= 14)
      if (commentHit) {
        e.preventDefault()
        e.stopPropagation()
        onCommentSelect?.(commentHit.id)
        return
      }
      const hit = findDrawingAt(drawings.filter(d => d.type !== 'comment'), x, y, 8)
      if (!hit) return
      e.preventDefault()
      e.stopPropagation()
      onDrawingSelect?.(hit.id)

      // Drag direct depuis l'encre/la forme elle-même (pas seulement depuis le
      // rectangle vert déjà sélectionné). C'est le chemin que l'utilisateur
      // utilise naturellement : clic + drag sur l'annotation.
      onDrawingDragStart?.(hit.id)
      let lastX = e.clientX, lastY = e.clientY
      let finalX = e.clientX, finalY = e.clientY
      let dragOffsetY = 0
      const hitBox = getDrawingBbox(hit)
      const hitVisH = Math.max(hitBox?.height || 12, 12)
      const autoScroll = startEdgeAutoScroll((dyPdf) => {
        dragOffsetY += dyPdf
        onDrawingMove?.(hit.id, 0, dyPdf)
      })
      autoScroll.update(e)
      const updatePageEdgeAutoScroll = () => {
        if (!hitBox) return
        const top = hitBox.y + dragOffsetY
        const bottom = hitBox.y + hitVisH + dragOffsetY
        autoScroll.setForcedDir(bottom > pageHeight - 36 ? 1 : (top < 36 ? -1 : 0))
      }
      updatePageEdgeAutoScroll()
      const onMove = (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        autoScroll.update(ev)
        const dx = (ev.clientX - lastX) / scale
        const dy = (ev.clientY - lastY) / scale
        dragOffsetY += dy
        updatePageEdgeAutoScroll()
        lastX = ev.clientX; lastY = ev.clientY
        finalX = ev.clientX; finalY = ev.clientY
        onDrawingMove?.(hit.id, dx, dy)
      }
      const onUp = (ev) => {
        autoScroll.stop()
        if (ev?.pointerId != null && dc.releasePointerCapture) {
          try { dc.releasePointerCapture(ev.pointerId) } catch (err) {}
        }
        onDrawingDrop?.(hit.id, finalX, finalY)
        onDrawingDragEnd?.(hit.id)
        document.removeEventListener('pointermove', onMove, true)
        document.removeEventListener('pointerup', onUp, true)
        document.removeEventListener('pointercancel', onUp, true)
      }
      document.addEventListener('pointermove', onMove, true)
      document.addEventListener('pointerup', onUp, true)
      document.addEventListener('pointercancel', onUp, true)
      return
    }

    // ── CRAYON / SURLIGNEUR ── même logique, seul le type + settings changent
    if (activeTool === 'pencil' || activeTool === 'highlight') {
      e.preventDefault()
      e.stopPropagation()
      const isHL = activeTool === 'highlight'
      const settings = isHL ? highlightSettings : pencilSettings
      const strokeType = isHL ? 'highlight' : 'drawing'
      // Modulation par la pression du stylet (Lot 4) : e.pressure va de 0 à 1.
      // Effet « calligraphie » naturel — un stylet appuyé fort dessine plus
      // épais. Limité au crayon (pas au surligneur, qui doit garder une
      // largeur stable et prévisible). Pour la souris/doigt (pointerType !==
      // 'pen'), on garde la taille nominale settings.size — sinon les deux
      // apparaîtraient identiques au stylet sans pression (e.pressure = 0.5
      // par défaut). Clamp à 0.3× mini pour qu'un effleurement très léger
      // reste visible.
      const pressureMul = (!isHL && e.pointerType === 'pen' && e.pressure > 0)
        ? Math.max(0.3, e.pressure * 1.5)
        : 1
      const strokeSize = settings.size * pressureMul
      isDrawingRef.current = true
      currentPointsRef.current = [{ x, y }]
      const live = () => ({
        points: currentPointsRef.current,
        color: settings.color,
        size: strokeSize,
        type: strokeType,
      })
      redrawOverlay(live())
      const onMove = (e) => {
        if (!isDrawingRef.current) return
        const nx = (e.clientX - rect.left) / scale
        const ny = (e.clientY - rect.top)  / scale
        currentPointsRef.current.push({ x: nx, y: ny })
        redrawOverlay(live())
      }
      const onUp = () => {
        isDrawingRef.current = false
        if (currentPointsRef.current.length > 1 && onDrawingComplete) {
          onDrawingComplete({
            id: Date.now(),
            type: strokeType,
            points: [...currentPointsRef.current],
            color: settings.color,
            size: strokeSize,
          })
        }
        currentPointsRef.current = []
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }

    // ── FORMES ──
    if (activeTool === 'shapes') {
      e.preventDefault()
      e.stopPropagation()
      isDrawingRef.current = true
      const startX = x, startY = y
      let curX = x, curY = y
      const buildShape = () => {
        const isLine = shapeSettings.shape === 'line'
        return {
          type: 'shape',
          shape: shapeSettings.shape,
          x: isLine ? startX : Math.min(startX, curX),
          y: isLine ? startY : Math.min(startY, curY),
          width:  isLine ? (curX - startX) : Math.abs(curX - startX),
          height: isLine ? (curY - startY) : Math.abs(curY - startY),
          color: shapeSettings.color,
          size: shapeSettings.size,
        }
      }
      redrawOverlay(buildShape())
      const onMove = (e) => {
        if (!isDrawingRef.current) return
        curX = (e.clientX - rect.left) / scale
        curY = (e.clientY - rect.top)  / scale
        redrawOverlay(buildShape())
      }
      const onUp = () => {
        isDrawingRef.current = false
        const sh = buildShape()
        if ((Math.abs(sh.width) >= 3 || Math.abs(sh.height) >= 3) && onDrawingComplete) {
          onDrawingComplete({ id: Date.now(), ...sh })
        }
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }

    // ── EFFACE ──
    if (activeTool === 'eraser') {
      e.preventDefault()
      e.stopPropagation()

      // Mode ÉLÉMENT : clic → supprime textbox OU dessin entier
      if (eraserSettings.mode === 'element') {
        const tb = findTextboxAt(textBoxes, x, y, pageHeight)
        if (tb) { onDelete?.(tb.id); return }
        const d = findDrawingAt(drawings, x, y, 8)
        if (d) onDrawingDelete?.(d.id)
        return
      }

      // Mode BLOC : clic → supprime UN tracé entier
      if (eraserSettings.mode === 'block') {
        const d = findDrawingAt(drawings, x, y, 8)
        if (d) onDrawingDelete?.(d.id)
        return
      }

      // Mode MAIN LIBRE : drag → efface les pixels au passage
      if (eraserSettings.mode === 'free') {
        isDrawingRef.current = true
        const r = (eraserSettings.size || 20) / 2
        onDrawingsErase?.(x, y, r)
        const onMove = (e) => {
          if (!isDrawingRef.current) return
          const nx = (e.clientX - rect.left) / scale
          const ny = (e.clientY - rect.top)  / scale
          onDrawingsErase?.(nx, ny, r)
        }
        const onUp = () => {
          isDrawingRef.current = false
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        return
      }
    }
  }

  const startEdgeAutoScroll = () => {
    // Désactivé pour garder le drag d'annotations page-en-page parfaitement
    // fluide. Les essais d'auto-scroll forçaient des micro-déplacements en Y
    // pendant le drag et rendaient le passage entre pages saccadé.
    window.__jacpdfAnnotationDragClientY = null
    window.__jacpdfAnnotationDragPageEdgeDirection = 0
    return {
      update() {},
      setForcedDir() {},
      stop() {
        window.__jacpdfAnnotationDragClientY = null
        window.__jacpdfAnnotationDragPageEdgeDirection = 0
      },
    }
  }

  // Curseur 'pointer' au survol d'une annotation en mode select +
  // mise à jour de l'aperçu de taille du trait pour crayon/surligneur/efface.
  const handleCanvasMouseMove = (e) => {
    const dc = drawCanvasRef.current
    if (!dc) return
    const rect = dc.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top)  / scale

    // Aperçu de taille — coords PDF points, le wrapper scale s'occupe du zoom.
    // Lot 7 — étape F : drawingPreviewCursor=false coupe complètement
    // l'aperçu (preset Performance) → pas de re-render à chaque pointermove.
    if (!perfSettings.drawingPreviewCursor) {
      if (cursorPreview) setCursorPreview(null)
    } else if (activeTool === 'pencil') {
      setCursorPreview({ x, y, size: pencilSettings.size, color: pencilSettings.color, opacity: 0.85, isEraser: false })
    } else if (activeTool === 'highlight') {
      setCursorPreview({ x, y, size: highlightSettings.size, color: highlightSettings.color, opacity: 0.45, isEraser: false })
    } else if (activeTool === 'eraser' && eraserSettings.mode === 'free') {
      setCursorPreview({ x, y, size: eraserSettings.size || 20, color: '#ffffff', opacity: 0.6, isEraser: true })
    } else if (cursorPreview) {
      setCursorPreview(null)
    }

    if (activeTool !== 'select') return
    const commentHit = drawings.find(d => d.type === 'comment' && Math.hypot((d.x || 0) - x, (d.y || 0) - y) <= 14)
    const hit = commentHit || findDrawingAt(drawings.filter(d => d.type !== 'comment'), x, y, 8)
    dc.style.cursor = hit ? 'pointer' : 'default'
  }

  return (
    // Outer div reserves the scaled space in the layout.
    // overflow:hidden — clippe TOUT enfant qui déborderait visuellement la
    // page (textbox legacy mal positionnée, drawing légèrement hors-bornes,
    // etc.). Sans ça, ces enfants étendaient la zone hit-testable du wrapper
    // et la taille de contenu de .editor-canvas → le user pouvait :
    //   1. Cliquer dans le « noir » à droite de la page et tomber sur un
    //      descendant absolument-positionné du wrapper → closest('.editor-page-
    //      wrapper') matchait → création parasite de textbox.
    //   2. Scroller horizontalement dans le canvas bien au-delà des bornes de
    //      la page (faux espace vide à droite).
    // Avec overflow:hidden, les enfants déplacés sont invisibles ET non-
    // hit-testés en dehors des bornes du div externe → les deux problèmes
    // disparaissent au niveau CSS, indépendamment de toute logique JS.
    // Le DragPreviewLayer (sibling au niveau .editor-canvas) n'est pas
    // affecté, donc le drag cross-page reste fluide.
    <div style={ { width: pageWidth * scale, height: pageHeight * scale, flexShrink: 0, marginBottom: 16, overflow: (draggingDrawingId != null && drawings.some(d => d.id === draggingDrawingId)) ? 'visible' : 'hidden' } }>
      {/* Inner wrapper scales visually via CSS transform */}
      <div
        className="editor-page-wrapper"
        ref={wrapperRef}
        style={{
          position: 'relative',
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          // Monte le wrapper quand :
          //  - une textbox de cette page est sélectionnée (drag cross-page d'une textbox), OU
          //  - une annotation (dessin/forme/image/surlignage) de cette page est EN TRAIN
          //    d'être draggée — pour qu'elle reste visible au-dessus du wrapper de la
          //    page voisine pendant le drag cross-page (sinon elle passe dessous et ne
          //    réapparaît qu'au drop).
          // On n'élève PAS sur la simple sélection (selectedDrawingId) sinon ça fait
          // réapparaître des textboxes cachées ailleurs (bug "texte de nulle part") —
          // on utilise draggingDrawingId, actif uniquement pendant le drag.
          zIndex: (
            textBoxes.some(b => b.id === selectedBox || selectedBoxes.includes(b.id)) ||
            (draggingDrawingId != null && drawings.some(d => d.id === draggingDrawingId))
          ) ? 5 : 'auto',
        }}
      >
        <canvas ref={canvasRef} />
        {/* Surlignage des résultats de recherche — divs absolument positionnés
            sous la couche d'encre (drawCanvas) pour que les annotations
            recouvrent les highlights jaunes là où elles passent. */}
        <div className="pdf-search-overlay" ref={searchOverlayRef} />
        {/* Drawing overlay canvas */}
        <canvas
          ref={drawCanvasRef}
          style={ { position: 'absolute', top: 0, left: 0, pointerEvents: 'none', cursor: 'default' } }
          onPointerDown={handleCanvasMouseDown}
          onPointerMove={handleCanvasMouseMove}
          onPointerLeave={() => setCursorPreview(null)}
          onContextMenu={(e) => e.preventDefault()}
        />
        {/* Aperçu du curseur — cercle de la taille du trait centré sur le
            pointeur. Affiché uniquement pour crayon/surligneur/efface (free).
            Naturellement scalé par le wrapper transform: scale(zoom/100). */}
        {cursorPreview && <div style={cursorPreviewStyle} />}
        {/* Couche texte pdf.js — spans transparents au-dessus des annotations
            pour que la sélection souris reste possible. Les spans n'occupent
            que les zones de texte (le reste tombe à travers vers drawCanvas
            pour les outils de dessin / sélection d'annotation). */}
        <div className="pdf-text-layer" ref={textLayerRef} />
        {drawings.filter(d => d.type === 'comment').map(comment => (
          <button
            key={`comment-${comment.id}`}
            type="button"
            className={`pdf-comment-anchor ${selectedCommentId === comment.id ? 'active' : ''}`}
            style={getCommentAnchorStyle(comment)}
            title={comment.text?.trim() || 'Commentaire'}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onCommentSelect?.(comment.id)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
            </svg>
          </button>
        ))}
        {textBoxes.map(box => {
          // At scale 1, PDF points = screen px — no zoom math needed
          const left = box.pdfX
          const top  = box.pagePdfHeight - box.pdfY
          return (
            <TextBox
              key={box.id}
              {...box}
              x={left}
              y={top}
              selected={selectedBox === box.id}
              inSelection={selectedBoxes.includes(box.id)}
              selectedBoxes={selectedBoxes}
              onSelect={onSelect}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onDrop={onTextBoxDrop}
              onGroupDrag={onGroupDrag}
              zoom={zoom}
              // pagePdfWidth/Height : on PRÉFÈRE box.pagePdfWidth (qui
              // est mis à la VRAIE dimension de la page à la création
              // par useTextBoxes.createTextBox depuis pageSizes), et on
              // tombe sur le prop pageWidth de PdfPage (qui défaut à 612)
              // SEULEMENT pour les textboxes legacy qui n'auraient pas
              // le champ. ⚠️ Surtout ne pas écraser inconditionnellement
              // avec pageWidth : si le PDF n'est pas en format Letter US
              // (A4 = 595, A3, format custom plus large/étroit), 612 est
              // faux → maxAllowedW = 612 - x cap la box BIEN AVANT le vrai
              // bord du PDF → wrap prématuré. {...box} fournit déjà
              // box.pagePdfWidth dans la majorité des cas mais on l'expli-
              // cite ici pour la clarté du fallback.
              pagePdfWidth={box.pagePdfWidth ?? pageWidth}
              pagePdfHeight={box.pagePdfHeight ?? pageHeight}
              readOnly={readOnly}
            />
          )
        })}
        {selectedDrawingIds.map(id => {
          const d = drawings.find(x => x.id === id)
          const b = getDrawingBbox(d)
          if (!b) return null
          const MIN_VIS = 12
          const style = {
            position: 'absolute',
            left: b.x,
            top: b.y,
            width: Math.max(b.width, MIN_VIS),
            height: Math.max(b.height, MIN_VIS),
            border: '2px dashed var(--accent)',
            borderRadius: '4px',
            cursor: 'move',
            zIndex: 20,
            boxSizing: 'border-box',
            background: 'rgba(var(--accent-rgb), 0.04)',
          }
          return (
            <div
              key={`drawing-group-${id}`}
              style={style}
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const dragTarget = e.currentTarget
                if (e.pointerId != null && dragTarget.setPointerCapture) {
                  try { dragTarget.setPointerCapture(e.pointerId) } catch (err) {}
                }
                onDrawingDragStart?.(id)
                let lastX = e.clientX, lastY = e.clientY
                let finalX = e.clientX, finalY = e.clientY
                const ids = [...selectedDrawingIds]
                let dragOffsetY = 0
                const autoScroll = startEdgeAutoScroll((dyPdf) => {
                  dragOffsetY += dyPdf
                  onDrawingGroupMove?.(ids, 0, dyPdf)
                })
                autoScroll.update(e)
                const updatePageEdgeAutoScroll = () => {
                  const top = b.y + dragOffsetY
                  const bottom = b.y + Math.max(b.height, MIN_VIS) + dragOffsetY
                  autoScroll.setForcedDir(bottom > pageHeight - 36 ? 1 : (top < 36 ? -1 : 0))
                }
                updatePageEdgeAutoScroll()
                const onMove = (ev) => {
                  ev.preventDefault()
                  ev.stopPropagation()
                  autoScroll.update(ev)
                  const dx = (ev.clientX - lastX) / scale
                  const dy = (ev.clientY - lastY) / scale
                  dragOffsetY += dy
                  updatePageEdgeAutoScroll()
                  lastX = ev.clientX; lastY = ev.clientY
                  finalX = ev.clientX; finalY = ev.clientY
                  onDrawingGroupMove?.(ids, dx, dy)
                }
                const onUp = (ev) => {
                  autoScroll.stop()
                  if (ev?.pointerId != null && dragTarget.releasePointerCapture) {
                    try { dragTarget.releasePointerCapture(ev.pointerId) } catch (err) {}
                  }
                  onDrawingGroupDrop?.(ids, finalX, finalY)
                  onDrawingDragEnd?.(id)
                  document.removeEventListener('pointermove', onMove, true)
                  document.removeEventListener('pointerup', onUp, true)
                  document.removeEventListener('pointercancel', onUp, true)
                }
                document.addEventListener('pointermove', onMove, true)
                document.addEventListener('pointerup', onUp, true)
                document.addEventListener('pointercancel', onUp, true)
              }}
            />
          )
        })}
        {localMarquee && (
          <div style={localMarqueeStyle} />
        )}
        {/* Rectangle de sélection style Kami — entoure l'annotation sélectionnée */}
        {(() => {
          if (selectedDrawingIds.length > 0) return null
          const sel = drawings.find(d => d.id === selectedDrawingId && d.type !== 'comment')
          if (!sel) return null
          // Geometry bbox (SANS padding) — c'est la coordonnée logique utilisée pour le resize
          let bx, by, bw, bh
          if (sel.type === 'image') {
            bx = sel.x; by = sel.y; bw = sel.width; bh = sel.height
          } else if (sel.type === 'shape') {
            if (sel.shape === 'line') {
              const x1 = sel.x, y1 = sel.y, x2 = sel.x + sel.width, y2 = sel.y + sel.height
              bx = Math.min(x1, x2); by = Math.min(y1, y2)
              bw = Math.abs(sel.width); bh = Math.abs(sel.height)
            } else {
              bx = sel.x; by = sel.y; bw = sel.width; bh = sel.height
            }
          } else if ((sel.type === 'drawing' || sel.type === 'highlight') && sel.points?.length) {
            const xs = sel.points.map(p => p.x), ys = sel.points.map(p => p.y)
            const minX = Math.min(...xs), minY = Math.min(...ys)
            const maxX = Math.max(...xs), maxY = Math.max(...ys)
            bx = minX; by = minY
            bw = maxX - minX; bh = maxY - minY
          } else {
            return null
          }
          const MIN_VIS = 12
          const visW = Math.max(bw, MIN_VIS)
          const visH = Math.max(bh, MIN_VIS)
          const selBoxStyle = {
            position: 'absolute',
            left: bx,
            top: by,
            width: visW,
            height: visH,
            border: '2px dashed var(--accent)',
            borderRadius: '4px',
            cursor: 'move',
            zIndex: 20,
            boxSizing: 'border-box',
            background: 'rgba(var(--accent-rgb), 0.05)',
          }
          const xBtnStyle = {
            position: 'absolute',
            top: -12,
            right: -12,
            width: 24,
            height: 24,
            border: 'none',
            borderRadius: '50%',
            background: 'var(--accent)',
            color: '#000',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            zIndex: 22,
          }
          // 8 poignées de redimensionnement
          const HS = 10
          const posOf = (v, total) => v === 's' ? -HS/2 : v === 'e' ? total - HS/2 : total/2 - HS/2
          const handles = [
            { k: 'nw', top: 's', left: 's', cursor: 'nwse-resize', mx: true,  my: true,  sx: -1, sy: -1 },
            { k: 'n',  top: 's', left: 'm', cursor: 'ns-resize',   mx: false, my: true,  sx:  0, sy: -1 },
            { k: 'ne', top: 's', left: 'e', cursor: 'nesw-resize', mx: true,  my: true,  sx:  1, sy: -1 },
            { k: 'e',  top: 'm', left: 'e', cursor: 'ew-resize',   mx: true,  my: false, sx:  1, sy:  0 },
            { k: 'se', top: 'e', left: 'e', cursor: 'nwse-resize', mx: true,  my: true,  sx:  1, sy:  1 },
            { k: 's',  top: 'e', left: 'm', cursor: 'ns-resize',   mx: false, my: true,  sx:  0, sy:  1 },
            { k: 'sw', top: 'e', left: 's', cursor: 'nesw-resize', mx: true,  my: true,  sx: -1, sy:  1 },
            { k: 'w',  top: 'm', left: 's', cursor: 'ew-resize',   mx: true,  my: false, sx: -1, sy:  0 },
          ]
          const startResize = (e, h) => {
            e.preventDefault()
            e.stopPropagation()
            const oldB = { x: bx, y: by, width: bw, height: bh }
            const sCX = e.clientX, sCY = e.clientY
            const onMove = (ev) => {
              const dX = (ev.clientX - sCX) / scale
              const dY = (ev.clientY - sCY) / scale
              let nx = oldB.x, ny = oldB.y, nw = oldB.width, nh = oldB.height
              if (h.mx) {
                if (h.sx > 0) nw = Math.max(5, oldB.width + dX)
                else { nw = Math.max(5, oldB.width - dX); nx = oldB.x + (oldB.width - nw) }
              }
              if (h.my) {
                if (h.sy > 0) nh = Math.max(5, oldB.height + dY)
                else { nh = Math.max(5, oldB.height - dY); ny = oldB.y + (oldB.height - nh) }
              }
              onDrawingResize?.(sel.id, { x: nx, y: ny, width: nw, height: nh }, oldB)
            }
            const onUp = () => {
              window.removeEventListener('pointermove', onMove)
              window.removeEventListener('pointerup', onUp)
            }
            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
          }
          return (
            <div
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const dragTarget = e.currentTarget
                if (e.pointerId != null && dragTarget.setPointerCapture) {
                  try { dragTarget.setPointerCapture(e.pointerId) } catch (err) {}
                }
                // Signal de début de drag → le parent élève le z-index du wrapper
                // pour que l'annotation reste visible au-dessus des pages voisines
                // pendant un drag cross-page.
                onDrawingDragStart?.(sel.id)
                let lastX = e.clientX, lastY = e.clientY
                let finalX = e.clientX, finalY = e.clientY
                let dragOffsetY = 0
                const autoScroll = startEdgeAutoScroll((dyPdf) => {
                  dragOffsetY += dyPdf
                  onDrawingMove?.(sel.id, 0, dyPdf)
                })
                autoScroll.update(e)
                const updatePageEdgeAutoScroll = () => {
                  const top = by + dragOffsetY
                  const bottom = by + visH + dragOffsetY
                  autoScroll.setForcedDir(bottom > pageHeight - 36 ? 1 : (top < 36 ? -1 : 0))
                }
                updatePageEdgeAutoScroll()
                const onMove = (ev) => {
                  ev.preventDefault()
                  ev.stopPropagation()
                  autoScroll.update(ev)
                  const dx = (ev.clientX - lastX) / scale
                  const dy = (ev.clientY - lastY) / scale
                  dragOffsetY += dy
                  updatePageEdgeAutoScroll()
                  lastX = ev.clientX; lastY = ev.clientY
                  finalX = ev.clientX; finalY = ev.clientY
                  onDrawingMove?.(sel.id, dx, dy)
                }
                const onUp = (ev) => {
                  autoScroll.stop()
                  if (ev?.pointerId != null && dragTarget.releasePointerCapture) {
                    try { dragTarget.releasePointerCapture(ev.pointerId) } catch (err) {}
                  }
                  onDrawingDrop?.(sel.id, finalX, finalY)
                  onDrawingDragEnd?.(sel.id)
                  document.removeEventListener('pointermove', onMove, true)
                  document.removeEventListener('pointerup', onUp, true)
                  document.removeEventListener('pointercancel', onUp, true)
                }
                document.addEventListener('pointermove', onMove, true)
                document.addEventListener('pointerup', onUp, true)
                document.addEventListener('pointercancel', onUp, true)
              }}
              onClick={(e) => e.stopPropagation()}
              style={selBoxStyle}
            >
              <button
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onDrawingDelete?.(sel.id)
                }}
                onClick={(e) => e.stopPropagation()}
                title="Supprimer"
                style={xBtnStyle}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              {sel.type !== 'drawing' && sel.type !== 'highlight' && handles.map(h => {
                const hStyle = {
                  position: 'absolute',
                  top: posOf(h.top, visH),
                  left: posOf(h.left, visW),
                  width: HS,
                  height: HS,
                  background: 'var(--accent)',
                  border: '1.5px solid #0a0e1a',
                  borderRadius: '2px',
                  cursor: h.cursor,
                  zIndex: 21,
                  boxSizing: 'border-box',
                }
                return (
                  <div
                    key={h.k}
                    onPointerDown={(e) => startResize(e, h)}
                    onClick={(e) => e.stopPropagation()}
                    style={hStyle}
                  />
                )
              })}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// Lot 7 — React.memo évite de re-rendre une page quand le viewport bouge
// (virtualisation étape B) mais que ses props n'ont pas changé. Comparateur
// custom : on ignore VOLONTAIREMENT les callbacks (onDrawingComplete, etc.)
// car EditorInstance les recrée en inline-arrow à chaque render — leur
// référence change mais elles ferment sur des setters stables, donc on
// peut sans risque les considérer « égales » pour la décision de re-render.
// Sans cette astuce, memo serait inutile (toujours une callback recréée).
function pdfPagePropsAreEqual(prev, next) {
  const keys = [
    'pdf', 'pageNumber', 'zoom', 'rotation', 'pageWidth', 'pageHeight',
    'textBoxes', 'drawings', 'searchQuery', 'ocrWordBoxes',
    'activeTool', 'pencilSettings', 'highlightSettings', 'eraserSettings', 'shapeSettings',
    'selectedDrawingId', 'selectedDrawingIds', 'selectedCommentId',
    'selectedBox', 'selectedBoxes', 'draggingDrawingId',
    'currentUserId', 'canEditOthers', 'readOnly',
  ]
  for (const k of keys) {
    if (prev[k] !== next[k]) return false
  }
  return true
}
export default memo(PdfPage, pdfPagePropsAreEqual)