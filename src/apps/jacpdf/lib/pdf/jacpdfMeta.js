import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { getCloudSettings } from '@/apps/jacpdf/lib/cloud/cloudSettings'

// Clé du catalogue PDF où on stocke notre blob JSON. Préfixée pour minimiser
// les chances de collision avec des extensions PDF tierces (les readers PDF
// ignorent les clés inconnues du catalogue).
const META_KEY = 'JacPDFMeta'

// Version du schéma du payload. Incrémenter si on change de manière
// incompatible le shape des annotations sérialisées. Le reader skip la
// meta et log un warning si la version est inconnue → l'utilisateur ouvre
// le PDF comme si aucune meta n'était présente (pas de crash).
const META_VERSION = 1

/**
 * Charge `initialBytes`, y embed la meta JacPDF, renvoie les nouveaux bytes.
 *
 * Ne baka PAS les annotations dans les pages — le PDF reste visuellement
 * identique au source. Les annotations vivent uniquement dans le stream
 * `/JacPDFMeta` du catalogue. Pour avoir un PDF avec annotations visibles
 * partout (Adobe, etc.), utiliser `bakeAnnotationsIntoPdf` ( lib/pdf/bakePdf).
 *
 * @param {Uint8Array|ArrayBuffer} initialBytes - PDF source (non modifié).
 * @param {object} meta - Annotations à sauvegarder.
 * @param {Array} [meta.drawings]
 * @param {Array} [meta.textBoxes]
 * @param {Array<number>} [meta.deletedPages]
 * @param {number} [meta.rotation]
 * @param {Array<number>} [meta.pageOrder]
 * @returns {Promise<Uint8Array>}
 */
export async function embedJacPdfMeta(initialBytes, meta) {
  if (!initialBytes) throw new Error('embedJacPdfMeta: initialBytes manquant')
  const pdfDoc = await PDFDocument.load(initialBytes, { updateMetadata: false })
  await setJacPdfMetaInDoc(pdfDoc, meta)
  return await pdfDoc.save()
}

// Compression /FlateDecode via CompressionStream (built-in browser, pas de
// pako à importer). Utilisée quand cloudSettings.compressMeta est on —
// utile quand les annotations contiennent des images base64 lourdes.
async function deflate(bytes) {
  const cs = new CompressionStream('deflate')
  const writer = cs.writable.getWriter()
  writer.write(bytes)
  writer.close()
  const buf = await new Response(cs.readable).arrayBuffer()
  return new Uint8Array(buf)
}

async function inflate(bytes) {
  const ds = new DecompressionStream('deflate')
  const writer = ds.writable.getWriter()
  writer.write(bytes)
  writer.close()
  const buf = await new Response(ds.readable).arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Pose (ou remplace) le stream `/JacPDFMeta` sur un PDFDocument déjà chargé.
 * Utile pour combiner avec d'autres opérations pdf-lib sans payer un
 * double load/save.
 *
 * Async parce que la compression /FlateDecode (cloudSettings.compressMeta)
 * passe par CompressionStream, qui est asynchrone. Reste rapide quand la
 * compression est off (path direct sans await réel).
 */
export async function setJacPdfMetaInDoc(pdfDoc, meta) {
  const payload = {
    version: META_VERSION,
    drawings: meta?.drawings || [],
    textBoxes: meta?.textBoxes || [],
    deletedPages: meta?.deletedPages || [],
    rotation: meta?.rotation || 0,
    pageOrder: meta?.pageOrder || [],
  }
  const jsonStr = JSON.stringify(payload)
  let bytes = new TextEncoder().encode(jsonStr)

  // Réglage Cloud > Format de sauvegarde > « Compresser /JacPDFMeta ».
  const compress = !!getCloudSettings().compressMeta
  let useFilter = false
  if (compress) {
    try {
      bytes = await deflate(bytes)
      useFilter = true
    } catch {
      // Vieux navigateur sans CompressionStream → on écrit le JSON brut.
    }
  }

  // Stream dict — Type sert à debug/identifier le stream dans un PDF inspecté
  // à la main ; les readers tiers ignorent ce dict. Length est OBLIGATOIRE
  // (spec PDF) — pdf-lib le recalcule à la sérialisation mais on le pose
  // quand même pour être propre.
  const dict = {
    Type: PDFName.of(META_KEY),
    Length: bytes.length,
  }
  if (useFilter) dict.Filter = PDFName.of('FlateDecode')
  const streamDict = pdfDoc.context.obj(dict)
  const stream = PDFRawStream.of(streamDict, bytes)
  const ref = pdfDoc.context.register(stream)
  pdfDoc.catalog.set(PDFName.of(META_KEY), ref)
}

/**
 * Lit la meta JacPDF d'un PDF. Renvoie null si :
 *  - le PDF n'a pas de stream /JacPDFMeta (cas normal d'un PDF étranger)
 *  - le stream existe mais est mal formé (corruption, version incompatible)
 *  - une exception se produit pendant le parse (jamais throw, on log + null)
 *
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {Promise<object|null>}
 */
export async function readJacPdfMeta(bytes) {
  if (!bytes) return null
  try {
    const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false })
    const metaRef = pdfDoc.catalog.get(PDFName.of(META_KEY))
    if (!metaRef) return null
    const stream = pdfDoc.context.lookup(metaRef)
    if (!stream || !(stream instanceof PDFRawStream)) return null
    let bytesContent = stream.contents
    // Si le stream a un /Filter /FlateDecode (cf. setJacPdfMetaInDoc avec
    // cloudSettings.compressMeta), on inflate avant de parser.
    const filter = stream.dict?.get?.(PDFName.of('Filter'))
    const filterStr = filter != null && filter.toString ? filter.toString() : ''
    if (filterStr.includes('FlateDecode')) {
      try { bytesContent = await inflate(bytesContent) }
      catch { return null }
    }
    const jsonStr = new TextDecoder().decode(bytesContent)
    const parsed = JSON.parse(jsonStr)
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.version !== META_VERSION) {
      if (typeof console !== 'undefined') {
        console.warn(`[jacpdfMeta] version ${parsed.version} non supportée (attendu ${META_VERSION}) — meta ignorée`)
      }
      return null
    }
    return {
      version: parsed.version,
      drawings: Array.isArray(parsed.drawings) ? parsed.drawings : [],
      textBoxes: Array.isArray(parsed.textBoxes) ? parsed.textBoxes : [],
      deletedPages: Array.isArray(parsed.deletedPages) ? parsed.deletedPages : [],
      rotation: typeof parsed.rotation === 'number' ? parsed.rotation : 0,
      pageOrder: Array.isArray(parsed.pageOrder) ? parsed.pageOrder : [],
    }
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[jacpdfMeta] échec de lecture :', err)
    }
    return null
  }
}

/**
 * Helper rapide : test si un PDF contient une meta JacPDF sans la parser.
 * Utile pour décider d'afficher un badge « PDF édité dans JacPDF » par exemple.
 */
export async function hasJacPdfMeta(bytes) {
  if (!bytes) return false
  try {
    const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false })
    return pdfDoc.catalog.get(PDFName.of(META_KEY)) != null
  } catch {
    return false
  }
}