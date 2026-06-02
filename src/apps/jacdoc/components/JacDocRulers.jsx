import {
  renderRulerTicks,
  renderRulerVerticalTicks,
  buildRulerMarkerStyle,
  buildRulerVMarkerStyle,
  RULER_TAB_LABELS,
} from '../pages/editor/editorHelpers'
import { PAGE_H_PX, PAGE_W_PX } from '../pages/editor/pagination/constants'
import './JacDocRulers.css'

// Règles JacDoc style Word interactives. Deux composants présentationnels
// exposés séparément car la règle horizontale est placée HORS du scroll
// (juste sous la toolbar, position fixe) alors que la règle verticale
// est DANS .jacdoc-scroll (elle suit le scroll des pages comme Word).
//
// Toute la mécanique de drag (mouse listeners, clampage, dispatch des
// mises à jour rulerSettings) reste dans JacDocEditor.jsx — ces composants
// ne font que rendre les rangées de ticks + les marqueurs et appellent
// les handlers fournis via props.

// Règle horizontale : bande pleine largeur style Word avec graduations
// au-dessus de la page, marqueurs de marges/retraits draggables et taquets
// de tabulation. Double-clic sur la zone des graduations → ajoute un taquet ;
// double-clic sur un taquet existant → supprime ; clic sur le coin haut-gauche
// → cycle le type de taquet (gauche/centre/droite/décimal).
export function JacDocRulerH({
  rulerSettings,
  rulerRef,
  startRulerDrag,
  addTabStopAt,
  removeTabStop,
  cycleTabType,
}) {
  const rulerTextLeft = rulerSettings.marginLeft
  const rulerTextRight = PAGE_W_PX - rulerSettings.marginRight
  return (
    <div className="jacdoc-ruler-wrap">
      <button
        type="button"
        className={'jacdoc-ruler-corner is-' + rulerSettings.tabType}
        onClick={cycleTabType}
        title={'Type de tabulation : ' + RULER_TAB_LABELS[rulerSettings.tabType]}
        aria-label="Changer le type de tabulation"
      />
      {/* Bande pleine largeur style Word : .jacdoc-ruler-strip occupe
          toute la largeur de l'éditeur (gris foncé hors-page), et la
          .jacdoc-ruler centrée à 816 px porte les graduations + les
          marqueurs qui correspondent à la largeur du document. */}
      <div className="jacdoc-ruler-strip">
        <div
          className="jacdoc-ruler"
          ref={rulerRef}
          onDoubleClick={addTabStopAt}
          title="Glisser les marqueurs pour marges/retraits. Double-clic pour ajouter une tabulation."
        >
          <div className="jacdoc-ruler-numbers">{renderRulerTicks()}</div>
          <button
            type="button"
            className="jacdoc-ruler-marker is-margin-left"
            style={buildRulerMarkerStyle(rulerSettings.marginLeft)}
            onMouseDown={(e) => startRulerDrag('marginLeft', e)}
            title="Marge gauche"
            aria-label="Marge gauche"
          />
          <button
            type="button"
            className="jacdoc-ruler-marker is-margin-right"
            style={buildRulerMarkerStyle(rulerTextRight)}
            onMouseDown={(e) => startRulerDrag('marginRight', e)}
            title="Marge droite"
            aria-label="Marge droite"
          />
          <button
            type="button"
            className="jacdoc-ruler-marker is-first-indent"
            style={buildRulerMarkerStyle(rulerTextLeft + rulerSettings.firstIndent)}
            onMouseDown={(e) => startRulerDrag('firstIndent', e)}
            title="Retrait de première ligne"
            aria-label="Retrait de première ligne"
          />
          <button
            type="button"
            className="jacdoc-ruler-marker is-hanging-indent"
            style={buildRulerMarkerStyle(rulerTextLeft + rulerSettings.hangingIndent)}
            onMouseDown={(e) => startRulerDrag('hangingIndent', e)}
            title="Retrait suspendu / retrait gauche"
            aria-label="Retrait suspendu"
          />
          <button
            type="button"
            className="jacdoc-ruler-marker is-right-indent"
            style={buildRulerMarkerStyle(rulerTextRight - rulerSettings.rightIndent)}
            onMouseDown={(e) => startRulerDrag('rightIndent', e)}
            title="Retrait droit"
            aria-label="Retrait droit"
          />
          {rulerSettings.tabStops.map((stop, index) => (
            <button
              key={index}
              type="button"
              className={'jacdoc-ruler-tab is-' + (stop.type || 'left')}
              style={buildRulerMarkerStyle(stop.x)}
              onMouseDown={(e) => startRulerDrag('tabStop', e, index)}
              onDoubleClick={(e) => removeTabStop(index, e)}
              title="Taquet de tabulation — glisser pour déplacer, double-clic pour supprimer"
              aria-label="Taquet de tabulation"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Règle verticale : bande collée du haut au bas du document, dans laquelle
// la règle elle-même (.jacdoc-ruler-v) ne couvre qu'une page — celle du
// caret, comme Word. Le parent calcule rulerVStripStyle (hauteur totale)
// et rulerVStyle (top + hauteur de la page courante).
export function JacDocRulerV({
  rulerSettings,
  rulerVRef,
  rulerVStripStyle,
  rulerVStyle,
  rulerVTickCount,
  startRulerDrag,
}) {
  return (
    <div className="jacdoc-ruler-v-strip" style={rulerVStripStyle}>
      <div
        className="jacdoc-ruler-v"
        style={rulerVStyle}
        ref={rulerVRef}
        title="Glisser les marqueurs pour ajuster les marges haut/bas."
      >
        <div className="jacdoc-ruler-v-numbers">{renderRulerVerticalTicks(rulerVTickCount)}</div>
        <button
          type="button"
          className="jacdoc-ruler-v-marker is-margin-top"
          style={buildRulerVMarkerStyle(rulerSettings.marginTop)}
          onMouseDown={(e) => startRulerDrag('marginTop', e)}
          title="Marge du haut"
          aria-label="Marge du haut"
        />
        <button
          type="button"
          className="jacdoc-ruler-v-marker is-margin-bottom"
          style={buildRulerVMarkerStyle(PAGE_H_PX - rulerSettings.marginBottom)}
          onMouseDown={(e) => startRulerDrag('marginBottom', e)}
          title="Marge du bas"
          aria-label="Marge du bas"
        />
      </div>
    </div>
  )
}