// Edge Function admin-users — proxy owner-only vers les opérations auth.admin.*
//
// Flow :
//   1. Reçoit une requête POST avec JWT dans Authorization: Bearer <jwt>
//      et un body { action: string, ...params }
//   2. Vérifie le JWT cryptographiquement via supabase.auth.getUser(jwt)
//   3. Vérifie que le caller est owner (email dans OWNER_EMAILS hardcodé
//      OU user_metadata.is_owner === true)
//   4. Si OK, instancie un client service_role et exécute l'action
//   5. Journalise dans admin_audit_log
//
// Déployer avec --no-verify-jwt pour qu'on puisse contrôler le rejet 403
// nous-mêmes (sinon Supabase rejette en amont avant qu'on puisse check owner).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

// ⚠️ DOIT matcher exactement la liste de src/lib/user/userRoles.js côté client.
// Modifier les deux endroits ensemble lors d'un changement.
const OWNER_EMAILS = [
  'jacobveilleux09@gmail.com',
]

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

// CORS — ouvert parce que l'auth se fait via Authorization header, pas cookie.
// Si tu veux restreindre, remplace '*' par ton domaine de prod.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Check d'identité owner — DOIT matcher la logique de src/lib/user/userRoles.js.
function isOwner(user: User | null | undefined): boolean {
  if (!user) return false
  const email = (user.email || '').toLowerCase()
  if (email && OWNER_EMAILS.some((e) => e.toLowerCase() === email)) return true
  if (user.user_metadata?.is_owner === true) return true
  return false
}

// Insère une row d'audit. Best-effort — on ne fait pas échouer l'action
// principale si l'audit log échoue (mais on log côté serveur pour debug).
async function audit(
  admin: SupabaseClient,
  actor: User,
  action: string,
  target: User | null | undefined,
  payload: Record<string, unknown> | null,
) {
  const { error } = await admin.from('admin_audit_log').insert({
    actor_id: actor.id,
    actor_email: actor.email,
    action,
    target_user_id: target?.id || null,
    target_email: target?.email || null,
    payload,
  })
  if (error) console.error('[admin-users] audit insert failed', error)
}

