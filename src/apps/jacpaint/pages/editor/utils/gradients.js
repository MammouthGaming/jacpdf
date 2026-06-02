// gradients.js — application d'un dégradé à un canvas de couche.
//
// Convention d'angle (calque CSS) : 0° = vers le haut, 90° = vers la
// droite, 180° = vers le bas, 270° = vers la gauche. Canvas2D utilise
// la convention mathématique (0° = vers la droite), on convertit donc
// l'angle CSS en angle mathématique en soustrayant 90°.
//
// La config d'un dégradé (telle que produite par le `JacPaintColorPanel`) :
//   {
//     type:   'linear' | 'radial' | 'conic',
//     angle:  0..360       (linéaire et conique),
//     stops:  [{ color: '#rrggbb', position: 0..100, alpha?: 0..1 }],
//     repeat: boolean      (true → motif répétitif via stops 0..100/r),
//   }

// Convertit un hex (#rrggbb) + alpha (0–1) en chaine `rgba(r,g,b,a)`.
const hexToRgba = (hex, alpha) => {
  const a = alpha == null ? 1 : Math.max(0, Math.min(1, alpha))
  const h = (hex || '#000000').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const num = parseInt(full, 16) || 0
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// Calcule la bounding box d'un mask Uint8Array. Renvoie
// `{ minX, minY, maxX, maxY, cx, cy, w, h }` ou null si vide.
const maskBbox = (mask, W, H) => {
  let minX = W
  let minY = H
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < H; y++) {
    const row = y * W
    for (let x = 0; x < W; x++) {
      if (mask[row + x]) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return {
    minX, minY, maxX, maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w:  maxX - minX + 1,
    h:  maxY - minY + 1,
  }
}

// Construit un CanvasGradient natif depuis la config. Le paramètre
// `bbox` indique le rectangle dans lequel le dégradé doit s'étendre
// (centre + dimensions). Pour le linéaire : projeté sur l'axe de
// l'angle. Pour le radial : du centre vers le coin le plus éloigné.
// Pour le conique : autour du centre, démarrage à l'angle indiqué.
const buildGradient = (ctx, config, bbox) => {
  const { cx, cy, w, h } = bbox
  let grad
  if (config.type === 'radial') {
    const r = Math.max(w, h) / 2 * Math.SQRT2
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  } else if (config.type === 'conic' && typeof ctx.createConicGradient === 'function') {
    // Conique : Canvas2D supporte createConicGradient depuis 2022.
    // L'angle CSS conique démarre vers le haut (0° = nord) et tourne
    // en sens horaire. Canvas2D part vers la droite (0° = est), on
    // décale donc de -π/2.
    const start = ((config.angle ?? 0) - 90) * Math.PI / 180
    grad = ctx.createConicGradient(start, cx, cy)
  } else {
    // Linéaire : angle CSS → angle math (0° = est) en soustrayant 90°.
    const mathAngle = ((config.angle ?? 135) - 90) * Math.PI / 180
    const dx = Math.cos(mathAngle)
    const dy = Math.sin(mathAngle)
    // Longueur du segment qui couvre la bbox entière dans la direction
    // de l'angle (projection des côtés de la bbox).
    const len = (Math.abs(dx) * w + Math.abs(dy) * h) / 2
    grad = ctx.createLinearGradient(
      cx - dx * len, cy - dy * len,
      cx + dx * len, cy + dy * len,
    )
  }
  const sorted = (config.stops || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  for (const s of sorted) {
    const pos = Math.max(0, Math.min(1, (s.position ?? 0) / 100))
    grad.addColorStop(pos, hexToRgba(s.color, s.alpha ?? 1))
  }
  return grad
}

// Normalise un mask à des valeurs 0..255. Accepte indifféremment
// • Uint8Array / Array avec valeurs 0..255 (alpha déjà encodé)
// • Uint8Array / Array avec valeurs 0/1 (boolean numérique typique
//   de `alphaMaskFromCanvas`, lassoMaskFromPoints, etc.)
// Détecte le format en scannant la valeur max et multiplie par 255
// si le max est ≤ 1. Renvoie un Uint8ClampedArray pour garantir des
// arithmétiques propres ensuite.
const normalizeMaskTo255 = (mask) => {
  if (!mask) return null
  let max = 0
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > max) { max = mask[i]; if (max > 1) break }
  }
  if (max <= 1) {
    const out = new Uint8ClampedArray(mask.length)
    for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 255 : 0
    return out
  }
  return mask
}

// Applique un dégradé au canvas `targetCanvas`.
// • Si `mask` est fourni (Uint8Array de taille W*H, valeurs 0..255
//   OU 0/1 — auto-normalisées), le dégradé est clipé à la zone
//   masquée.
// • Sinon, on utilise le canal alpha de la couche elle-même comme
//   mask implicite : seuls les pixels déjà opaques reçoivent le
//   dégradé. Ça évite de remplir toute une couche transparente avec
//   un dégradé plein quand l'utilisateur voulait juste recolorer un
//   trait. Si la couche est intégralement vide (alpha=0 partout),
//   on tombe sur un fill plein écran (cas d'un nouveau calque vide).
export function applyGradientToCanvas(targetCanvas, mask, config) {
  if (!targetCanvas || !config || !config.stops || config.stops.length < 2) return
  const W = targetCanvas.width
  const H = targetCanvas.height
  const ctx = targetCanvas.getContext('2d')
  const normalizedMask = normalizeMaskTo255(mask)
  // Construit le mask effectif : explicite si fourni, sinon implicite
  // depuis le canal alpha existant. Une couche entièrement vide → mask
  // null → fill plein écran.
  let effectiveMask = normalizedMask
  if (!effectiveMask) {
    const existing = ctx.getImageData(0, 0, W, H).data
    let anyOpaque = false
    const am = new Uint8ClampedArray(W * H)
    for (let i = 0; i < am.length; i++) {
      const a = existing[i * 4 + 3]
      am[i] = a
      if (a > 0) anyOpaque = true
    }
    effectiveMask = anyOpaque ? am : null
  }
  const bbox = effectiveMask
    ? maskBbox(effectiveMask, W, H)
    : { cx: W / 2, cy: H / 2, w: W, h: H, minX: 0, minY: 0, maxX: W - 1, maxY: H - 1 }
  if (!bbox) return
  if (!effectiveMask) {
    // Plein écran : on remplace toute la couche par le dégradé.
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = buildGradient(ctx, config, bbox)
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
    return
  }
  // Avec mask : on peint le dégradé sur un canvas tampon, on
  // multiplie son alpha par le mask, puis on copie le résultat sur
  // la couche (en effaçant d'abord les pixels concernés pour que la
  // couleur originale ne transparaisse pas à travers un dégradé
  // semi-transparent).
  const tmp = document.createElement('canvas')
  tmp.width = W
  tmp.height = H
  const tctx = tmp.getContext('2d')
  tctx.fillStyle = buildGradient(tctx, config, bbox)
  tctx.fillRect(0, 0, W, H)
  const img = tctx.getImageData(0, 0, W, H)
  const data = img.data
  for (let i = 0; i < effectiveMask.length; i++) {
    data[i * 4 + 3] = (data[i * 4 + 3] * effectiveMask[i]) / 255
  }
  tctx.putImageData(img, 0, 0)
  // Efface d'abord les pixels masqués pour éviter le mélange avec
  // l'ancienne couleur de la couche.
  const eraseImg = ctx.getImageData(0, 0, W, H)
  const eraseData = eraseImg.data
  for (let i = 0; i < effectiveMask.length; i++) {
    if (effectiveMask[i]) eraseData[i * 4 + 3] = 0
  }
  ctx.putImageData(eraseImg, 0, 0)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(tmp, 0, 0)
  ctx.restore()
}

// Liste de préréglages « style » pour la palette d'application rapide.
// Chaque entrée a un id stable, le type, l'angle (linéaire) ou null
// (radial / conique), et les stops 0/100 calculés à partir d'une
// couleur de base. Utilisé par le bouton « Style » du panneau couleur.
export const GRADIENT_STYLE_PRESETS = [
  { id: 'linear-135', type: 'linear', angle: 135, label: 'Diagonal ↓'   },
  { id: 'linear-90',  type: 'linear', angle: 90,  label: 'Horizontal' },
  { id: 'linear-45',  type: 'linear', angle: 45,  label: 'Diagonal ↑' },
  { id: 'linear-0',   type: 'linear', angle: 0,   label: 'Vertical'   },
  { id: 'radial',     type: 'radial', angle: 0,   label: 'Radial'     },
  { id: 'conic',      type: 'conic',  angle: 0,   label: 'Conique'    },
]