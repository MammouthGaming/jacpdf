// Barre de recherche flottante (style Cmd+F). S'affiche quand showSearch=true
// (déclenché depuis ToolsMenu > Rechercher ou via raccourci clavier).
// Compte le nombre de résultats, permet de naviguer entre eux avec Entrée /
// Maj+Entrée ou les boutons ↑ / ↓, et se ferme avec Échap ou le ×.
//
// Extrait d'Editor.jsx (Vague 2) — purement présentationnel. Toute la logique
// (recherche dans pdf.js + ocr + textboxes, navigation des résultats) vit
// dans hooks/pdf/usePdfSearch.js. Ce composant ne fait qu'afficher le résultat
// du hook et passer ses callbacks aux bons inputs/boutons.

export default function SearchBar({
  showSearch,
  searchInputRef,
  searchQuery,
  setSearchQuery,
  searchResults,
  currentResultIdx,
  setCurrentResultIdx,
  closeSearch,
}) {
  if (!showSearch) return null

  return (
    <div className="editor-search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        ref={searchInputRef}
        className="editor-search-input"
        placeholder="Rechercher dans le PDF…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); closeSearch() }
          else if (e.key === 'Enter') {
            if (searchResults.length > 0) {
              setCurrentResultIdx(i => (e.shiftKey
                ? (i - 1 + searchResults.length) % searchResults.length
                : (i + 1) % searchResults.length))
            }
          }
        }}
      />
      <span className="editor-search-count">
        {searchQuery.trim()
          ? (searchResults.length > 0 ? `${currentResultIdx + 1} / ${searchResults.length}` : 'Aucun')
          : ''}
      </span>
      <button
        className="editor-search-btn"
        disabled={searchResults.length === 0}
        onClick={() => setCurrentResultIdx(i => (i - 1 + searchResults.length) % searchResults.length)}
        title="Résultat précédent (Maj+Entrée)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button
        className="editor-search-btn"
        disabled={searchResults.length === 0}
        onClick={() => setCurrentResultIdx(i => (i + 1) % searchResults.length)}
        title="Résultat suivant (Entrée)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button className="editor-search-close" onClick={closeSearch} title="Fermer (Échap)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  )
}