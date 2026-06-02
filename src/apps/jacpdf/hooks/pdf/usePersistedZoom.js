import { useEffect, useState } from 'react'

// Zoom persistant PAR PDF (clef = nom de fichier).
// Sauvegarder un zoom global n'avait pas de sens : un PDF lu en mode lecture
// (200%) et un autre lu en mode édition (100%) doivent garder leur propre
// niveau. Les zooms de chaque fichier sont stockés séparément dans
// localStorage et restaurés quand on rouvre le même fichier (même après un
// rafraîchissement). Fallback à 100% pour un nouveau fichier ou une valeur
// invalide / hors bornes [25, 400].
//
// Le mode nommé (auto / real / fit / width) est aussi persisté, sous une
// clef à part, pour que l'étiquette affichée dans la barre de zoom (ex.
// « Pleine largeur ») reste après un refresh — sinon l'utilisateur voit
// le pourcentage numérique à la place. Valeur null si l'utilisateur a fait
// un zoom manuel (+/-, pinch, Cmd+0/+/-).
const VALID_MODES = ['auto', 'real', 'fit', 'width']

export function usePersistedZoom(fileName) {
  const zoomStorageKey = `jacpdf_zoom:${fileName || 'default'}`
  const modeStorageKey = `jacpdf_zoomMode:${fileName || 'default'}`
  const [zoom, setZoom] = useState(() => {
    const saved = parseInt(localStorage.getItem(zoomStorageKey) || '', 10)
    return Number.isFinite(saved) && saved >= 25 && saved <= 400 ? saved : 100
  })
  const [zoomMode, setZoomMode] = useState(() => {
    const saved = localStorage.getItem(modeStorageKey)
    return VALID_MODES.includes(saved) ? saved : null
  })
  useEffect(() => {
    localStorage.setItem(zoomStorageKey, String(zoom))
  }, [zoom, zoomStorageKey])
  useEffect(() => {
    if (zoomMode == null) localStorage.removeItem(modeStorageKey)
    else localStorage.setItem(modeStorageKey, zoomMode)
  }, [zoomMode, modeStorageKey])
  return [zoom, setZoom, zoomMode, setZoomMode]
}