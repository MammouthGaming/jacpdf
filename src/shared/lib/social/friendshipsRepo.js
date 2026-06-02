// Wrapper Supabase pour la table public.friendships + la table public.profiles.
// Toutes les opérations CRUD pour le système d'amis de JacPDF (Phase 1).
//
// Schéma :
//   friendships : id, requester_id, addressee_id, status (pending/accepted/blocked),
//                 created_at, responded_at
//   profiles    : id, email, name, avatar_url
//
// RLS déjà géré côté Postgres :
//   - SELECT : on voit ses propres relations (requester ou addressee)
//   - INSERT : on peut envoyer une demande (en étant requester)
//   - UPDATE : seul le destinataire accepte/refuse
//   - DELETE : les deux peuvent supprimer
//
// Erreurs : toutes les fonctions throw une FriendshipsError avec un code
// quand applicable (NOT_FOUND, SELF, ALREADY_FRIENDS, ALREADY_PENDING,
// INCOMING_PENDING, BLOCKED).

import { supabase } from "@/shared/lib/infra/supabase";

class FriendshipsError extends Error {
  constructor(message, details) {
    super(message)
    this.name = 'FriendshipsError'
    this.details = details || {}
  }
}

export { FriendshipsError }

// Recherche un utilisateur par email via le RPC find_user_by_email
// (security definer côté Postgres, accessible aux authenticated). Retourne
// { id, email, name, avatar_url } ou null si introuvable.
// Note : pas de created_at ici car la RPC ne le retourne pas — on s'en
// passe pour la recherche (l'info « Membre depuis » n'est utile que dans
// la vue profil d'un ami déjà ajouté, et listFriendships le récupère via
// le join profiles ci-dessous).
export const findUserByEmail = async (email) => {
  const trimmed = (email || '').trim().toLowerCase()
  if (!trimmed) return null
  const { data, error } = await supabase.rpc('find_user_by_email', { search_email: trimmed })
  if (error) throw new FriendshipsError('Erreur recherche utilisateur', { cause: error })
  if (!data || !data.length) return null
  return data[0]
}

// Compte les PDFs édités/créés via JacPDF Cloud par un utilisateur donné.
// Wrap la RPC SECURITY DEFINER `get_user_pdf_count` qui bypass la RLS de
// public.documents (laquelle limite normalement la lecture au propriétaire).
// Utilisé par ProfileModal (mon propre count) et FriendsModal (count d'un
// ami dans la vue profil détaillée) pour afficher la stat « PDF édités
// avec JacPDF ». Retourne 0 si erreur ou aucun document — jamais throw
// pour ne pas casser le rendu du profil.
export const getUserPdfCount = async (userId) => {
  if (!userId) return 0
  const { data, error } = await supabase.rpc('get_user_pdf_count', { target_uuid: userId })
  if (error) {
    console.warn('[getUserPdfCount] erreur RPC:', error)
    return 0
  }
  return Number(data) || 0
}

// Liste TOUTES les relations qui me concernent (en tant que requester OU
// addressee). Joint manuellement sur profiles pour récupérer les infos
// publiques de l'autre user (un seul round-trip supplémentaire avec .in()).
//
// Retourne un array de :
//   { id, status, createdAt, respondedAt, requesterId, addresseeId,
//     isRequester, otherUser: { id, email, name, avatar_url } }
export const listFriendships = async (currentUserId) => {
  if (!currentUserId) return []
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
    .order('created_at', { ascending: false })
  if (error) throw new FriendshipsError('Erreur chargement amis', { cause: error })

  const otherIds = [...new Set(
    (data || []).map(f =>
      f.requester_id === currentUserId ? f.addressee_id : f.requester_id
    )
  )]
  if (!otherIds.length) return []

  // created_at = date de création de la row profiles. Pour les utilisateurs
  // créés via le trigger handle_new_user (cf. Phase 1 SQL Setup), c'est la
  // même que auth.users.created_at ± quelques ms. Pour les anciens users
  // backfillés, c'est la date du backfill — acceptable comme proxy de la
  // date d'inscription affichée dans la stat « Membre depuis » du profil ami.
  //
  // role / custom_role / school_role / custom_school_role / is_owner / about
  // = mirror de auth.users.raw_user_meta_data, synchronisé par handle_new_user
  // (cf. Phase 1 SQL section 8). Utilisé pour afficher les badges + la bio
  // dans la vue profil ami de FriendsModal — auth.users n'étant pas queryable
  // côté client, c'est le seul moyen d'exposer ces champs aux autres users.
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, email, name, avatar_url, created_at, role, custom_role, school_role, custom_school_role, is_owner, about')
    .in('id', otherIds)
  if (pErr) throw new FriendshipsError('Erreur chargement profils', { cause: pErr })

  const profileMap = new Map((profiles || []).map(p => [p.id, p]))

  return (data || []).map(f => {
    const isRequester = f.requester_id === currentUserId
    const otherId = isRequester ? f.addressee_id : f.requester_id
    return {
      id: f.id,
      status: f.status,
      createdAt: f.created_at,
      respondedAt: f.responded_at,
      requesterId: f.requester_id,
      addresseeId: f.addressee_id,
      isRequester,
      otherUser: profileMap.get(otherId) || {
        id: otherId, email: '', name: '', avatar_url: null, created_at: null,
        role: null, custom_role: null, school_role: null, custom_school_role: null, is_owner: false,
        about: '',
      },
    }
  })
}

