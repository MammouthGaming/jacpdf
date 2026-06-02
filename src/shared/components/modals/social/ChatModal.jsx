import { useEffect, useRef, useState, useMemo } from 'react'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useChat } from '@/shared/hooks/social/useChat'
import { sendPdfShareMessage } from '@/shared/lib/social/chatRepo'
import { parsePdfShareMessage } from '@/apps/jacpdf/lib/cloud/chatPdfShare'
import { blockUser } from '@/shared/lib/social/friendshipsRepo'
import { toastStore } from '@/shared/stores/ui//toastStore'
import { socialEnabledStore } from '@/shared/stores/social/socialEnabledStore'
import { socialPreferencesStore } from '@/shared/stores/social/socialPreferencesStore'
import PdfShareCard from '@/apps/jacpdf/components/modals/cloud/PdfShareCard'
import ChatPdfPickerInline from '@/shared/components/modals/social/ChatPdfPickerInline'
import './ChatModal.css'

function getInitials(name, email) {
  const src = (name || email || '?').trim()
  const parts = src.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return src.charAt(0).toUpperCase()
}

function formatMessageTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
}

function formatDateBucket(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const dStart = new Date(d)
  dStart.setHours(0, 0, 0, 0)
  if (dStart.getTime() === today.getTime()) return "Aujourd'hui"
  if (dStart.getTime() === yesterday.getTime()) return 'Hier'
  return d.toLocaleDateString('fr-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export default function ChatModal({ friend, onClose }) {
  // friend : { user_id, name, email, avatar_url } — résultat d'une ligne
  // FriendRow dans FriendsModal (champ user décomposé à plat).
  const { user: currentUser } = useAuth()
  const {
    messages,
    sendMessage,
    deleteMessage,
    markAsRead,
    loading,
    partnerTyping,
    broadcastTyping,
  } = useChat(currentUser?.id, friend?.user_id)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  // Phase B finition — throttle pour broadcastTyping. On évite de saturer
  // le channel Realtime en limitant à 1 envoi par 1.5 s pendant que l'autre
  // tape. La timeline côté récepteur s'auto-clear après 3 s sans nouveau
  // broadcast, donc cette cadence garde l'indicateur stable pendant la frappe
  // et le retire ~3 s après l'arrêt.
  const lastTypingBroadcastRef = useRef(0)
  // Phase 4 — picker PDF (popover 📎) + flag d'envoi PDF.
  // sendingPdf est séparé de sending pour pouvoir bloquer le composer
  // pendant le shareByEmail + sendMessage sans casser les conditions
  // d'affichage du bouton submit texte.
  const [showPicker, setShowPicker] = useState(false)
  const [sendingPdf, setSendingPdf] = useState(false)
  // Phase B — menu d'actions header (kebab) qui contient pour l'instant
  // « Bloquer ». blockingPending bloque le bouton pendant la RPC.
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [blockingPending, setBlockingPending] = useState(false)
  const listRef = useRef(null)
  const lastMessageIdRef = useRef(null)

  // Auto-scroll en bas à l'arrivée d'un nouveau message ou à l'ouverture.
  // requestAnimationFrame pour laisser le DOM peindre la nouvelle bulle
  // avant de scroller (sinon scrollHeight n'inclut pas encore la nouvelle
  // ligne et on s'arrête juste avant).
  useEffect(() => {
    if (!listRef.current) return
    const last = messages[messages.length - 1]
    if (!last) return
    if (lastMessageIdRef.current !== last.id) {
      lastMessageIdRef.current = last.id
      requestAnimationFrame(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight
        }
      })
    }
  }, [messages])

  // Acquittement : on marque comme lus + supprime les notifs chat_message
  // de cet expéditeur à l'ouverture ET à chaque nouveau message tant que
  // la modal est ouverte. messages.length comme dépendance déclenche à
  // chaque nouvelle entrée reçue par Realtime.
  useEffect(() => {
    if (!currentUser?.id || !friend?.user_id) return
    markAsRead()
  }, [currentUser?.id, friend?.user_id, messages.length, markAsRead])

  // Fermeture du menu contextuel par mousedown ailleurs ou Escape.
  useEffect(() => {
    if (!contextMenu) return undefined
    const onDown = (e) => {
      if (e.target.closest('.cm-context-menu')) return
      setContextMenu(null)
    }
    const onKey = (e) => { if (e.key === 'Escape') setContextMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  // Phase B — Fermeture du header menu (kebab) par clic ailleurs ou Escape.
  // Ignore les clics sur le bouton kebab lui-même ou sur le menu pour ne
  // pas le fermer juste après l'avoir ouvert.
  useEffect(() => {
    if (!showHeaderMenu) return undefined
    const onDown = (e) => {
      if (e.target.closest('.cm-header-menu') || e.target.closest('.cm-header-kebab')) return
      setShowHeaderMenu(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setShowHeaderMenu(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showHeaderMenu])

  // Group messages par jour pour les séparateurs « Aujourd'hui / Hier / 12 mai ».
  const grouped = useMemo(() => {
    const buckets = []
    let currentBucket = null
    for (const m of messages) {
      const bucket = formatDateBucket(m.created_at)
      if (!currentBucket || currentBucket.label !== bucket) {
        currentBucket = { label: bucket, items: [] }
        buckets.push(currentBucket)
      }
      currentBucket.items.push(m)
    }
    return buckets
  }, [messages])

  // Phase 4 — callback du picker. Appelle sendPdfShareMessage qui crée
  // un partage en lecture pour le destinataire ET envoie un message JSON
  // encodé. Le picker se ferme immédiatement (UX : feedback instantané).
  const handlePickPdf = async (pdf) => {
    if (sendingPdf || !currentUser?.id || !friend?.user_id) return
    setSendingPdf(true)
    setShowPicker(false)
    try {
      await sendPdfShareMessage({
        senderId: currentUser.id,
        recipientId: friend.user_id,
        recipientEmail: friend.email,
        pdf,
      })
      toastStore?.success?.(`PDF partagé : ${pdf.name}`)
    } catch (err) {
      toastStore?.error?.(err?.message || 'Erreur partage PDF')
    } finally {
      setSendingPdf(false)
    }
  }

  const handleSend = async (e) => {
    e?.preventDefault?.()
    const trimmed = input.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      await sendMessage(trimmed)
      setInput('')
    } catch (err) {
      // L'erreur est déjà loggée dans useChat ; on garde le texte dans
      // l'input pour permettre le retry.
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return
    // Préférence enterToSend (FullSettings > Sociale > Chat) :
    //   true (défaut) — Enter envoie, Shift+Enter saute ligne.
    //   false           — Shift+Enter envoie, Enter saute ligne.
    const enterToSend = socialPreferencesStore.getKey('enterToSend')
    const shouldSend = enterToSend ? !e.shiftKey : e.shiftKey
    if (shouldSend) {
      e.preventDefault()
      handleSend()
    }
  }

  const openContextMenu = (e, message) => {
    // Seul le sender peut supprimer son message (RLS impose la même chose
    // côté DB, mais autant ne pas afficher le menu inutilement).
    if (message.sender_id !== currentUser?.id) return
    e.preventDefault()
    setContextMenu({
      message,
      x: Math.min(e.clientX, window.innerWidth - 200),
      y: Math.min(e.clientY, window.innerHeight - 60),
    })
  }

  const friendName = friend?.name || friend?.email?.split('@')[0] || 'Ami'
  const initials = getInitials(friend?.name, friend?.email)

  // Phase B — Bloque ce user. Confirme, appelle la RPC, ferme la modal
  // si succès (la conversation n'a plus de sens après blocage — la RLS
  // chat_messages_select cache déjà ses messages, et l'amitié est supprimée).
  const handleBlock = async () => {
    if (!friend?.user_id || blockingPending) return
    if (!window.confirm(`Bloquer ${friendName} ?\n\nL'amitié et tous les messages échangés seront supprimés des deux côtés. Cette personne ne pourra plus t'envoyer de message ni voir ton activité.\n\nTu peux débloquer plus tard depuis Paramètres > Sociale > Gérer la liste des bloqués.`)) return
    setBlockingPending(true)
    try {
      await blockUser(friend.user_id)
      toastStore?.success?.(`${friendName} bloqué`)
      onClose?.()
    } catch (err) {
      toastStore?.error?.(err?.message || 'Erreur blocage')
    } finally {
      setBlockingPending(false)
      setShowHeaderMenu(false)
    }
  }

  // Safety net social — le chat n'est jamais accessible si le kill-switch
  // est OFF (ChatModal n'est ouvert que depuis FriendsModal qui est elle-même
  // déjà gated, mais on double-verrouille au cas où).
  const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])
  // Phase B Étape 2 — état réactif pour readReceipts. Quand OFF, on cache
  // les ✓✓ même sur MES propres messages : par symétrie, si je ne diffuse
  // pas mes accusés de lecture (useChat.markAsRead skip déjà le UPDATE DB),
  // je ne dois pas non plus voir ceux des autres sur mes messages — privacy
  // réciproque demandée par l'utilisateur.
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(
    () => socialPreferencesStore.getKey('readReceipts')
  )
  useEffect(
    () => socialPreferencesStore.subscribe((s) => setReadReceiptsEnabled(!!s.readReceipts)),
    [],
  )
  if (!socialEnabled) return null

  return (
    <div className="cm-overlay" onClick={onClose} role="presentation">
      <div
        className="cm-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Conversation avec ${friendName}`}
      >
        <header className="cm-header">
          <div className="cm-friend">
            <div className="cm-avatar">
              {friend?.avatar_url ? (
                <img src={friend.avatar_url} alt="" className="cm-avatar-img" />
              ) : (
                <span className="cm-avatar-initials">{initials}</span>
              )}
            </div>
            <div className="cm-friend-info">
              <span className="cm-friend-name">{friendName}</span>
              {friend?.email && (
                <span className="cm-friend-email">{friend.email}</span>
              )}
            </div>
          </div>
          <div style={ { display: 'flex', alignItems: 'center', gap: 4, position: 'relative' } }>
            <button
              className="cm-header-kebab"
              onClick={() => setShowHeaderMenu(v => !v)}
              aria-label="Plus d'actions"
              title="Plus d'actions"
              style={ { background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '6px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' } }
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.6"/>
                <circle cx="12" cy="12" r="1.6"/>
                <circle cx="12" cy="19" r="1.6"/>
              </svg>
            </button>
            {showHeaderMenu && (
              <ul
                className="cm-header-menu cm-context-menu"
                role="menu"
                style={ { position: 'absolute', top: '100%', right: 32, marginTop: 4, minWidth: 230, zIndex: 10, listStyle: 'none', padding: '4px 0', margin: '4px 0 0 0' } }
              >
                <li
                  className="cm-context-item cm-context-item-danger"
                  role="menuitem"
                  onClick={handleBlock}
                  aria-disabled={blockingPending}
                  style={ { opacity: blockingPending ? 0.5 : 1, cursor: blockingPending ? 'not-allowed' : 'pointer' } }
                >
                  {blockingPending ? 'Blocage…' : '🚫 Bloquer cet utilisateur'}
                </li>
              </ul>
            )}
            <button className="cm-close" onClick={onClose} aria-label="Fermer">✕</button>
          </div>
        </header>

        <div className="cm-body" ref={listRef}>
          {loading ? (
            <div className="cm-empty">Chargement…</div>
          ) : messages.length === 0 ? (
            <div className="cm-empty-state">
              <div className="cm-empty-icon">💬</div>
              <div className="cm-empty-title">Démarre la conversation</div>
              <div className="cm-empty-sub">
                Envoie ton premier message à {friendName} avec le champ ci-dessous.
              </div>
            </div>
          ) : (
            grouped.map((bucket, bi) => (
              <section key={bi} className="cm-day-section">
                <div className="cm-day-label">{bucket.label}</div>
                <ul className="cm-list">
                  {bucket.items.map((m) => {
                    const isMe = m.sender_id === currentUser?.id
                    // Phase 4 — détecte si le content est un partage PDF.
                    const pdfShare = parsePdfShareMessage(m.content)
                    return (
                      <li
                        key={m.id}
                        className={`cm-msg${isMe ? ' cm-msg-me' : ' cm-msg-them'}`}
                        onContextMenu={(e) => openContextMenu(e, m)}
                      >
                        <div className="cm-bubble">
                          {pdfShare ? (
                            <PdfShareCard share={pdfShare} isMe={isMe} />
                          ) : (
                            <span className="cm-text">{m.content}</span>
                          )}
                          <span className="cm-time">
                            {formatMessageTime(m.created_at)}
                            {isMe && m.read_at && readReceiptsEnabled && (
                              <span className="cm-read" title="Lu"> ✓✓</span>
                            )}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        {partnerTyping && (
          <div
            className="cm-typing-indicator"
            style={ {
              padding: '4px 16px 0',
              fontSize: 11,
              color: '#9ca3af',
              fontStyle: 'italic',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            } }
            aria-live="polite"
          >
            <span>{friendName} est en train d'écrire…</span>
          </div>
        )}
        <form className="cm-composer" onSubmit={handleSend}>
          <button
            type="button"
            className="cm-attach-btn"
            onClick={() => setShowPicker((v) => !v)}
            disabled={sending || sendingPdf}
            aria-label="Joindre un PDF"
            title="Joindre un PDF de JacPDF Cloud"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <textarea
            className="cm-input"
            placeholder={`Écrire à ${friendName}…`}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              // Throttle 1500 ms — broadcastTyping respecte aussi la pref
              // typingIndicator côté hook (no-op si OFF).
              const now = Date.now()
              if (now - lastTypingBroadcastRef.current > 1500) {
                lastTypingBroadcastRef.current = now
                broadcastTyping?.()
              }
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={4000}
            disabled={sending || sendingPdf}
          />
          <button
            type="submit"
            className="cm-send"
            disabled={!input.trim() || sending || sendingPdf}
            aria-label="Envoyer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>

        {showPicker && (
          <ChatPdfPickerInline
            onPick={handlePickPdf}
            onClose={() => setShowPicker(false)}
          />
        )}

        {contextMenu && (
          <ul
            className="cm-context-menu"
            style={ { left: contextMenu.x, top: contextMenu.y } }
            role="menu"
          >
            <li
              className="cm-context-item cm-context-item-danger"
              role="menuitem"
              onClick={() => {
                deleteMessage(contextMenu.message.id)
                setContextMenu(null)
              }}
            >
              Supprimer le message
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}