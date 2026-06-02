// JacNoteConfirm.jsx
// Modal de confirmation custom de JacNote.

import React, { useEffect, useRef } from 'react'
import { useConfirmState, resolveConfirm } from './jacnoteConfirmStore'

export function JacNoteConfirm() {
	const dialog = useConfirmState()
	const confirmBtnRef = useRef(null)

	useEffect(() => {
		if (!dialog) return
		confirmBtnRef.current?.focus()
		const onKey = (e) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				e.stopPropagation()
				resolveConfirm(false)
			}
			if (e.key === 'Enter') {
				e.preventDefault()
				e.stopPropagation()
				resolveConfirm(true)
			}
		}
		document.addEventListener('keydown', onKey, true)
		return () => document.removeEventListener('keydown', onKey, true)
	}, [dialog])

	if (!dialog) return null

	return (
		<div
			className="jacnote-confirm-backdrop"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) resolveConfirm(false)
			}}
			role="presentation"
		>
			<div
				className="jacnote-confirm"
				role="dialog"
				aria-modal="true"
				aria-label={dialog.title || 'Confirmation'}
			>
				{dialog.title && (
					<h2 className="jacnote-confirm__title">{dialog.title}</h2>
				)}
				<p className="jacnote-confirm__message">{dialog.message}</p>
				<div className="jacnote-confirm__actions">
					<button
						type="button"
						className="jacnote-confirm__btn"
						onClick={() => resolveConfirm(false)}
					>
						{dialog.cancelLabel}
					</button>
					<button
						ref={confirmBtnRef}
						type="button"
						className="jacnote-confirm__btn jacnote-confirm__btn--primary"
						data-danger={dialog.danger || undefined}
						onClick={() => resolveConfirm(true)}
					>
						{dialog.confirmLabel}
					</button>
				</div>
			</div>
		</div>
	)
}

export default JacNoteConfirm