// Envoie une demande d'ami à un utilisateur identifié par email.
// Chaîne de vérifications : existence du destinataire, pas soi-même,
// pas de relation pré-existante (peu importe le sens).
// Retourne la nouvelle row friendships insérée.
export const sendFriendRequest = async (currentUserId, addresseeEmail) => {
  if (!currentUserId) throw new FriendshipsError('Non authentifié')

  const target = await findUserByEmail(addresseeEmail)
  if (!target) {
    throw new FriendshipsError('Aucun utilisateur trouvé avec cet email', { code: 'NOT_FOUND' })
  }
  if (target.id === currentUserId) {
    throw new FriendshipsError("Tu ne peux pas t'ajouter toi-même", { code: 'SELF' })
  }

  // Vérifie qu'aucune relation n'existe déjà dans les deux sens.
  // .or avec and(...) : Supabase parse les and imbriqués comme des conjonctions.
  const { data: existing, error: checkErr } = await supabase
    .from('friendships')
    .select('id, status, requester_id, addressee_id')
    .or(
      `and(requester_id.eq.${currentUserId},addressee_id.eq.${target.id}),` +
      `and(requester_id.eq.${target.id},addressee_id.eq.${currentUserId})`
    )
    .limit(1)
  if (checkErr) throw new FriendshipsError('Erreur vérification relation', { cause: checkErr })

  if (existing && existing.length) {
    const e = existing[0]
    if (e.status === 'accepted') {
      throw new FriendshipsError('Vous êtes déjà amis', { code: 'ALREADY_FRIENDS' })
    }
    if (e.status === 'pending') {
      if (e.requester_id === currentUserId) {
        throw new FriendshipsError('Demande déjà envoyée', { code: 'ALREADY_PENDING' })
      }
      throw new FriendshipsError(
        "Cette personne t'a déjà envoyé une demande — accepte-la dans l'onglet Demandes",
        { code: 'INCOMING_PENDING' }
      )
    }
    if (e.status === 'blocked') {
      throw new FriendshipsError('Relation bloquée', { code: 'BLOCKED' })
    }
  }

  const { data, error } = await supabase
    .from('friendships')
    .insert({
      requester_id: currentUserId,
      addressee_id: target.id,
      status: 'pending',
    })
    .select()
    .single()
  if (error) throw new FriendshipsError('Erreur envoi demande', { cause: error })
  return data
}

// Accepte une demande reçue : pending → accepted + responded_at = now().
// RLS garantit qu'on est bien le destinataire (sinon erreur côté Postgres).
export const acceptFriendRequest = async (friendshipId) => {
  const { data, error } = await supabase
    .from('friendships')
    .update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
    })
    .eq('id', friendshipId)
    .eq('status', 'pending')
    .select()
    .single()
  if (error) throw new FriendshipsError('Erreur acceptation', { cause: error })
  return data
}

// Refuse une demande reçue (= delete). RLS permet aux deux côtés de delete,
// donc destinataire ou requester peuvent refuser/annuler de la même façon.
export const declineFriendRequest = async (friendshipId) => {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
  if (error) throw new FriendshipsError('Erreur refus', { cause: error })
}

// Annule une demande envoyée (requester delete sa propre row).
export const cancelFriendRequest = async (friendshipId) => {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
  if (error) throw new FriendshipsError('Erreur annulation', { cause: error })
}

// Retire un ami (delete row accepted). Les deux côtés peuvent supprimer.
export const removeFriend = async (friendshipId) => {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
  if (error) throw new FriendshipsError('Erreur suppression', { cause: error })
}

// =============================================================================
// Phase B — Bloqués (RPC server-side)
// =============================================================================
// Les 3 fonctions ci-dessous wrappent les RPCs SECURITY DEFINER définies par
// la migration SQL Phase B. Elles centralisent les opérations cross-table
// (friendships + chat_messages + notifications) qui ne peuvent pas être
// faites en un seul roundtrip côté client tout en respectant la RLS.

// Bloque un user. La RPC supprime toute friendship existante + insert une
// row blocked + supprime nos messages échangés + retire mes notifs liées.
// L'utilisateur cible n'est pas notifié et ne sait pas qu'il a été bloqué
// (à part qu'il ne reçoit plus rien de moi — cf. RLS chat_messages_select).
export const blockUser = async (targetUuid) => {
  if (!targetUuid) throw new FriendshipsError('targetUuid requis')
  const { error } = await supabase.rpc('block_user', { target_uuid: targetUuid })
  if (error) throw new FriendshipsError('Erreur blocage', { cause: error })
}

// Débloque un user. Retire la row blocked où je suis le requester.
// Ne récrée PAS l'amitié supprimée par block_user — si on veut redevenir
// amis il faut renvoyer une demande via sendFriendRequest.
export const unblockUser = async (targetUuid) => {
  if (!targetUuid) throw new FriendshipsError('targetUuid requis')
  const { error } = await supabase.rpc('unblock_user', { target_uuid: targetUuid })
  if (error) throw new FriendshipsError('Erreur déblocage', { cause: error })
}

// Liste mes bloqués avec leurs profils (joins auth.users côté server).
// Returns Array<{ user_id, blocked_at, email, name, avatar_url }>.
export const listBlockedUsers = async () => {
  const { data, error } = await supabase.rpc('list_blocked_users')
  if (error) throw new FriendshipsError('Erreur chargement bloqués', { cause: error })
  return data || []
}