// JacTacheConfirmModal.jsx
// Pop-up de confirmation personnalisée. Remplace window.confirm() dans JacTâche.
//
// Usage :
//   const [confirmState, setConfirmState] = useState(null)
//   setConfirmState({ title, message, confirmLabel, danger: true, onConfirm: () => ... })
//   ...
//   <JacTacheConfirmModal
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

export function JacTacheConfirmModal({ state, onClose }) {
	const confirmBtnRef = useRef(null)

	useEffect(() => {
		if (!state) return
		// Focus auto sur le bouton confirmer après ouverture.
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
			className="jactache-confirm-overlay"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
			role="presentation"
		>
			<div
				className="jactache-confirm"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="jactache-confirm-title"
			>
				<h3 id="jactache-confirm-title" className="jactache-confirm__title">
					{title}
				</h3>
				{message && (
					<p className="jactache-confirm__message">{message}</p>
				)}
				<div className="jactache-confirm__actions">
					<button
						type="button"
						className="jactache-confirm__btn jactache-confirm__btn--ghost"
						onClick={onClose}
					>
						{cancelLabel}
					</button>
					<button
						ref={confirmBtnRef}
						type="button"
						className={
							danger
								? 'jactache-confirm__btn jactache-confirm__btn--danger'
								: 'jactache-confirm__btn jactache-confirm__btn--primary'
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

export default JacTacheConfirmModal