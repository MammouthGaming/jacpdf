export default function ToolPreviewIcon({ id }) {
  const p = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }
  if (id === 'select')    return <svg {...p}><path d="M5 3l14 9-7 1-3 7z" fill="currentColor"/></svg>
  if (id === 'text')      return <svg {...p}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
  if (id === 'pencil')    return <svg {...p}><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
  if (id === 'highlight') return <svg {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
  if (id === 'shapes')    return <svg {...p}><path d="M4 19l4-8 4 8H4z"/><circle cx="17" cy="7" r="3"/><rect x="13" y="14" width="6" height="5" rx="1"/></svg>
  if (id === 'image')     return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
  if (id === 'eraser')    return <svg {...p}><path d="M20 20H7L3 16l10-10 7 7-2 2"/><path d="M6.5 17.5l4-4"/></svg>
  if (id === 'comment')   return <svg {...p}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
  return null
}