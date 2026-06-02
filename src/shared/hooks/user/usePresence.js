import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from "@/shared/lib/infra/supabase"
import { colorForUserId, initialsFromName } from "@/shared/lib/social/presenceColor"

const CURSOR_THROTTLE_MS = 50 // 20 Hz max — équilibre fluidité / charge réseau

/**
 * Hook React pour la présence multi-user dans un document JacPDF.
 * @param {string|null|undefined} documentId
 */
export function usePresence(documentId) {
  const [presentUsers, setPresentUsers] = useState([])
  const channelRef = useRef(null)
  const myInfoRef = useRef(null)

  // Throttle state pour le broadcast du curseur
  const lastCursorSentRef = useRef(0)
  const cursorThrottleTimerRef = useRef(null)
  const pendingCursorRef = useRef(undefined) // undefined = rien en attente

  useEffect(() => {
    if (!documentId) {
      setPresentUsers([])
      return
    }
    let cancelled = false
    let currentChannel = null
    let reconnectTimer = null
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 5

    // ⚠️ Pattern SYNCHRONE + auto-reconnect sur CLOSED inattendu.
    //
    // Pourquoi synchrone : si on awaitait getUser/getSession AVANT de créer
    // le channel, le useEffect cleanup pourrait tourner pendant le await
    // (StrictMode, re-mount) avec channel=null, donc removeChannel ne ferait
    // rien et la 2e mount racerait avec une 1re mount fantôme. Ici on crée
    // le channel et on appelle subscribe() immédiatement, comme le mirror.
    //
    // Pourquoi auto-reconnect : sur le tab qui vient de redeem un share
    // token (typiquement B), Supabase rotate l'auth token juste après la
    // session set, et le client realtime ré-auth automatiquement → tous les
    // channels en cours reçoivent CLOSED juste après leur 1er track. Sans
    // reconnect, on reste avec un channel mort et B n'apparait jamais chez
    // A. Avec reconnect on recrée le channel, qui se subscribe dans le bon
    // contexte d'auth cette fois et reste ouvert. Le mirror semble ne pas
    // souffrir de ce symptôme parce que postgres_changes resilie différemment
    // au cycle de reconnect (pas d'état à republier comme presence.track).
    //
    // Cap à 5 essais pour éviter une boucle infinie si le channel ferme
    // systématiquement (ex: problème réseau persistant).
    const setupChannel = () => {
      if (cancelled) return

      const topic = `presence:doc:${documentId}`
      // Defensive cleanup : retire tout channel zombie pour ce topic avant
      // d'en créer un nouveau. En dev (StrictMode double-mount, HMR), le
      // cleanup de la mount précédente peut ne pas avoir fini d'exécuter
      // supabase.removeChannel() au moment où on arrive ici → le client
      // garde le channel déjà-subscribed dans son registre interne, et
      // supabase.channel(topic) retourne ce zombie. Le .on('presence', …)
      // qui suit plante alors avec
      //   « cannot add 'presence' callbacks for realtime:presence:doc:… after subscribe() »
      // et fait crasher EditorInstance → page blanche.
      //
      // On ne peut PAS utiliser un topic unique par mount comme le mirror,
      // parce que la présence dépend du topic partagé (sinon les clients
      // ne se voient pas mutuellement). On nettoie donc le registre à la
      // main : itrer getChannels() et remove tout match. Le client SDK
      // préfixe les topics avec « realtime: » en interne — on accepte les
      // deux formes pour être robuste aux versions du SDK.
      try {
        const channels = supabase.getChannels?.() || []
        for (const c of channels) {
          if (c?.topic === topic || c?.topic === `realtime:${topic}`) {
            supabase.removeChannel(c)
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[presence] zombie cleanup failed', err)
      }

      const channel = supabase.channel(topic)
      currentChannel = channel
      channelRef.current = channel
      // Guard : un channel peut émettre CLOSED plusieurs fois (post-track
      // CLOSED puis un 2e CLOSED quand le serveur confirme la fermeture).
      // Sans ce flag, chaque CLOSED schedule un reconnect → plusieurs
      // setupChannel concurrents → supabase.channel(topic) retourne un
      // channel déjà subscribed pour le 2e appel → erreur « cannot add
      // 'presence' callbacks after subscribe() ». Ce flag garantit qu'un
      // channel donné ne déclenche qu'UN reconnect.
      let reconnectScheduled = false

      const updatePresent = (eventName) => {
        if (cancelled) return
        const state = channel.presenceState()
        const keys = Object.keys(state)
        if (import.meta.env.DEV) console.log('[presence] event', eventName || '?', '— keys:', keys.length, keys)
        // ⚠️ Skip le setPresentUsers sur subscribed-immediate-read : juste
        // après SUBSCRIBED, le serveur n'a pas encore envoyé le sync donc
        // presenceState() est vide. Si on écrit []  ici, l'UI flash vide à
        // chaque cycle de reconnect (symptôme observé sur B : avatar de A
        // disparaît entre les CLOSED → SUBSCRIBED). On laisse l'état
        // précédent en place et on le mettra à jour au prochain sync réel.
        if (eventName === 'subscribed-immediate-read') return
        // Dédupe par user_id : si plusieurs onglets pour le même user, on
        // garde la dernière entrée (la plus à jour parce que chaque track()
        // remplace le payload précédent).
        const byId = new Map()
        for (const key in state) {
          for (const meta of state[key]) {
            byId.set(meta.id, meta)
          }
        }
        const users = Array.from(byId.values())
        if (import.meta.env.DEV) console.log('[presence] users now:', users.map(u => u.email))
        setPresentUsers(users)
      }

      channel
        .on('presence', { event: 'sync' }, () => updatePresent('sync'))
        .on('presence', { event: 'join' }, () => updatePresent('join'))
        .on('presence', { event: 'leave' }, () => updatePresent('leave'))
        .subscribe(async (status) => {
          if (import.meta.env.DEV) console.log('[presence] status', status, 'doc:' + documentId, 'attempt=' + reconnectAttempts)
          if (status === 'SUBSCRIBED' && !cancelled) {
            // Lit immédiatement l'état présence — même si le channel ferme
            // juste après le track, on aura au moins capturé qui était là
            // avant. Sur B (cycling), c'est notre seule chance de voir A
            // entre le SUBSCRIBED et le CLOSED post-track.
            updatePresent('subscribed-immediate-read')
            // ⚠️ On NE reset PAS reconnectAttempts ici : si le channel cycle
            // SUBSCRIBED → tracked → CLOSED en boucle (symptôme observé sur B
            // post-share-redemption), reset à 0 chaque SUBSCRIBED ferait
            // boucler infiniment. Sans reset, on hit MAX_RECONNECT_ATTEMPTS
            // après 5 cycles et on stoppe. La présence sera dégradée mais le
            // navigateur de B ne saturera pas en WS connections.
            // getSession (PAS getUser) : getUser() valide le JWT côté serveur
            // et peut déclencher un token refresh → reconnect realtime → le
            // channel ferme juste après le track. getSession lit le cache
            // local sans appel serveur.
            const { data } = await supabase.auth.getSession()
            if (cancelled || currentChannel !== channel) return
            const session = data?.session
            const user = session?.user
            // ⚠️ Explicitement set realtime auth avant le track. Sur le tab
            // qui vient de redeem un share token (B), le realtime client peut
            // ne pas avoir été mis à jour avec le nouveau JWT au moment de
            // notre subscribe — il utilise alors les credentials anonymes,
            // et le serveur ferme le channel après le presence.track parce
            // que les anonymes ne peuvent pas track avec un user.id valide.
            // setAuth(token) garantit que le WS est authentifié avec la
            // bonne session avant qu'on track. Idempotent : si le token est
            // déjà à jour, c'est un no-op côté SDK (pas de reconnect).
            if (session?.access_token && supabase.realtime?.setAuth) {
              try {
                supabase.realtime.setAuth(session.access_token)
              } catch (err) {
                if (import.meta.env.DEV) console.warn('[presence] setAuth failed', err)
              }
            }
            if (!user) {
              if (import.meta.env.DEV) console.log('[presence] anonymous — no track sent')
              return
            }
            const name = user.user_metadata?.full_name
              || user.user_metadata?.name
              || user.email?.split('@')[0]
              || 'Anonyme'
            // avatarUrl : photo de profil. Supabase OAuth Google la remplit
            // dans user_metadata.avatar_url ou .picture. Null pour les comptes
            // sans photo → fallback initiales dans PresenceAvatars.
            const avatarUrl = user.user_metadata?.avatar_url
              || user.user_metadata?.picture
              || null
            const myInfo = {
              id: user.id,
              name,
              email: user.email || '',
              color: colorForUserId(user.id),
              initials: initialsFromName(name, user.email),
              avatarUrl,
            }
            myInfoRef.current = myInfo
            // isActive : style Kami — true quand le tab du PDF est VISIBLE
            // (pas en arrière-plan / pas minimisé). On utilise UNIQUEMENT
            // visibilityState et PAS document.hasFocus() : avec deux fenêtres
            // côte à côte (cas Jacob qui teste sur deux profils Brave), seule
            // celle où on a cliqué en dernier a le focus → l'autre perdait
            // son point vert alors qu'elle est bien visible et utilisable.
            // Avec visibilityState seul, les deux fenêtres affichées côte à
            // côte ont toutes les deux leur point vert simultanément.
            const isActive = document.visibilityState === 'visible'
            await channel.track({ ...myInfo, cursor: null, isActive })
            if (import.meta.env.DEV) console.log('[presence] tracked', myInfo.email, 'isActive=' + isActive, 'on doc:' + documentId)
          }
          if (status === 'CLOSED' && !cancelled && currentChannel === channel && !reconnectScheduled) {
            // Channel fermé alors qu'on est encore montés → reconnect.
            // reconnectScheduled assure qu'un même channel ne déclenche
            // qu'un seul reconnect, même s'il émet CLOSED plusieurs fois.
            reconnectScheduled = true
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
              if (import.meta.env.DEV) console.warn('[presence] max reconnect attempts reached — giving up')
              return
            }
            reconnectAttempts++
            // Backoff exponentiel : 500ms, 1s, 2s, 4s, 8s.
            const delay = 500 * Math.pow(2, reconnectAttempts - 1)
            if (import.meta.env.DEV) console.log('[presence] reconnecting in ' + delay + 'ms (attempt ' + reconnectAttempts + '/' + MAX_RECONNECT_ATTEMPTS + ')')
            reconnectTimer = setTimeout(() => {
              if (cancelled) return
              // Retire le channel mort du registre Supabase avant d'en créer un
              // nouveau — sinon le client peut renvoyer le même zombie.
              supabase.removeChannel(channel)
              setupChannel()
            }, delay)
          }
        })
    }

    setupChannel()

    // Re-track sur visibilitychange / focus / blur pour mettre à jour
    // isActive style Kami. Si le user passe sur un autre onglet/fenêtre,
    // l'avatar perd son point vert chez les autres ; quand il revient, le
    // point vert réapparaît. On lit myInfoRef.current pour le payload
    // (myInfo a été défini dans le SUBSCRIBED callback), et channelRef.current
    // pour le channel actuel (suit le reconnect).
    const onActivityChange = () => {
      const ch = channelRef.current
      const info = myInfoRef.current
      if (!ch || !info) return
      // visibilityState seul (cf. même note dans le bloc SUBSCRIBED).
      const isActive = document.visibilityState === 'visible'
      ch.track({ ...info, cursor: null, isActive }).catch(() => {})
      if (import.meta.env.DEV) console.log('[presence] activity change → isActive=' + isActive)
    }
    document.addEventListener('visibilitychange', onActivityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onActivityChange)
      if (cursorThrottleTimerRef.current) {
        clearTimeout(cursorThrottleTimerRef.current)
        cursorThrottleTimerRef.current = null
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      // removeChannel (pas unsubscribe) : retire le channel du registre interne
      // du client Supabase pour qu'un prochain mount avec le même nom obtienne
      // un nouveau channel propre — cf. useAnnotationsCloudMirror.
      if (currentChannel) {
        supabase.removeChannel(currentChannel)
      }
      channelRef.current = null
      setPresentUsers([])
    }
  }, [documentId])

  /**
   * Broadcast la position du curseur. Throttle 50 ms = 20 Hz max.
   * Les appels qui tombent dans la fenêtre de throttle sont coalescés : on
   * garde la position la plus récente dans `pendingCursorRef` et on l'envoie
   * au timeout. Résultat : pas de spam réseau, et le dernier mouvement est
   * toujours envoyé (évite que le curseur reste figé chez les autres).
   *
   * cursor = { pageIndex, pdfX, pdfY } | null
   * (null quand le curseur quitte les pages PDF — affiche aucun curseur côté autres)
   */
  const updateCursor = useCallback((cursor) => {
    if (!channelRef.current || !myInfoRef.current) return

    pendingCursorRef.current = cursor
    const now = Date.now()
    const elapsed = now - lastCursorSentRef.current

    if (elapsed >= CURSOR_THROTTLE_MS) {
      // Hors fenêtre de throttle → envoie tout de suite
      channelRef.current.track({ ...myInfoRef.current, cursor })
      lastCursorSentRef.current = now
      pendingCursorRef.current = undefined
    } else if (!cursorThrottleTimerRef.current) {
      // Dans la fenêtre → schedule l'envoi à la fin de la fenêtre. Si
      // d'autres updateCursor arrivent entretemps, ils mettent à jour
      // pendingCursorRef et c'est la dernière position qui sera envoyée.
      cursorThrottleTimerRef.current = setTimeout(() => {
        cursorThrottleTimerRef.current = null
        if (channelRef.current && pendingCursorRef.current !== undefined) {
          channelRef.current.track({ ...myInfoRef.current, cursor: pendingCursorRef.current })
          lastCursorSentRef.current = Date.now()
          pendingCursorRef.current = undefined
        }
      }, CURSOR_THROTTLE_MS - elapsed)
    }
  }, [])

  return { presentUsers, updateCursor, myInfo: myInfoRef.current }
}