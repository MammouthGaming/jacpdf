import { useState, useEffect, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { usePerformanceSettings } from "@/shared/hooks/system/usePerformanceSettings"
import { performanceStore } from "@/shared/stores/system/performanceStore"
import { toastStore } from "@/shared/stores/ui//toastStore"

// ── OCR (reconnaissance de texte HAUTE QUALITÉ) ──
// Pipeline en 3 étapes pour viser une reconnaissance ~parfaite :
//
//   1. Rendu haute résolution (3× = ~216 dpi pour un A4, ~300 dpi étant la
//      densité optimale pour Tesseract). Avant on rendait à 2× → l'OCR
//      ratait les petits caractères. Le fond est forcé en blanc avant
//      rendu pour les PDFs à fond transparent (sinon Tesseract lit
//      du noir-sur-noir).
//
//   2. Pré-traitement par binarisation d'Otsu. On convertit en niveaux
//      de gris (luminance sRGB), on calcule le seuil qui maximise la
//      variance inter-classes, puis on applique → image pure noir-blanc.
//      Tesseract est entraîné sur des images binaires propres ; sur
//      scans tachés/jaunis ça enlève ~30% des erreurs.
//
//   3. Tesseract OEM LSTM_ONLY + PSM AUTO_OSD, modèles fra + eng.
//      annotationMode ENABLE_FORMS pour inclure les widgets AcroForm.
//
// On ne SKIP PAS l'OCR sur les pages avec texte natif : l'utilisateur
// lance l'OCR explicitement, donc on tourne sur toutes les pages (utile
// pour les titres vectorisés, polices stylisées, et champs de formulaire
// que la couche texte native rate).
export function usePdfOcr({ pdf }) {
  // Réglages de performance (Lot 7) — ocrQualityScale pilote la résolution
  // de rendu canvas avant Tesseract. Beauté/Équilibré = 3× (~216 dpi pour A4,
  // = comportement historique), Performance = 1.5× (plus rapide, légèrement
  // moins précis sur les petits caractères).
  const settings = usePerformanceSettings()

  // Lot 7 — étape E. Tracks if the component is still mounted. Plusieurs
  // callbacks asynchrones (logger Tesseract, setTimeout de fin/échec OCR, et
  // le for-loop async des pages) peuvent firer après démontage si l'utilisateur
  // ferme l'onglet en plein OCR. Sans ce flag → React warning "setState on
  // unmounted component" + travail OCR inutile sur des données qui ne seront
  // jamais consommées.
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const [ocrText, setOcrText] = useState({})
  // Bounding boxes des mots reconnus par Tesseract, en PDF points.
  // Sert au surlignage des résultats de recherche pour le texte OCR.
  const [ocrWordBoxes, setOcrWordBoxes] = useState({})
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrProgress, setOcrProgress] = useState({ page: 0, total: 0, status: '' })

  // ── Détection auto des PDFs scannés (Lot 7) ──
  // Échantillonne les 3 premières pages : si le textContent natif est quasi-vide
  // (< 30 caractères/page en moyenne), c'est probablement un scan → on suggère
  // l'OCR via toast. Activé/désactivé par settings.autoOcrScannedPdfs (défaut on).
  // On dédup par fingerprint pdf.js pour ne pas re-toaster sur re-mount du même fichier.
  const detectedFpRef = useRef(new Set())
  useEffect(() => {
    if (!pdf || !settings.autoOcrScannedPdfs) return
    const fp = pdf.fingerprints?.[0] || pdf.fingerprint
    if (!fp || detectedFpRef.current.has(fp)) return
    let cancelled = false
    ;(async () => {
      try {
        const sampleCount = Math.min(3, pdf.numPages)
        let totalChars = 0
        for (let p = 1; p <= sampleCount; p++) {
          if (cancelled) return
          const page = await pdf.getPage(p)
          const tc = await page.getTextContent()
          totalChars += (tc.items || []).reduce((sum, it) => sum + (it.str?.length || 0), 0)
        }
        if (cancelled) return
        // Mémorise le fingerprint qu'on ait détecté un scan ou non — évite de
        // re-tester le même PDF si l'utilisateur ferme/rouvre l'onglet dans la session.
        detectedFpRef.current.add(fp)
        const avgChars = totalChars / sampleCount
        if (avgChars < 30) {
          // Petit délai pour laisser ToastHost se stabiliser après chargement
          // d'un nouveau fichier (le pdf vient juste de finir de charger).
          setTimeout(() => {
            if (cancelled) return
            toastStore.success(
              '📄 Ce PDF semble scanné — lance l\'OCR via Outils → Reconnaissance de texte pour rendre le contenu cherchable',
              {
                duration: 7000,
                action: {
                  label: 'Ne plus suggérer',
                  onClick: () => {
                    // Pose un override sur le réglage de preset → bascule
                    // automatiquement le store en 'custom' (cf. performanceStore.setOverride).
                    // L'utilisateur peut toujours le réactiver depuis
                    // Paramètres → Performance → « OCR auto sur PDFs scannés ».
                    performanceStore.setOverride('autoOcrScannedPdfs', false)
                    toastStore.info('Suggestion OCR désactivée. Réactivable dans Paramètres → Performance.')
                  },
                },
              },
            )
          }, 600)
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [pdf, settings.autoOcrScannedPdfs])

  const runOcr = async () => {
    if (!pdf || ocrRunning) return
    setOcrRunning(true)
    setOcrProgress({ page: 0, total: pdf.numPages, status: 'Initialisation…' })
    let worker
    try {
      const tess = await import('tesseract.js')
      const { createWorker, PSM, OEM } = tess
      worker = await createWorker(['fra', 'eng'], OEM?.LSTM_ONLY ?? 1, {
        logger: (m) => {
          if (!mountedRef.current) return
          if (m.status === 'recognizing text') {
            setOcrProgress(prev => ({ ...prev, status: `Reconnaissance ${Math.round((m.progress || 0) * 100)}%` }))
          } else if (m.status === 'loading language traineddata' || m.status === 'initializing api') {
            setOcrProgress(prev => ({ ...prev, status: 'Chargement du moteur…' }))
          }
        },
      })
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: String(PSM?.AUTO_OSD ?? 1),
          preserve_interword_spaces: '1',
        })
      } catch {}
      const result = {}
      const boxesResult = {}
      // Échelle de rendu OCR — pilotée par le store de performance (Lot 7).
      // Défaut 3× = ~216 dpi pour A4 (proche de l'optimal 300 dpi de Tesseract).
      const RENDER_SCALE = settings.ocrQualityScale ?? 3
      // Lot 7 — canvas recyclé entre les pages : un seul élément + contexte
      // réutilisé. Assigner canvas.width / canvas.height clear et redimensionne
      // le bitmap. À scale 3 sur A4 ce sont ~17 Mo de pixels qui ne sont plus
      // ré-alloués 200 fois pour un PDF de 200 pages — le GC souffle.
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      for (let p = 1; p <= pdf.numPages; p++) {
        // Lot 7 — étape E. Bail si l'utilisateur a fermé l'onglet en plein OCR.
        if (!mountedRef.current) break
        setOcrProgress({ page: p, total: pdf.numPages, status: `Page ${p} / ${pdf.numPages}` })
        const page = await pdf.getPage(p)
        const viewport = page.getViewport({ scale: RENDER_SCALE })
        canvas.width = viewport.width
        canvas.height = viewport.height
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({
          canvasContext: ctx,
          viewport,
          background: 'white',
          annotationMode: pdfjsLib.AnnotationMode?.ENABLE_FORMS ?? 2,
        }).promise
        // Binarisation d'Otsu → noir-blanc pur.
        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const data = imgData.data
          const hist = new Array(256).fill(0)
          const gray = new Uint8ClampedArray(data.length / 4)
          for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            const g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0
            gray[j] = g
            hist[g]++
          }
          const total = gray.length
          let sumAll = 0
          for (let i = 0; i < 256; i++) sumAll += i * hist[i]
          let sumB = 0, wB = 0, varMax = 0, threshold = 128
          for (let t = 0; t < 256; t++) {
            wB += hist[t]
            if (wB === 0) continue
            const wF = total - wB
            if (wF === 0) break
            sumB += t * hist[t]
            const mB = sumB / wB
            const mF = (sumAll - sumB) / wF
            const v = wB * wF * (mB - mF) * (mB - mF)
            if (v > varMax) { varMax = v; threshold = t }
          }
          for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            const v = gray[j] >= threshold ? 255 : 0
            data[i] = data[i + 1] = data[i + 2] = v
            data[i + 3] = 255
          }
          ctx.putImageData(imgData, 0, 0)
        } catch {}
        const { data: rec } = await worker.recognize(
          canvas,
          {},
          { text: true, blocks: true }
        )
        result[p] = rec?.text || ''
        // Capture les bboxes au niveau MOT pour le surlignage. v5.x niche
        // les mots dans blocks → paragraphs → lines → words ; on aplatit.
        const flatWords = []
        if (Array.isArray(rec?.data?.words) && rec.data.words.length > 0) {
          flatWords.push(...rec.data.words)
        } else if (Array.isArray(rec?.data?.blocks)) {
          for (const blk of rec.data.blocks) {
            for (const para of blk?.paragraphs || []) {
              for (const line of para?.lines || []) {
                for (const w of line?.words || []) flatWords.push(w)
              }
            }
          }
        }
        const wordBoxes = flatWords.map(w => ({
          text: w.text || '',
          x0: (w.bbox?.x0 ?? 0) / RENDER_SCALE,
          y0: (w.bbox?.y0 ?? 0) / RENDER_SCALE,
          x1: (w.bbox?.x1 ?? 0) / RENDER_SCALE,
          y1: (w.bbox?.y1 ?? 0) / RENDER_SCALE,
        }))
        boxesResult[p] = wordBoxes
      }
      // Lot 7 — libère le bitmap final du canvas recyclé avant que le GC s'en occupe.
      canvas.width = 0
      canvas.height = 0
      // Lot 7 — étape E. Si le composant a été démonté mid-OCR, on jette le
      // résultat et on ne touche pas au state. Le worker est terminé dans le
      // finally ci-dessous quoi qu'il arrive.
      if (!mountedRef.current) return
      setOcrText(prev => ({ ...prev, ...result }))
      setOcrWordBoxes(prev => ({ ...prev, ...boxesResult }))
      setOcrProgress({ page: pdf.numPages, total: pdf.numPages, status: 'Terminé ✓' })
      setTimeout(() => { if (mountedRef.current) setOcrRunning(false) }, 900)
    } catch (err) {
      // Lot 7 — étape E. Logge en dev (avant on swallow silencieusement → debug impossible).
      if (import.meta.env.DEV) console.error('[usePdfOcr] OCR run failed', err)
      if (!mountedRef.current) return
      setOcrProgress({ page: 0, total: 0, status: 'Échec' })
      setTimeout(() => { if (mountedRef.current) setOcrRunning(false) }, 1800)
    } finally {
      try { await worker?.terminate() } catch {}
    }
  }

  return { ocrText, ocrWordBoxes, ocrRunning, ocrProgress, runOcr }
}