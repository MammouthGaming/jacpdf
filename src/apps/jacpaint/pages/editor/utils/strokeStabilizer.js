// strokeStabilizer.js — lissage d'un flux de points pointer.
//
// createStabilizer({ amount, mode })
//   amount — 0..100 (0 = aucun lissage, 100 = très lent à rattraper)
//   mode   — 'average' (défaut) | 'catchup'
//
// L'instance expose :
//   push(point)  — ajoute un point pointer brut, renvoie le tableau de
//                  points lissés à dessiner depuis le dernier push.
//   end()        — rattrape le dernier point (mode catchup), renvoie
//                  les points restants à dessiner (utile pour pointerup).
//   reset()      — vide complètement sans rien renvoyer.

export function createStabilizer({ amount = 30, mode = 'average' } = {}) {
  // Buffer de N points où N croît avec amount. min 1 = pas de lissage.
  const N = Math.max(1, Math.round(1 + (amount / 100) * 14))
  const buffer = []
  let lastEmit = null

  function avgN() {
    let sx = 0, sy = 0, sp = 0
    for (const p of buffer) {
      sx += p.x
      sy += p.y
      sp += (p.pressure !== undefined ? p.pressure : 0.5)
    }
    return {
      x: sx / buffer.length,
      y: sy / buffer.length,
      pressure: sp / buffer.length,
    }
  }

  return {
    push(p) {
      buffer.push(p)
      if (buffer.length > N) buffer.shift()
      const out = []
      if (mode === 'catchup') {
        if (buffer.length === N) {
          // Tire la sortie d'un pas vers la moyenne du buffer.
          const target = avgN()
          if (!lastEmit) {
            lastEmit = target
            out.push(target)
          } else {
            const lerp = 0.5
            const next = {
              x: lastEmit.x + (target.x - lastEmit.x) * lerp,
              y: lastEmit.y + (target.y - lastEmit.y) * lerp,
              pressure: lastEmit.pressure + (target.pressure - lastEmit.pressure) * lerp,
            }
            lastEmit = next
            out.push(next)
          }
        }
      } else {
        const avg = avgN()
        lastEmit = avg
        out.push(avg)
      }
      return out
    },
    end() {
      const out = []
      // En mode catchup, rattrape le dernier point reçu pour ne pas
      // laisser le trait s'arrêter à mi-chemin.
      if (mode === 'catchup' && buffer.length > 0) {
        out.push(buffer[buffer.length - 1])
      }
      buffer.length = 0
      lastEmit = null
      return out
    },
    reset() {
      buffer.length = 0
      lastEmit = null
    },
  }
}