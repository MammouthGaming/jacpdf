import './JacdocRemoteCursors.css'

function colorForUser(userId = '') {
  let hash = 0
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  }
  const colors = [
    '#39FF14',
    '#7C5CFF',
    '#38BDF8',
    '#F97316',
    '#F43F5E',
    '#EAB308',
    '#22C55E',
  ]
  return colors[hash % colors.length]
}

function formatAgo(seenAt) {
  if (!seenAt) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - seenAt) / 1000))
  if (seconds < 2) return 'maintenant'
  if (seconds < 60) return `${seconds}s`
  return '1min+'
}

/**
 * Overlay d’awareness JacDoc — désactivé.
 *
 * La pilule flottante « Nom — Page X · Ys » a été retirée à la demande
 * utilisateur. L’indication « actif » passe maintenant uniquement par le
 * point vert sur les avatars de présence dans la topbar (calque JacPDF).
 * Le composant est conservé pour ne pas casser les imports existants, mais
 * il ne rend rien tant que la couche CRDT/Yjs ne fournit pas de vrais
 * caret distants à dessiner dans la page.
 */
export default function JacdocRemoteCursors() {
  return null
}