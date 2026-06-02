// projectExport.js — Export et import de projets JacPaint au format
// « .jacpaint » (JSON + dataURLs PNG). Phase 9 étape 2.
//
// Format de fichier :
// {
//   format: 'jacpaint',
//   version: 1,
//   name: 'Ma peinture',
//   width: 1920,
//   height: 1080,
//   layers: [
//     { id, name, blendMode, opacity, visible, locked, groupId, dataURL }
//   ],
//   exportedAt: 'ISO date',
// }
//
// Le bundle est self-contained : pas de dépendance à localStorage ou au
// store, ce qui en fait un format de sauvegarde / transfert idéal.

export const JACPAINT_FORMAT_VERSION = 1

// Sérialise un projet en Blob JSON (chaque calque en dataURL PNG).
export async function exportProjectToBlob({ painting, layers, name }) {
	const serializedLayers = await Promise.all(
		(layers || []).map(async (l) => {
			let dataURL = null
			if (l && l.canvas) {
				try {
					dataURL = l.canvas.toDataURL('image/png')
				} catch {
					dataURL = null
				}
			}
			return {
				id: l && l.id,
				name: (l && l.name) || '',
				blendMode: (l && l.blendMode) || 'normal',
				opacity: l && typeof l.opacity === 'number' ? l.opacity : 1,
				visible: !(l && l.visible === false),
				locked: !!(l && l.locked),
				groupId: (l && l.groupId) || null,
				dataURL,
			}
		}),
	)
	const project = {
		format: 'jacpaint',
		version: JACPAINT_FORMAT_VERSION,
		name: name || (painting && painting.name) || 'Peinture',
		width: (painting && painting.width) | 0,
		height: (painting && painting.height) | 0,
		layers: serializedLayers,
		exportedAt: new Date().toISOString(),
	}
	const json = JSON.stringify(project, null, 2)
	return new Blob([json], { type: 'application/json' })
}

// Lance le téléchargement du projet sous forme de fichier .jacpaint.
export async function downloadProject({ painting, layers, name }) {
	const blob = await exportProjectToBlob({ painting, layers, name })
	const safe = (name || (painting && painting.name) || 'peinture')
		.replace(/[^a-zA-Z0-9\-_\u00C0-\u017F]+/g, '_')
		.slice(0, 60) || 'peinture'
	const stamp = new Date().toISOString().slice(0, 10)
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `${safe}-${stamp}.jacpaint`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	setTimeout(() => URL.revokeObjectURL(url), 1500)
	return { name: a.download, size: blob.size }
}

// Lit et parse un fichier .jacpaint. Valide les champs critiques.
export function readProjectFile(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = (e) => {
			try {
				const data = JSON.parse(e.target.result)
				if (!data || data.format !== 'jacpaint') {
					reject(new Error("Format invalide — attendu 'jacpaint'."))
					return
				}
				if (!data.width || !data.height) {
					reject(new Error('Dimensions manquantes dans le projet.'))
					return
				}
				if (!Array.isArray(data.layers)) {
					reject(new Error('Calques manquants ou invalides.'))
					return
				}
				resolve(data)
			} catch (err) {
				reject(new Error('Impossible de lire le fichier : ' + err.message))
			}
		}
		reader.onerror = () => reject(new Error('Erreur de lecture du fichier.'))
		reader.readAsText(file)
	})
}

// Charge une dataURL dans un canvas neuf aux dimensions spécifiées.
// Si la dataURL est nulle (calque vide), retourne un canvas vide.
export function loadImageToCanvas(dataURL, w, h) {
	return new Promise((resolve, reject) => {
		if (!dataURL) {
			const c = document.createElement('canvas')
			c.width = Math.max(1, w | 0)
			c.height = Math.max(1, h | 0)
			resolve(c)
			return
		}
		const img = new Image()
		img.onload = () => {
			const c = document.createElement('canvas')
			c.width = Math.max(1, (w | 0) || img.width)
			c.height = Math.max(1, (h | 0) || img.height)
			const ctx = c.getContext('2d')
			if (ctx) ctx.drawImage(img, 0, 0)
			resolve(c)
		}
		img.onerror = () => reject(new Error('Image illisible dans le projet.'))
		img.src = dataURL
	})
}

// Reconstruit le tableau de calques (avec canvas hydratés) à partir
// d'un projet désérialisé. Asynchrone : attend le décodage des images.
export async function rebuildLayers(project) {
	const w = project.width
	const h = project.height
	const layers = await Promise.all(
		(project.layers || []).map(async (l, idx) => {
			const canvas = await loadImageToCanvas(l.dataURL, w, h)
			return {
				id: l.id || 'layer-' + Date.now() + '-' + idx,
				canvas,
				name: l.name || `Calque ${idx + 1}`,
				blendMode: l.blendMode || 'normal',
				opacity: typeof l.opacity === 'number' ? l.opacity : 1,
				visible: l.visible !== false,
				locked: !!l.locked,
				groupId: l.groupId || null,
			}
		}),
	)
	return {
		painting: { width: w, height: h, name: project.name || 'Peinture' },
		layers,
	}
}