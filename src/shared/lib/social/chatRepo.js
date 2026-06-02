import { supabase } from "@/shared/lib/infra/supabase";
import { shareByEmail } from '@/apps/jacpdf/lib/cloud/documentSharesRepo'
import { formatPdfShareMessage } from '@/apps/jacpdf/lib/cloud/chatPdfShare'

/**
 * Erreur custom pour chatRepo.
 */
export class ChatError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'ChatError'
    this.code = code
  }
}

/**
 * Liste les messages d'une conversation entre 2 users (paire).
 * Order ASC pour avoir les plus anciens en haut, plus récents en bas
 * (sens d'affichage standard d'un chat).
 *
 * RLS limite déjà aux messages dont je suis sender ou recipient. Le filtre
 * `or` ci-dessous restreint en plus à la conversation avec un user donné.
 *
 * @param {string} currentUserId
 * @param {string} otherUserId
 * @param {object} [opts]
 * @param {number} [opts.limit=200]
 */
export async function listMessagesForPair(currentUserId, otherUserId, { limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, sender_id, recipient_id, content, created_at, read_at, edited_at')
    .or(
      `and(sender_id.eq.${currentUserId},recipient_id.eq.${otherUserId}),` +
      `and(sender_id.eq.${otherUserId},recipient_id.eq.${currentUserId})`,
    )
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    throw new ChatError(error.message, error.code)
  }
  return data || []
}

/**
 * Envoie un message. Le trigger DB créera automatiquement une notif
 * `chat_message` pour le recipient avec un aperçu 80 chars.
 *
 * @param {object} args
 * @param {string} args.senderId
 * @param {string} args.recipientId
 * @param {string} args.content - texte du message (1-4000 chars).
 * @returns le message inséré.
 */
export async function sendMessage({ senderId, recipientId, content }) {
  const trimmed = (content || '').trim()
  if (!trimmed) {
    throw new ChatError('Message vide', 'EMPTY')
  }
  if (trimmed.length > 4000) {
    throw new ChatError('Message trop long (max 4000 caractères)', 'TOO_LONG')
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      sender_id: senderId,
      recipient_id: recipientId,
      content: trimmed,
    })
    .select('id, sender_id, recipient_id, content, created_at, read_at, edited_at')
    .single()

  if (error) {
    throw new ChatError(error.message, error.code)
  }
  return data
}

/**
 * Marque tous les messages reçus de senderId comme lus (read_at = now).
 * No-op pour ceux déjà lus (filtre `.is('read_at', null)`).
 */
export async function markPairAsRead(currentUserId, senderId) {
  const { error } = await supabase
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', currentUserId)
    .eq('sender_id', senderId)
    .is('read_at', null)

  if (error) {
    throw new ChatError(error.message, error.code)
  }
}

/**
 * Supprime un message. RLS impose que je sois le sender.
 */
export async function deleteMessage(messageId) {
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('id', messageId)

  if (error) {
    throw new ChatError(error.message, error.code)
  }
}

/**
 * Supprime tous mes messages envoyés + retire de mon centre de notifications
 * toutes les notifs chat_message reçues. Action irréversible déclenchée
 * depuis FullSettings > Sociale > « Effacer tout l'historique de chat ».
 *
 * Limite RLS : DELETE sur chat_messages est restreint à sender_id = auth.uid(),
 * donc on n'efface que MES messages envoyés. Les messages reçus de mes amis
 * restent côté DB tant qu'eux-mêmes ne les suppriment pas — c'est cohérent
 * avec un wipe « unilatéral ». Pour un wipe two-sided il faudrait une RPC
 * server-side dédiée (futur).
 */
export async function deleteAllMyMessages(userId) {
  if (!userId) throw new ChatError('userId requis', 'NO_USER')
  const { error: delErr } = await supabase
    .from('chat_messages')
    .delete()
    .eq('sender_id', userId)
  if (delErr) throw new ChatError(delErr.message, delErr.code)

  // Et on retire toutes mes notifs chat_message d'un coup (peu importe le sender).
  const { error: notifErr } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .eq('type', 'chat_message')
  if (notifErr) throw new ChatError(notifErr.message, notifErr.code)
}

/**
 * Supprime toutes les notifications type='chat_message' provenant d'un
 * expéditeur donné. Appelé quand on ouvre la conversation pour faire
 * disparaitre les notifs concernées du centre de notifications
 * (auto-acquittement). RLS sur notifications filtre déjà par auth.uid()
 * = user_id, donc on n'efface que ses propres notifs.
 *
 * Filtre JSONB : `payload->>sender_id` extrait sender_id en text et
 * compare avec eq. Supabase REST supporte cette syntaxe.
 */
export async function clearChatNotifsFromSender(senderId) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('type', 'chat_message')
    .eq('payload->>sender_id', senderId)

  if (error) {
    throw new ChatError(error.message, error.code)
  }
}

/**
 * Phase 4 — Envoie un partage de PDF dans le chat.
 *
 * 1. Crée un partage en lecture sur le PDF pour le destinataire via
 *    documentSharesRepo.shareByEmail. La row est insérée avec
 *    invitee_email = email destinataire ; RLS sur document_shares matche
 *    le JWT du destinataire (déjà connecté avec cet email) et lui donne
 *    accès immédiatement — pas besoin d'un redeem manuel.
 *    Si un partage identique existe déjà (23505 unique_violation), on
 *    ignore et on continue à envoyer le message : l'accès est déjà
 *    accordé, c'est idempotent.
 *
 * 2. Envoie un message chat normal via sendMessage avec un content JSON
 *    sérialisé (cf. chatPdfShare.formatPdfShareMessage). Au render,
 *    ChatModal parse ce JSON via parsePdfShareMessage et affiche une
 *    PdfShareCard cliquable au lieu du texte brut. Le trigger DB
 *    notify_chat_message créera automatiquement une notif chat_message
 *    pour le destinataire (preview = JSON tronqué — acceptable Phase 4).
 *
 * @param {object} args
 * @param {string} args.senderId
 * @param {string} args.recipientId
 * @param {string} args.recipientEmail — pour shareByEmail
 * @param {object} args.pdf — { id, name, size_bytes, num_pages? }
 *                            (forme d'un élément de useJacpdfCloud.list())
 * @returns le message inséré.
 */
export async function sendPdfShareMessage({ senderId, recipientId, recipientEmail, pdf }) {
  if (recipientEmail && pdf?.id) {
    try {
      await shareByEmail({
        documentId: pdf.id,
        email: recipientEmail,
        role: 'viewer',
      })
    } catch (err) {
      const code = err?.details?.code || err?.details?.error?.code || ''
      const dup = code === '23505' ||
        String(err?.message || '').toLowerCase().includes('duplicate')
      if (!dup && import.meta.env.DEV) {
        console.warn('[chatRepo] shareByEmail failed for chat PDF share:', err)
      }
      // On laisse passer : le message sera envoyé même si le partage a
      // échoué (l'erreur sera visible coté destinataire au moment du click
      // « Ouvrir » si vraiment l'accès manque).
    }
  }

  const content = formatPdfShareMessage(pdf)
  return await sendMessage({ senderId, recipientId, content })
}