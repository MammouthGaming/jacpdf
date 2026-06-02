import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './FsmSelect.css'

/**
 * FsmSelect — dropdown custom qui remplace les <select> natifs dans
 * FullSettingsModal. Look cohérent en sombre et en clair, support des
 * icônes/emojis, descriptions secondaires, et navigation clavier complète.
 *
 * API drop-in :
 *   <FsmSelect
 *     value={langue}
 *     onChange={setLangue}
 *     options={[
 *       { value: 'fr', label: 'Français', icon: '🇫🇷' },
 *       { value: 'en', label: 'English',  icon: '🇬🇧' },
 *     ]}
 *   />
 *
 * Forme d'une option :
 *   - value (string|number)        : valeur stockée
 *   - label (string)               : texte affiché
 *   - icon (string|ReactNode, opt) : emoji ou JSX (ex. <img/>)
 *   - description (string, opt)    : 2e ligne fine sous le label
 *   - disabled (bool, opt)         : option désactivée (pas sélectionnable)
 *
 * Props :
 *   - placeholder (string, opt)  : texte affiché si value n'est dans aucune option
 *   - className (string, opt)    : ajouté au wrapper racine
 *   - menuClassName (string, opt): ajouté au popover
 *   - disabled (bool, opt)       : désactive tout le contrôle
 *
 * Accessibilité :
 *   - Trigger = button aria-haspopup="listbox" aria-expanded
 *   - Menu = role="listbox", options role="option" aria-selected
 *   - Clavier : Enter/Espace/↓ ouvre · ↑↓ navigue · Enter sélectionne ·
 *     Home/End extrêmes · Escape ferme · Tab ferme sans sélectionner.
 *
 * Comportement :
 *   - Click extérieur ferme.
 *   - Si pas assez de place sous le trigger, le menu s'ouvre vers le haut.
 *   - L'option active est scrollée dans la vue automatiquement.
 */
export default function FsmSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Sélectionner…',
  className = '',
  menuClassName = '',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [openUp, setOpenUp] = useState(false)
  const wrapperRef = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  const selected = options.find((o) => o.value === value)
  const selectedIndex = options.findIndex((o) => o.value === value)

  // Fermer au clic extérieur.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Décider si on ouvre vers le haut ou vers le bas selon la place dispo.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const estMenuHeight = Math.min(options.length * 44 + 16, 280)
    setOpenUp(spaceBelow < estMenuHeight && spaceAbove > spaceBelow)
  }, [open, options.length])

  // À l'ouverture : focus sur l'option sélectionnée (ou la première).
  useEffect(() => {
    if (open) setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }, [open, selectedIndex])

  // Scroller l'option active dans le viewport du menu.
  useEffect(() => {
    if (!open || activeIndex < 0 || !menuRef.current) return
    const el = menuRef.current.querySelector(`[data-index="${activeIndex}"]`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, open])

  const moveActive = (dir) => {
    setActiveIndex((cur) => {
      let next = cur + dir
      while (next >= 0 && next < options.length && options[next].disabled) {
        next += dir
      }
      if (next < 0 || next >= options.length) return cur
      return next
    })
  }

  const onKeyDown = (e) => {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveActive(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveActive(-1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(options.findIndex((o) => !o.disabled))
    } else if (e.key === 'End') {
      e.preventDefault()
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i].disabled) { setActiveIndex(i); break }
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opt = options[activeIndex]
      if (opt && !opt.disabled) {
        onChange?.(opt.value)
        setOpen(false)
        buttonRef.current?.focus()
      }
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const handleSelect = (opt) => {
    if (opt.disabled) return
    onChange?.(opt.value)
    setOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <div
      ref={wrapperRef}
      className={`fsm-cselect ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
      onKeyDown={onKeyDown}
    >
      <button
        ref={buttonRef}
        type="button"
        className="fsm-cselect__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="fsm-cselect__value">
          {selected?.icon != null && (
            <span className="fsm-cselect__icon" aria-hidden="true">{selected.icon}</span>
          )}
          <span className="fsm-cselect__label">
            {selected
              ? selected.label
              : <span className="fsm-cselect__placeholder">{placeholder}</span>}
          </span>
        </span>
        <svg
          className="fsm-cselect__chevron"
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className={`fsm-cselect__menu ${openUp ? 'fsm-cselect__menu--up' : ''} ${menuClassName}`}
          role="listbox"
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value
            const isActive = i === activeIndex
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-index={i}
                data-selected={isSelected ? 'true' : 'false'}
                data-active={isActive ? 'true' : 'false'}
                className="fsm-cselect__option"
                disabled={opt.disabled}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => handleSelect(opt)}
              >
                {opt.icon != null && (
                  <span className="fsm-cselect__option-icon" aria-hidden="true">{opt.icon}</span>
                )}
                <span className="fsm-cselect__option-body">
                  <span className="fsm-cselect__option-label">{opt.label}</span>
                  {opt.description && (
                    <span className="fsm-cselect__option-desc">{opt.description}</span>
                  )}
                </span>
                {isSelected && (
                  <svg
                    className="fsm-cselect__option-check"
                    width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}