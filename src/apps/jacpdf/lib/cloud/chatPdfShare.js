// Helpers Phase 4 — partage de PDF dans le chat 1-to-1.
//
// Convention : le champ `content` de chat_messages stocke un JSON
// sérialisé directement quand c'est un message spécial (PDF share, plus
// tard peut-être audio, gif, etc.). Au render, on tente JSON.parse +
// check `type`. Si ça matche, on rend une carte ; sinon, le contenu est
// affiché comme du texte normal.
//
// Pourquoi pas une nouvelle colonne en DB ?
//   - Pas de migration nécessaire (compat parfaite avec Phase 3).
//   - RLS reste identique.
//   - Le trigger notify_chat_message a déjà un preview 80 chars qui
//     marche pour le JSON (on verra du JSON tronqué dans la notif —
//     pas idéal mais tolérable pour Phase 4 ; on pourra raffiner plus
//     tard avec un trigger qui détecte le JSON et formate un preview
//     « 📎 Mon document.pdf »).
//
// Format JSON :
//   { type: "pdf_share", document_id: uuid, name: string,
//     size: number|null, num_pages: number|null }

const PDF_SHARE_TYPE = 'pdf_share'

/**
 * Construit le contenu chat à envoyer pour un partage de PDF.
 * @param {object} pdf - { id, name, size_bytes, num_pages? }
 * @returns {string} content prêt pour chat_messages.content
 */
export function formatPdfShareMessage(pdf) {
	return JSON.stringify({
		type: PDF_SHARE_TYPE,
		document_id: pdf.id,
		name: pdf.name || 'Document',
		size: pdf.size_bytes ?? null,
		num_pages: pdf.num_pages ?? null,
	})
}

/**
 * Tente de parser un message chat en partage PDF.
 * @param {string} content
 * @returns {null | { type, document_id, name, size, num_pages }}
 *   null si le contenu n'est pas un PDF share (texte normal).
 *
 * Robuste : ne throw jamais (catch JSON.parse + check shape).
 */
export function parsePdfShareMessage(content) {
	if (!content || typeof content !== 'string') return null
	const trimmed = content.trim()
	// Optimisation : on évite JSON.parse si ça commence pas par {
	if (!trimmed.startsWith('{')) return null
	try {
		const parsed = JSON.parse(trimmed)
		if (parsed?.type !== PDF_SHARE_TYPE) return null
		if (!parsed.document_id) return null
		return {
			type: PDF_SHARE_TYPE,
			document_id: String(parsed.document_id),
			name: String(parsed.name || 'Document'),
			size: typeof parsed.size === 'number' ? parsed.size : null,
			num_pages: typeof parsed.num_pages === 'number' ? parsed.num_pages : null,
		}
	} catch {
		return null
	}
}

/**
 * Format human-readable d'une taille en bytes (Ko/Mo/Go).
 * Léger duplicata de cloudSettings.formatBytes pour éviter la dépendance
 * dans le module lib (chatPdfShare ne devrait pas dépendre de
 * cloudSettings, qui est un store global avec subscription event).
 */
export function formatPdfSize(bytes) {
	if (bytes == null) return ''
	if (bytes === 0) return '0 o'
	const KB = 1024
	const MB = KB * 1024
	const GB = MB * 1024
	if (bytes < KB) return `${bytes} o`
	if (bytes < MB) return `${(bytes / KB).toFixed(0)} Ko`
	if (bytes < GB) return `${(bytes / MB).toFixed(1)} Mo`
	return `${(bytes / GB).toFixed(2)} Go`
}