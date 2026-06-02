// useEyedropper.js — outil pipette.

import { useCallback } from 'react'

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }
function toHex2(n) { return n.toString(16).padStart(2, '0') }

export function useEyedropper({ canvasRef, onPick }) {
  const pickAt = useCallback((x, y) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const px = clamp(Math.floor(x), 0, canvas.width - 1)
    const py = clamp(Math.floor(y), 0, canvas.height - 1)
    let data
    try {
      data = canvas.getContext('2d').getImageData(px, py, 1, 1).data
    } catch {
      return null
    }
    // Pixel transparent => renvoie null, le composant peut décider de
    // garder la couleur active inchangée.
    if (data[3] < 8) return null
    const hex = '#' + toHex2(data[0]) + toHex2(data[1]) + toHex2(data[2])
    if (onPick) onPick(hex)
    return hex
  }, [canvasRef, onPick])

  return { pickAt }
}