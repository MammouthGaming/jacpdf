// JacCalendrierConfirmModal.jsx
// Pop-up de confirmation personnalisée. Remplace window.confirm() partout
// dans JacCalendrier (suppression de calendrier, suppression d'événement,
// etc.).
//
// Usage :
//   const [confirmState, setConfirmState] = useState(null)
//   setConfirmState({ title, message, confirmLabel, danger: true, onConfirm: () => ... })
//   ...
//   <JacCalendrierConfirmModal
//     state={confirmState}
//     onClose={() => setConfirmState(null)}
//   />
//
// Le composant gère :
//   - clic sur l'overlay  -> annule
//   - touche Escape       -> annule
//   - touche Enter        -> confirme
//   - focus auto sur le bouton de confirmation

import React, { useEffect, useRef } from 'react'

export function JacCalendrierConfirmModal({ state, onClose }) {
	const confirmBtnRef = useRef(null)

	useEffect(() => {
		if (!state) return
		const id = requestAnimationFrame(() => {
			confirmBtnRef.current?.focus()
		})
		const onKey = (e) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				onClose()
			} else if (e.key === 'Enter') {
				e.preventDefault()
				state.onConfirm?.()
				onClose()
			}
		}
		document.addEventListener('keydown', onKey)
		return () => {
			cancelAnimationFrame(id)
			document.removeEventListener('keydown', onKey)
		}
	}, [state, onClose])

	if (!state) return null

	const {
		title = 'Confirmer',
		message = '',
		confirmLabel = 'Confirmer',
		cancelLabel = 'Annuler',
		danger = false,
		onConfirm,
	} = state

	const handleConfirm = () => {
		onConfirm?.()
		onClose()
	}

	return (
		<div
			className="jaccalendrier-confirm-overlay"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
			role="presentation"
		>
			<div
				className="jaccalendrier-confirm"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="jaccalendrier-confirm-title"
			>
				<h3 id="jaccalendrier-confirm-title" className="jaccalendrier-confirm__title">
					{title}
				</h3>
				{message && (
					<p className="jaccalendrier-confirm__message">{message}</p>
				)}
				<div className="jaccalendrier-confirm__actions">
					<button
						type="button"
						className="jaccalendrier-confirm__btn jaccalendrier-confirm__btn--ghost"
						onClick={onClose}
					>
						{cancelLabel}
					</button>
					<button
						ref={confirmBtnRef}
						type="button"
						className={
							danger
								? 'jaccalendrier-confirm__btn jaccalendrier-confirm__btn--danger'
								: 'jaccalendrier-confirm__btn jaccalendrier-confirm__btn--primary'
						}
						onClick={handleConfirm}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	)
}

export default JacCalendrierConfirmModal