serve(async (req) => {
  // Pré-flight CORS
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    // ─────────────────── Auth + owner check ───────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No auth' }, 401)
    const jwt = authHeader.slice('Bearer '.length)

    // Client lié au JWT du caller — pour valider l'identité.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401)
    const caller = userData.user
    if (!isOwner(caller)) {
      console.warn('[admin-users] non-owner attempted access', { id: caller.id, email: caller.email })
      return json({ error: 'Forbidden — owner only' }, 403)
    }

    // Client service_role — bypass RLS, accès complet à auth.admin.*
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // ─────────────────── Dispatch ───────────────────
    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    switch (action) {
      case 'list_users': {
        const page = Number(body.page) || 1
        const perPage = Math.min(Number(body.perPage) || 50, 200)
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
        if (error) throw error
        const filter = (body.filter || '').toString().toLowerCase().trim()
        const filtered = filter
          ? data.users.filter((u) => (u.email || '').toLowerCase().includes(filter))
          : data.users
        return json({ users: filtered, page, perPage, total: (data as { total?: number }).total ?? null })
      }

      case 'search_user': {
        const email = (body.email || '').toString().toLowerCase().trim()
        if (!email) return json({ error: 'email required' }, 400)
        // L'API n'expose pas un getUserByEmail direct → paginate jusqu'à match.
        // Limite : 10 pages × 200 = 2000 users max scannés. Largement suffisant
        // pour un usage owner-only ; si tu dépasses, faut une RPC SQL dédiée.
        let foundUser: User | null = null
        let page = 1
        const perPage = 200
        while (page <= 10 && !foundUser) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
          if (error) throw error
          foundUser = data.users.find((u) => (u.email || '').toLowerCase() === email) || null
          if (data.users.length < perPage) break
          page++
        }
        return json({ user: foundUser })
      }

      case 'set_role': {
        const userId = body.userId as string
        if (!userId) return json({ error: 'userId required' }, 400)
        const { data: targetData, error: getErr } = await admin.auth.admin.getUserById(userId)
        if (getErr) throw getErr
        const target = targetData?.user
        if (!target) return json({ error: 'User not found' }, 404)
        // Merge : on préserve les autres champs metadata (avatar_url, full_name, etc.)
        // et on overwrite seulement les 3 champs de rôle.
        const next = {
          ...(target.user_metadata || {}),
          role: body.role || null,
          school_role: body.schoolRole ?? body.school_role ?? null,
          custom_role: body.customRole ?? body.custom_role ?? null,
        }
        const { data, error } = await admin.auth.admin.updateUserById(userId, { user_metadata: next })
        if (error) throw error
        await audit(admin, caller, 'set_role', target, { role: next.role, school_role: next.school_role })
        return json({ user: data.user })
      }

      case 'set_owner': {
        const userId = body.userId as string
        const isOwnerNext = !!body.isOwner
        if (!userId) return json({ error: 'userId required' }, 400)
        const { data: targetData, error: getErr } = await admin.auth.admin.getUserById(userId)
        if (getErr) throw getErr
        const target = targetData?.user
        if (!target) return json({ error: 'User not found' }, 404)
        const next = { ...(target.user_metadata || {}), is_owner: isOwnerNext }
        const { data, error } = await admin.auth.admin.updateUserById(userId, { user_metadata: next })
        if (error) throw error
        await audit(admin, caller, isOwnerNext ? 'grant_owner' : 'revoke_owner', target, null)
        return json({ user: data.user })
      }

      // ⭐ NOUVEAU — toggle premium d'un autre compte (user_metadata.is_premium).
      // Même pattern que set_owner : merge metadata pour préserver les autres
      // champs. Les owners/dev restent premium d'office côté client via
      // isPremium() ; ce flag sert pour tous les autres comptes (et, plus tard,
      // le webhook Stripe écrira ici).
      case 'set_premium': {
        const userId = body.userId as string
        const isPremiumNext = !!body.isPremium
        if (!userId) return json({ error: 'userId required' }, 400)
        const { data: targetData, error: getErr } = await admin.auth.admin.getUserById(userId)
        if (getErr) throw getErr
        const target = targetData?.user
        if (!target) return json({ error: 'User not found' }, 404)
        const next = { ...(target.user_metadata || {}), is_premium: isPremiumNext }
        const { data, error } = await admin.auth.admin.updateUserById(userId, { user_metadata: next })
        if (error) throw error
        await audit(admin, caller, isPremiumNext ? 'grant_premium' : 'revoke_premium', target, null)
        return json({ user: data.user })
      }

      case 'ban_user': {
        const userId = body.userId as string
        if (!userId) return json({ error: 'userId required' }, 400)
        if (userId === caller.id) return json({ error: 'Cannot ban yourself' }, 400)
        const { data: targetData } = await admin.auth.admin.getUserById(userId)
        const target = targetData?.user
        if (!target) return json({ error: 'User not found' }, 404)
        // Format ban_duration : '24h', '720h', '876000h' (~100 ans = ban perma)
        const duration = (body.duration as string) || '876000h'
        // @ts-expect-error ban_duration n'est pas dans les types publics mais accepté
        const { data, error } = await admin.auth.admin.updateUserById(userId, { ban_duration: duration })
        if (error) throw error
        await audit(admin, caller, 'ban_user', target, { duration })
        return json({ user: data.user })
      }

      case 'unban_user': {
        const userId = body.userId as string
        if (!userId) return json({ error: 'userId required' }, 400)
        const { data: targetData } = await admin.auth.admin.getUserById(userId)
        const target = targetData?.user
        if (!target) return json({ error: 'User not found' }, 404)
        // @ts-expect-error ban_duration accepted but not in public types
        const { data, error } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })
        if (error) throw error
        await audit(admin, caller, 'unban_user', target, null)
        return json({ user: data.user })
      }

      case 'delete_user': {
        const userId = body.userId as string
        if (!userId) return json({ error: 'userId required' }, 400)
        if (userId === caller.id) return json({ error: 'Cannot delete yourself via admin API' }, 400)
        const { data: targetData } = await admin.auth.admin.getUserById(userId)
        const target = targetData?.user
        if (!target) return json({ error: 'User not found' }, 404)
        // Garde-fou : empêcher la suppression d'un owner hardcodé.
        const targetEmail = (target.email || '').toLowerCase()
        if (OWNER_EMAILS.some((e) => e.toLowerCase() === targetEmail)) {
          return json({ error: 'Cannot delete a hardcoded owner' }, 400)
        }
        // Audit AVANT delete — sinon on perd la trace si l'opération réussit.
        await audit(admin, caller, 'delete_user', target, null)
        const { error } = await admin.auth.admin.deleteUser(userId)
        if (error) throw error
        return json({ ok: true })
      }

      case 'list_audit': {
        const limit = Math.min(Number(body.limit) || 50, 500)
        const { data, error } = await admin
          .from('admin_audit_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) throw error
        return json({ entries: data || [] })
      }

      // ──────────────────── Messages système ────────────────────
      // Voir public.system_messages + public.deliver_system_message dans
      // "Phase Admin — Backend setup". L'envoi immédiat insère la row puis
      // appelle deliver_system_message(id) pour fan-out vers notifications.
      // L'envoi programmé insère juste la row ; le cron pg_cron
      // process_scheduled_system_messages() la délivre quand l'heure arrive.
      case 'send_system_message': {
        const title = (body.title || '').toString().trim()
        const bodyText = (body.body || '').toString().trim()
        const mode = body.recipientMode === 'specific' ? 'specific' : 'all'
        const recipientIds = Array.isArray(body.recipientUserIds) ? body.recipientUserIds : null
        if (!title || !bodyText) return json({ error: 'title + body required' }, 400)
        if (mode === 'specific' && (!recipientIds || recipientIds.length === 0)) {
          return json({ error: 'recipientUserIds required for specific mode' }, 400)
        }
        const { data: ins, error: insErr } = await admin.from('system_messages').insert({
          sender_id: caller.id,
          sender_email: caller.email,
          title,
          body: bodyText,
          recipient_mode: mode,
          recipient_user_ids: mode === 'specific' ? recipientIds : null,
          scheduled_for: null,
        }).select().single()
        if (insErr) throw insErr
        const { data: deliv, error: delivErr } = await admin.rpc('deliver_system_message', { p_msg_id: ins.id })
        if (delivErr) throw delivErr
        await audit(admin, caller, 'send_system_message', null, {
          message_id: ins.id, recipient_mode: mode, delivered: deliv,
        })
        return json({ message: { ...ins, status: 'sent', delivered_count: deliv } })
      }

      case 'schedule_system_message': {
        const title = (body.title || '').toString().trim()
        const bodyText = (body.body || '').toString().trim()
        const mode = body.recipientMode === 'specific' ? 'specific' : 'all'
        const recipientIds = Array.isArray(body.recipientUserIds) ? body.recipientUserIds : null
        const scheduledFor = body.scheduledFor as string
        if (!title || !bodyText) return json({ error: 'title + body required' }, 400)
        if (!scheduledFor) return json({ error: 'scheduledFor required' }, 400)
        if (new Date(scheduledFor).getTime() <= Date.now()) {
          return json({ error: 'scheduledFor must be in the future' }, 400)
        }
        if (mode === 'specific' && (!recipientIds || recipientIds.length === 0)) {
          return json({ error: 'recipientUserIds required for specific mode' }, 400)
        }
        const { data: ins, error: insErr } = await admin.from('system_messages').insert({
          sender_id: caller.id,
          sender_email: caller.email,
          title,
          body: bodyText,
          recipient_mode: mode,
          recipient_user_ids: mode === 'specific' ? recipientIds : null,
          scheduled_for: scheduledFor,
        }).select().single()
        if (insErr) throw insErr
        await audit(admin, caller, 'schedule_system_message', null, {
          message_id: ins.id, scheduled_for: scheduledFor, recipient_mode: mode,
        })
        return json({ message: ins })
      }

      case 'list_system_messages': {
        const limit = Math.min(Number(body.limit) || 50, 200)
        const { data, error } = await admin
          .from('system_messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) throw error
        return json({ messages: data || [] })
      }

      case 'cancel_system_message': {
        const messageId = body.messageId as string
        if (!messageId) return json({ error: 'messageId required' }, 400)
        // On annule seulement les messages encore pending. Si déjà sent /
        // cancelled, le UPDATE ne matche aucune row et data sera null.
        const { data, error } = await admin
          .from('system_messages')
          .update({ status: 'cancelled' })
          .eq('id', messageId)
          .eq('status', 'pending')
          .select()
          .maybeSingle()
        if (error) throw error
        if (!data) return json({ error: 'Message not pending or not found' }, 404)
        await audit(admin, caller, 'cancel_system_message', null, { message_id: messageId })
        return json({ message: data })
      }

      default:
        return json({ error: `Unknown action: ${action || '(none)'}` }, 400)
    }
  } catch (err) {
    // Extraction robuste : PostgrestError et autres objets d'erreur Supabase ne
    // sont PAS instanceof Error en Deno. String(obj) donne "[object Object]".
    // On déballe dans cet ordre : .message > .error_description > JSON.stringify.
    let message: string
    let details: unknown = null
    if (err instanceof Error) {
      message = err.message
      details = { name: err.name, stack: err.stack }
    } else if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>
      message = (typeof e.message === 'string' && e.message)
        || (typeof e.error_description === 'string' && e.error_description)
        || (typeof e.hint === 'string' && e.hint)
        || JSON.stringify(err)
      details = {
        code: e.code,
        hint: e.hint,
        details: e.details,
        statusCode: e.statusCode,
      }
    } else {
      message = String(err)
    }
    console.error('[admin-users] error', err)
    return json({ error: message, details }, 500)
  }
})