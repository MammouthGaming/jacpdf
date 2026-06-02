// scripts/generate-pwa-icons.mjs
// Génère toutes les icônes PWA depuis les SVG de /logo/.
// Usage : node scripts/generate-pwa-icons.mjs

import sharp from "sharp"
import { mkdir, readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const LOGO_DIR = resolve(ROOT, "logo")        // ⚠️ ajuste si tes SVG sont ailleurs
const OUT_DIR = resolve(ROOT, "public/icons")

// Couleur de fond pour les icônes maskable (= theme_color du manifest)
const BG = { r: 13, g: 17, b: 23, alpha: 1 } // #0d1117

// Liste des icônes à produire
const TASKS = [
	// Icônes JacSuite principales (any purpose : remplissent tout le canvas)
	{ svg: "JacSuite.svg",      out: "jacsuite-192.png",            size: 192, maskable: false },
	{ svg: "JacSuite.svg",      out: "jacsuite-512.png",            size: 512, maskable: false },
	// Maskable (Android adaptive) : logo à 75% au centre, fond plein
	{ svg: "JacSuite.svg",      out: "jacsuite-maskable-192.png",   size: 192, maskable: true  },
	{ svg: "JacSuite.svg",      out: "jacsuite-maskable-512.png",   size: 512, maskable: true  },
	// Raccourcis (long-press sur l'icône de l'app)
	{ svg: "JacDoc.svg",        out: "jacdoc-96.png",               size: 96,  maskable: false },
	{ svg: "JacPDF.svg",        out: "jacpdf-96.png",               size: 96,  maskable: false },
	{ svg: "JacTâche.svg",      out: "jactache-96.png",             size: 96,  maskable: false },
	{ svg: "JacCalendrier.svg", out: "jaccalendrier-96.png",        size: 96,  maskable: false },
]

async function generate({ svg, out, size, maskable }) {
	const svgPath = resolve(LOGO_DIR, svg)
	const outPath = resolve(OUT_DIR, out)
	const svgBuffer = await readFile(svgPath)

	if (maskable) {
		// Safe zone : logo à 75% sur fond plein #0d1117
		const inner = Math.round(size * 0.75)
		const offset = Math.round((size - inner) / 2)
		const logo = await sharp(svgBuffer)
			.resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
			.png()
			.toBuffer()
		await sharp({
			create: { width: size, height: size, channels: 4, background: BG },
		})
			.composite([{ input: logo, left: offset, top: offset }])
			.png()
			.toBuffer()
			.then((buf) => sharp(buf).toFile(outPath))
	} else {
		// Any purpose : logo remplit tout le canvas, fond transparent
		await sharp(svgBuffer)
			.resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
			.png()
			.toFile(outPath)
	}
	console.log(`✅ ${out}  (${size}×${size}${maskable ? ", maskable" : ""})`)
}

async function main() {
	await mkdir(OUT_DIR, { recursive: true })
	console.log(`📂 Source SVG : ${LOGO_DIR}`)
	console.log(`📂 Sortie PNG : ${OUT_DIR}`)
	console.log("")
	for (const task of TASKS) {
		try {
			await generate(task)
		} catch (err) {
			console.error(`❌ ${task.out} → ${err.message}`)
		}
	}
	console.log("\n🎉 Terminé.")
}

main()