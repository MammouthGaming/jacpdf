// Section Admin (owner-only) — extraite de FullSettingsModal.jsx.
// Console owner : recherche/édition d'utilisateurs, ban, suppression,
// journal d'audit, messages système. Tous les appels passent par
// lib/infra/adminApi qui POST vers l'Edge Function 'admin-users'.
// L'EF re-vérifie isOwner() côté serveur — défense en profondeur.
import { useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import { getHardcodedOwnerEmails } from '@/shared/lib/user/userRoles'
import * as adminApi from '@/shared/lib/infra/adminApi'
import FsmSelect from '../shared/FsmSelect'
import '../FullSettingsModal.css'

export default function AdminSection({ user, setAccountInfo }) {
  // ═══════ État ═══════
  // Recherche par email + résultat courant + busy + journal d'audit + info.
  const [adminSearchEmail, setAdminSearchEmail] = useState('')
  const [adminFoundUser, setAdminFoundUser] = useState(null)
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminInfo, setAdminInfo] = useState('')
  const [adminAuditEntries, setAdminAuditEntries] = useState([])
  // Liste complète des utilisateurs (chargée via le bouton « Voir tous »).
  // Vide par défaut ; on ne fetch pas au mount pour ne pas spammer l'EF.
  const [adminAllUsers, setAdminAllUsers] = useState([])
  // Filtre status + tri appliqués à adminAllUsers côté client. Liste cappée
  // à 100 entrées par adminLoadAll → on évite un re-fetch à chaque changement.
  const [adminFilterStatus, setAdminFilterStatus] = useState('all') // 'all' | 'owners' | 'banned' | 'unverified'
  const [adminSortBy, setAdminSortBy] = useState('createdDesc')      // 'createdDesc' | 'createdAsc' | 'lastSignIn' | 'email'
  // Messages système — composer + historique. Mode destinataire :
  //   'all'        : tous les utilisateurs (résolu côté DB à la livraison)
  //   'allLoaded'  : tous ceux présents dans adminAllUsers (snapshot client)
  //   'multi'      : sélection individuelle via checkboxes
  const [sysMsgRecipients, setSysMsgRecipients] = useState('all')
  const [sysMsgTitle, setSysMsgTitle] = useState('')
  const [sysMsgBody, setSysMsgBody] = useState('')
  const [sysMsgScheduledFor, setSysMsgScheduledFor] = useState('') // value du <input type="datetime-local">
  const [sysMsgList, setSysMsgList] = useState([])
  const [sysMsgBusy, setSysMsgBusy] = useState(false)
  const [adminSelectedIds, setAdminSelectedIds] = useState(() => new Set())
  const toggleAdminSelectedId = (id) => {
    setAdminSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  // Recherche par email exact via l'EF (scan paginé serveur, stop au 1er match).
  const adminSearch = async () => {
    const email = adminSearchEmail.trim()
    if (!email) return
    setAdminBusy(true)
    setAdminInfo('')
    try {
      const { user: u } = await adminApi.searchUserByEmail(email)
      setAdminFoundUser(u || null)
      if (!u) setAdminInfo(`Aucun utilisateur trouvé pour ${email}.`)
    } catch (err) {
      setAdminInfo(`Erreur : ${err?.message || err}`)
    } finally {
      setAdminBusy(false)
    }
  }
  // Re-fetch silencieux après une mutation (set_role, set_owner, ban…).
  const adminRefreshFound = async () => {
    if (!adminFoundUser?.email) return
    try {
      const { user: u } = await adminApi.searchUserByEmail(adminFoundUser.email)
      setAdminFoundUser(u || null)
    } catch { /* silent */ }
  }
  // Charge la liste complète (jusqu'à 100). Clic sur une row → adminFoundUser.
  const adminLoadAll = async () => {
    setAdminBusy(true)
    setAdminInfo('')
    try {
      const { users } = await adminApi.listUsers({ perPage: 100 })
      setAdminAllUsers(users || [])
      if (!users || users.length === 0) setAdminInfo('Aucun utilisateur trouvé.')
    } catch (err) {
      setAdminInfo(`Erreur : ${err?.message || err}`)
    } finally {
      setAdminBusy(false)
    }
  }
  // Charge les 50 dernières entrées du journal d'audit (lazy à l'ouverture).
  const adminLoadAudit = async () => {
    try {
      const { entries } = await adminApi.listAuditLog({ limit: 50 })
      setAdminAuditEntries(entries || [])
    } catch (err) {
      setAdminInfo(`Erreur audit : ${err?.message || err}`)
    }
  }
  // ===== Messages système =====
  // Résout le mode UI vers le payload EF. Throw si la sélection est vide.
  const resolveSysMsgRecipients = () => {
    if (sysMsgRecipients === 'all') {
      return { recipientMode: 'all', recipientUserIds: null }
    }
    if (sysMsgRecipients === 'allLoaded') {
      const ids = adminAllUsers.map((u) => u.id).filter(Boolean)
      if (ids.length === 0) throw new Error('Charge d’abord la liste avec « Voir tous ».')
      return { recipientMode: 'specific', recipientUserIds: ids }
    }
    if (sysMsgRecipients === 'multi') {
      const ids = Array.from(adminSelectedIds)
      if (ids.length === 0) throw new Error('Coche au moins un utilisateur dans la liste.')
      return { recipientMode: 'specific', recipientUserIds: ids }
    }
    throw new Error(`Mode destinataire inconnu : ${sysMsgRecipients}`)
  }
  const adminSendOrScheduleMessage = async () => {
    const title = sysMsgTitle.trim()
    const body = sysMsgBody.trim()
    if (!title || !body) {
      setAdminInfo('Titre et message requis.')
      return
    }
    setSysMsgBusy(true)
    setAdminInfo('')
    try {
      const { recipientMode, recipientUserIds } = resolveSysMsgRecipients()
      if (sysMsgScheduledFor) {
        // datetime-local renvoie 'YYYY-MM-DDTHH:mm' sans timezone — on convertit
        // en ISO complet via new Date() qui interprète en local time.
        const iso = new Date(sysMsgScheduledFor).toISOString()
        await adminApi.scheduleSystemMessage({ title, body, recipientMode, recipientUserIds, scheduledFor: iso })
        setAdminInfo(`Message programmé pour ${new Date(iso).toLocaleString('fr-CA')}.`)
      } else {
        const { message } = await adminApi.sendSystemMessage({ title, body, recipientMode, recipientUserIds })
        setAdminInfo(`Message envoyé à ${message?.delivered_count ?? '?'} destinataire(s).`)
      }
      setSysMsgTitle('')
      setSysMsgBody('')
      setSysMsgScheduledFor('')
      adminLoadSystemMessages()
    } catch (err) {
      setAdminInfo(`Erreur : ${err?.message || err}`)
    } finally {
      setSysMsgBusy(false)
    }
  }
  const adminLoadSystemMessages = async () => {
    try {
      const { messages } = await adminApi.listSystemMessages({ limit: 50 })
      setSysMsgList(messages || [])
    } catch (err) {
      setAdminInfo(`Erreur historique : ${err?.message || err}`)
    }
  }
  const adminCancelSystemMessageHandler = async (messageId) => {
    if (!window.confirm('Annuler ce message programmé ? Il ne sera pas délivré.')) return
    try {
      await adminApi.cancelSystemMessage(messageId)
      setAdminInfo('Message annulé.')
      adminLoadSystemMessages()
    } catch (err) {
      setAdminInfo(`Erreur : ${err?.message || err}`)
    }
  }

  return (
    <div className="fsm-section">
      {/* === Hero card moderne === */}
      <div style={ {
        background: 'linear-gradient(135deg, rgba(234,179,8,0.13) 0%, rgba(99,102,241,0.09) 100%)',
        border: '1px solid rgba(234,179,8,0.28)',
        borderRadius: 14,
        padding: '20px 24px',
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
      } }>
        <div style={ { position: 'absolute', right: -28, top: -28, fontSize: 140, opacity: 0.05, pointerEvents: 'none', userSelect: 'none' } }>👑</div>
        <div style={ { position: 'relative', display: 'flex', alignItems: 'center', gap: 14 } }>
          <div style={ {
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, flexShrink: 0,
            boxShadow: '0 8px 24px rgba(234,179,8,0.35), 0 0 0 1px rgba(255,255,255,0.1) inset',
          } }>👑</div>
          <div style={ { flex: 1, minWidth: 0 } }>
            <h3 style={ { margin: 0, color: '#fff', fontSize: 20, fontWeight: 700, letterSpacing: '-0.015em' } }>Owner Console</h3>
            <p style={ { margin: '3px 0 0', color: '#9ca3af', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }>
              Connecté en tant que <span style={ { color: '#fde68a', fontWeight: 600 } }>{user?.email}</span>
            </p>
          </div>
        </div>
      </div>

      {/* === Stats grid — visible après un "Voir tous" === */}
      {adminAllUsers.length > 0 && (
        <div style={ { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 } }>
          {[
            { label: 'Utilisateurs', value: adminAllUsers.length, icon: '👥', color: '#a5b4fc' },
            { label: 'Owners', value: adminAllUsers.filter((u) => u.user_metadata?.is_owner || getHardcodedOwnerEmails().some((e) => e.toLowerCase() === (u.email || '').toLowerCase())).length, icon: '👑', color: '#fde68a' },
            { label: 'Bannis', value: adminAllUsers.filter((u) => u.banned_until && new Date(u.banned_until) > new Date()).length, icon: '🚫', color: '#fca5a5' },
            { label: 'Premium', value: adminAllUsers.filter((u) => u.user_metadata?.is_premium).length, icon: '💎', color: '#e9d5ff' },
          ].map((stat) => (
            <div key={stat.label} style={ {
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 14,
            } }>
              <div style={ { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 } }>
                <span style={ { fontSize: 14 } }>{stat.icon}</span>
                <span style={ { color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' } }>{stat.label}</span>
              </div>
              <div style={ { color: stat.color, fontSize: 26, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' } }>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* === Mon rôle === */}
      <div className="fsm-divider" />
      <h4 className="fsm-group-title">Mon rôle</h4>
      <div className="fsm-field">
        <label className="fsm-label">Rôle principal</label>
        <p className="fsm-label-sub">
          Défini lors de l'onboarding. Le changer met à jour <code>user_metadata.role</code> immédiatement et reflète sur le badge dans ProfileModal.
        </p>
        <FsmSelect
          value={user?.user_metadata?.role || ''}
          onChange={async (next) => {
            const { error } = await supabase.auth.updateUser({ data: { role: next || null } })
            if (error) setAccountInfo(`Erreur : ${error.message}`)
            else setAccountInfo(`Rôle mis à jour : ${next || '— non défini —'}.`)
          }}
          options={[
            { value: '', label: '— non défini —' },
            { value: 'personnel', label: 'Personnel', icon: '👤' },
            { value: 'travail', label: 'Travail', icon: '💼' },
            { value: 'ecole', label: 'École', icon: '🎓' },
            { value: 'autre', label: 'Autre', icon: '✨' },
          ]}
        />
      </div>
      {user?.user_metadata?.role === 'ecole' && (
        <div className="fsm-field">
          <label className="fsm-label">Rôle scolaire</label>
          <p className="fsm-label-sub">Visible uniquement quand le rôle principal est École.</p>
          <FsmSelect
            value={user?.user_metadata?.school_role || ''}
            onChange={async (next) => {
              const { error } = await supabase.auth.updateUser({ data: { school_role: next || null } })
              if (error) setAccountInfo(`Erreur : ${error.message}`)
              else setAccountInfo(`Rôle scolaire mis à jour : ${next || '— non défini —'}.`)
            }}
            options={[
              { value: '', label: '— non défini —' },
              { value: 'enseignant', label: 'Enseignant', icon: '👨‍🏫' },
              { value: 'eleve', label: 'Élève', icon: '🎒' },
              { value: 'autre', label: 'Autre', icon: '✨' },
            ]}
          />
        </div>
      )}
      {user?.user_metadata?.role === 'autre' && user?.user_metadata?.custom_role && (
        <div className="fsm-field">
          <label className="fsm-label">Rôle personnalisé</label>
          <p className="fsm-label-sub">Saisi pendant l'onboarding. Pour le modifier, refais l'onboarding.</p>
          <p style={ { color: '#d1d5db', fontStyle: 'italic', margin: '4px 0 0' } }>
            « {user.user_metadata.custom_role} »
          </p>
        </div>
      )}
      <button
        className="fsm-action-btn fsm-action-btn-inline"
        style={ { marginTop: 8 } }
        onClick={async () => {
          if (!window.confirm("Refaire l'onboarding ? Le pop-up de sélection de rôle réapparaîtra à la prochaine ouverture de l'écran d'accueil. Ton rôle actuel sera conservé tant que tu n'auras pas re-validé.")) return
          const { error } = await supabase.auth.updateUser({
            data: { onboarding_completed: false },
          })
          if (error) setAccountInfo(`Erreur : ${error.message}`)
          else setAccountInfo("Onboarding réinitialisé. Retourne sur l'écran d'accueil pour le pop-up.")
        }}
        title="Force le pop-up de RoleOnboardingModal à réapparaître au prochain accueil"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1 4 1 10 7 10"/>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
        </svg>
        Refaire l'onboarding
      </button>

      {/* === Statut Owner === */}
      <div className="fsm-divider" />
      <h4 className="fsm-group-title">Statut Owner</h4>
      <p className="fsm-label-sub" style={ { marginTop: -4, marginBottom: 12 } }>
        Deux mécanismes peuvent t'attribuer le rôle Owner : ton email est dans la liste hardcodée (source de vérité, immuable depuis l'UI), <strong>ou</strong> <code>user_metadata.is_owner</code> vaut <code>true</code> (toggle ci-dessous — utile pour tester sur un compte secondaire). Si l'un OU l'autre est vrai, tu es owner.
      </p>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">is_owner dans metadata</label>
          <p className="fsm-label-sub">
            {user?.user_metadata?.is_owner
              ? 'Activé — ce compte a is_owner=true dans user_metadata.'
              : "Désactivé — pas de flag explicite. (Si ton email est dans la liste hardcodée, tu restes owner quand même.)"}
          </p>
        </div>
        <button
          className={`fsm-toggle ${user?.user_metadata?.is_owner ? 'on' : ''}`}
          onClick={async () => {
            const cur = !!user?.user_metadata?.is_owner
            const { error } = await supabase.auth.updateUser({
              data: { is_owner: !cur },
            })
            if (error) setAccountInfo(`Erreur : ${error.message}`)
            else setAccountInfo(`is_owner = ${!cur}.`)
          }}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-field">
        <label className="fsm-label">Emails owner hardcodés</label>
        <p className="fsm-label-sub">
          Définis dans <code>src/shared/lib/user/userRoles.js</code>. Pour ajouter ou retirer un owner permanent, il faut modifier le code source et redéployer — un attaquant ne peut pas se faire owner via <code>updateUser</code>.
        </p>
        <ul style={ { margin: '4px 0 0', paddingLeft: 20, color: '#d1d5db', fontSize: 13, lineHeight: 1.8 } }>
          {getHardcodedOwnerEmails().map((email) => {
            const isMe = !!user?.email && email.toLowerCase() === user.email.toLowerCase()
            return (
              <li key={email}>
                <code style={ { background: 'rgba(0,0,0,0.25)', padding: '1px 6px', borderRadius: 4 } }>{email}</code>
                {isMe && (
                  <span style={ { marginLeft: 8, color: '#fde68a', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' } }>← TOI</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* === Gestion des utilisateurs (Edge Function admin-users) === */}
      <div className="fsm-divider" />
      <h4 className="fsm-group-title">Gestion des utilisateurs</h4>
      <p className="fsm-label-sub" style={ { marginTop: -4, marginBottom: 12 } }>
        Recherche, modifie ou bannit n'importe quel compte JacPDF. Toutes les actions passent par l'Edge Function <code>admin-users</code> qui re-vérifie côté serveur que l'appelant est owner avant d'utiliser la <code>service_role key</code>. Chaque action est journalisée dans <code>admin_audit_log</code>.
      </p>
      <div className="fsm-field">
        <label className="fsm-label">Rechercher par email</label>
        <div style={ { display: 'flex', gap: 8, alignItems: 'stretch' } }>
          <button
            onClick={adminLoadAll}
            disabled={adminBusy}
            style={ {
              flex: '0 0 auto',
              padding: '8px 14px',
              background: '#2a3347',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 6,
              cursor: adminBusy ? 'not-allowed' : 'pointer',
              opacity: adminBusy ? 0.5 : 1,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            } }
            title="Lister tous les utilisateurs (jusqu'à 100)"
          >
            Voir tous
          </button>
          <input
            type="text"
            autoComplete="off"
            style={ {
              flex: '1 1 auto',
              minWidth: 0,
              background: '#1e2535',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 14,
              fontWeight: 500,
              fontFamily: 'inherit',
              outline: 'none',
            } }
            value={adminSearchEmail}
            onChange={(e) => setAdminSearchEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') adminSearch() }}
            placeholder="utilisateur@exemple.com"
            disabled={adminBusy}
          />
          <button
            onClick={adminSearch}
            disabled={adminBusy || !adminSearchEmail.trim()}
            style={ {
              flex: '0 0 auto',
              padding: '8px 16px',
              background: '#2a3347',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 6,
              cursor: adminBusy || !adminSearchEmail.trim() ? 'not-allowed' : 'pointer',
              opacity: adminBusy || !adminSearchEmail.trim() ? 0.5 : 1,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            } }
          >
            {adminBusy ? 'Recherche…' : 'Rechercher'}
          </button>
        </div>
      </div>
      {adminInfo && (
        <p className="fsm-account-info" style={ { marginTop: 8 } }>{adminInfo}</p>
      )}
      {/* === Liste filtrable + triable + exportable === */}
      {adminAllUsers.length > 0 && (() => {
        const filtered = adminAllUsers.filter((u) => {
          if (adminFilterStatus === 'owners') return u.user_metadata?.is_owner || getHardcodedOwnerEmails().some((e) => e.toLowerCase() === (u.email || '').toLowerCase())
          if (adminFilterStatus === 'banned') return u.banned_until && new Date(u.banned_until) > new Date()
          if (adminFilterStatus === 'unverified') return !u.email_confirmed_at
          if (adminFilterStatus === 'premium') return u.user_metadata?.is_premium
          return true
        }).sort((a, b) => {
          if (adminSortBy === 'createdAsc') return new Date(a.created_at) - new Date(b.created_at)
          if (adminSortBy === 'lastSignIn') return new Date(b.last_sign_in_at || 0) - new Date(a.last_sign_in_at || 0)
          if (adminSortBy === 'email') return (a.email || '').localeCompare(b.email || '')
          return new Date(b.created_at) - new Date(a.created_at)
        })
        const exportJSON = () => {
          const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `jacpdf-users-${new Date().toISOString().slice(0, 10)}.json`
          document.body.appendChild(a); a.click(); document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }
        const fmtRelative = (iso) => {
          if (!iso) return 'jamais'
          const d = new Date(iso)
          const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
          if (diffMin < 1) return 'maintenant'
          if (diffMin < 60) return `il y a ${diffMin}m`
          const diffH = Math.round(diffMin / 60)
          if (diffH < 24) return `il y a ${diffH}h`
          const diffD = Math.round(diffH / 24)
          if (diffD < 30) return `il y a ${diffD}j`
          return d.toLocaleDateString('fr-CA')
        }
        return (
          <div style={ { marginTop: 12, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 } }>
            <div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' } }>
              <strong style={ { color: '#fff', fontSize: 14 } }>
                {filtered.length}<span style={ { color: '#9ca3af', fontWeight: 400 } }> / {adminAllUsers.length} utilisateur(s)</span>
              </strong>
              <div style={ { display: 'flex', gap: 6 } }>
                <button onClick={adminLoadAll} disabled={adminBusy} title="Recharger la liste" style={ { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#d1d5db', padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: adminBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: adminBusy ? 0.5 : 1 } }>↻ Recharger</button>
                <button onClick={exportJSON} title="Télécharger en JSON" style={ { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#d1d5db', padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' } }>⇓ Export JSON</button>
                <button onClick={() => setAdminAllUsers([])} title="Masquer la liste" style={ { background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' } }>Masquer</button>
              </div>
            </div>
            <div style={ { display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' } }>
              {[
                { id: 'all', label: 'Tous' },
                { id: 'owners', label: '👑 Owners' },
                { id: 'banned', label: '🚫 Bannis' },
                { id: 'unverified', label: '⚠ Non vérifiés' },
                { id: 'premium', label: '💎 Premium' },
              ].map((f) => {
                const active = adminFilterStatus === f.id
                return (
                  <button key={f.id} onClick={() => setAdminFilterStatus(f.id)} style={ {
                    background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid ' + (active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'),
                    color: active ? '#a5b4fc' : '#d1d5db',
                    padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  } }>{f.label}</button>
                )
              })}
              <div style={ { marginLeft: 'auto', minWidth: 190 } }>
                <FsmSelect
                  value={adminSortBy}
                  onChange={setAdminSortBy}
                  options={[
                    { value: 'createdDesc', label: '↓ Récents' },
                    { value: 'createdAsc', label: '↑ Anciens' },
                    { value: 'lastSignIn', label: 'Dernière connexion' },
                    { value: 'email', label: 'A→Z (email)' },
                  ]}
                />
              </div>
            </div>
            {filtered.length === 0 ? (
              <p style={ { color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '24px 0', margin: 0 } }>
                Aucun utilisateur ne correspond au filtre.
              </p>
            ) : (
              <div style={ { maxHeight: 360, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 } }>
                {filtered.map((u) => {
                  const isOwnerUser = u.user_metadata?.is_owner || getHardcodedOwnerEmails().some((e) => e.toLowerCase() === (u.email || '').toLowerCase())
                  const isBanned = u.banned_until && new Date(u.banned_until) > new Date()
                  const isUnverified = !u.email_confirmed_at
                  const isPremiumUser = !!u.user_metadata?.is_premium
                  const isSelected = adminFoundUser?.id === u.id
                  return (
                    <button key={u.id} onClick={() => {
                      if (adminFoundUser?.id === u.id) {
                        setAdminFoundUser(null)
                        setAdminSearchEmail('')
                        return
                      }
                      setAdminFoundUser(u); setAdminSearchEmail(u.email || '')
                    }} style={ {
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      background: isSelected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                      border: '1px solid ' + (isSelected ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'),
                      borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: '#d1d5db',
                    } }>
                      <div style={ { width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #1e2535, #2a3347)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#fff', flexShrink: 0 } }>
                        {(u.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={ { flex: 1, minWidth: 0 } }>
                        <div style={ { fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }>
                          {u.user_metadata?.full_name || u.user_metadata?.name || (u.email || '').split('@')[0]}
                        </div>
                        <div style={ { fontSize: 11, color: '#9ca3af', display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 } }>
                          <span style={ { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 } }>{u.email}</span>
                          <span style={ { color: '#6b7280', flexShrink: 0 } }>·</span>
                          <span style={ { flexShrink: 0 } } title={u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('fr-CA') : 'Jamais connecté'}>{fmtRelative(u.last_sign_in_at)}</span>
                        </div>
                      </div>
                      <div style={ { display: 'flex', gap: 4, flexShrink: 0 } }>
                        {isOwnerUser && <span title="Owner" style={ { padding: '2px 6px', borderRadius: 999, background: 'rgba(234,179,8,0.15)', color: '#fde68a', fontSize: 11, border: '1px solid rgba(234,179,8,0.4)' } }>👑</span>}
                        {isPremiumUser && <span title="Premium" style={ { padding: '2px 6px', borderRadius: 999, background: 'rgba(192,132,252,0.15)', color: '#e9d5ff', fontSize: 11, border: '1px solid rgba(192,132,252,0.4)' } }>💎</span>}
                        {isBanned && <span title="Banni" style={ { padding: '2px 6px', borderRadius: 999, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: 11, border: '1px solid rgba(239,68,68,0.4)' } }>🚫</span>}
                        {isUnverified && <span title="Email non vérifié" style={ { padding: '2px 6px', borderRadius: 999, background: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontSize: 11, border: '1px solid rgba(245,158,11,0.4)' } }>⚠</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}
      {adminFoundUser && (
        <div style={ { background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 14, marginTop: 12 } }>
          <div style={ { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' } }>
            <div style={ { width: 40, height: 40, borderRadius: '50%', background: '#1e2535', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#d1d5db', flexShrink: 0 } }>
              {(adminFoundUser.email || '?').charAt(0).toUpperCase()}
            </div>
            <div style={ { flex: 1, minWidth: 0 } }>
              <p style={ { margin: 0, fontWeight: 600, color: '#fff' } }>
                {adminFoundUser.user_metadata?.full_name
                  || adminFoundUser.user_metadata?.name
                  || (adminFoundUser.email || '').split('@')[0]}
              </p>
              <p style={ { margin: 0, fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }>
                {adminFoundUser.email}
              </p>
              <p style={ { margin: 0, fontSize: 11, color: '#6b7280', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }>
                {adminFoundUser.id}
              </p>
            </div>
            {(adminFoundUser.user_metadata?.is_owner
              || getHardcodedOwnerEmails().some((e) => e.toLowerCase() === (adminFoundUser.email || '').toLowerCase())) && (
              <span style={ { padding: '3px 10px', borderRadius: 999, background: 'rgba(234,179,8,0.15)', color: '#fde68a', fontSize: 11, fontWeight: 700, border: '1px solid rgba(234,179,8,0.4)' } }>
                👑 Owner
              </span>
            )}
            {(() => {
              const plan = adminFoundUser.user_metadata?.plan || (adminFoundUser.user_metadata?.is_premium ? 'premium' : 'gratuit')
              if (plan === 'gratuit') return null
              const isPro = plan === 'pro'
              return (
                <span style={ { padding: '3px 10px', borderRadius: 999, background: isPro ? 'rgba(56,189,248,0.15)' : 'rgba(192,132,252,0.15)', color: isPro ? '#bae6fd' : '#e9d5ff', fontSize: 11, fontWeight: 700, border: '1px solid ' + (isPro ? 'rgba(56,189,248,0.4)' : 'rgba(192,132,252,0.4)') } }>
                  {isPro ? '⚡ Pro' : '💎 Premium'}
                </span>
              )
            })()}
            {adminFoundUser.banned_until && new Date(adminFoundUser.banned_until) > new Date() && (
              <span style={ { padding: '3px 10px', borderRadius: 999, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: 11, fontWeight: 700, border: '1px solid rgba(239,68,68,0.4)' } }>
                🚫 Banni
              </span>
            )}
          </div>
          <div style={ {
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8,
            marginBottom: 12, padding: 10,
            background: 'rgba(0,0,0,0.2)', borderRadius: 8,
          } }>
            {[
              { label: 'Créé le', value: adminFoundUser.created_at ? new Date(adminFoundUser.created_at).toLocaleDateString('fr-CA') : '—' },
              { label: 'Dernière connexion', value: adminFoundUser.last_sign_in_at ? new Date(adminFoundUser.last_sign_in_at).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' }) : 'Jamais' },
              { label: 'Email vérifié', value: adminFoundUser.email_confirmed_at ? '✅ Oui' : '⚠ Non', color: adminFoundUser.email_confirmed_at ? '#86efac' : '#fbbf24' },
              { label: 'Providers', value: (adminFoundUser.identities || []).map((i) => i.provider).join(', ') || 'email' },
            ].map((kpi) => (
              <div key={kpi.label}>
                <div style={ { color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 } }>{kpi.label}</div>
                <div style={ { color: kpi.color || '#d1d5db', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } } title={kpi.value}>{kpi.value}</div>
              </div>
            ))}
          </div>
          <div className="fsm-field" style={ { marginBottom: 8 } }>
            <label className="fsm-label" style={ { fontSize: 12 } }>Rôle principal</label>
            <FsmSelect
              value={adminFoundUser.user_metadata?.role || ''}
              disabled={adminBusy}
              onChange={async (role) => {
                setAdminBusy(true)
                try {
                  await adminApi.setUserRole(adminFoundUser.id, role || null, {
                    schoolRole: role === 'ecole' ? (adminFoundUser.user_metadata?.school_role || null) : null,
                  })
                  await adminRefreshFound()
                  setAdminInfo(`Rôle de ${adminFoundUser.email} mis à jour : ${role || '— non défini —'}.`)
                } catch (err) {
                  setAdminInfo(`Erreur : ${err?.message || err}`)
                } finally {
                  setAdminBusy(false)
                }
              }}
              options={[
                { value: '', label: '— non défini —' },
                { value: 'personnel', label: 'Personnel', icon: '👤' },
                { value: 'travail', label: 'Travail', icon: '💼' },
                { value: 'ecole', label: 'École', icon: '🎓' },
                { value: 'autre', label: 'Autre', icon: '✨' },
              ]}
            />
          </div>
          {adminFoundUser.user_metadata?.role === 'ecole' && (
            <div className="fsm-field" style={ { marginBottom: 8 } }>
              <label className="fsm-label" style={ { fontSize: 12 } }>Rôle scolaire</label>
              <p className="fsm-label-sub" style={ { marginTop: 2 } }>
                Choisis si ce compte École est un élève ou un enseignant.
              </p>
              <FsmSelect
                value={adminFoundUser.user_metadata?.school_role || ''}
                disabled={adminBusy}
                onChange={async (schoolRole) => {
                  setAdminBusy(true)
                  try {
                    await adminApi.setUserRole(adminFoundUser.id, 'ecole', {
                      schoolRole: schoolRole || null,
                    })
                    await adminRefreshFound()
                    setAdminInfo(`Rôle scolaire de ${adminFoundUser.email} mis à jour : ${schoolRole || '— non défini —'}.`)
                  } catch (err) {
                    setAdminInfo(`Erreur : ${err?.message || err}`)
                  } finally {
                    setAdminBusy(false)
                  }
                }}
                options={[
                  { value: '', label: '— non défini —' },
                  { value: 'enseignant', label: 'Enseignant', icon: '👨‍🏫' },
                  { value: 'eleve', label: 'Élève', icon: '🎒' },
                ]}
              />
            </div>
          )}
          <div className="fsm-field" style={ { marginBottom: 8 } }>
            <label className="fsm-label" style={ { fontSize: 12 } }>Abonnement</label>
            <p className="fsm-label-sub" style={ { marginTop: 2 } }>
              Palier appliqué en temps réel sur le compte cible (Gratuit / Pro / Premium). Les owners/dev restent premium d'office.
            </p>
            <FsmSelect
              value={adminFoundUser.user_metadata?.plan || (adminFoundUser.user_metadata?.is_premium ? 'premium' : 'gratuit')}
              disabled={adminBusy}
              onChange={async (plan) => {
                setAdminBusy(true)
                try {
                  await adminApi.setUserPlan(adminFoundUser.id, plan)
                  await adminRefreshFound()
                  setAdminInfo(`Abonnement de ${adminFoundUser.email} : ${plan}.`)
                } catch (err) {
                  setAdminInfo(`Erreur : ${err?.message || err}`)
                } finally {
                  setAdminBusy(false)
                }
              }}
              options={[
                { value: 'gratuit', label: 'Gratuit', icon: '🆓' },
                { value: 'pro', label: 'Pro', icon: '⚡' },
                { value: 'premium', label: 'Premium', icon: '💎' },
              ]}
            />
          </div>
          <div style={ { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 } }>
            <button
              className="fsm-action-btn fsm-action-btn-inline"
              disabled={adminBusy || adminFoundUser.id === user?.id}
              title={adminFoundUser.id === user?.id ? 'Pour toi-même, utilise le toggle Statut Owner au-dessus' : ''}
              onClick={async () => {
                const cur = !!adminFoundUser.user_metadata?.is_owner
                setAdminBusy(true)
                try {
                  await adminApi.setUserOwner(adminFoundUser.id, !cur)
                  await adminRefreshFound()
                  setAdminInfo(`is_owner pour ${adminFoundUser.email} = ${!cur}.`)
                } catch (err) {
                  setAdminInfo(`Erreur : ${err?.message || err}`)
                } finally {
                  setAdminBusy(false)
                }
              }}
            >
              {adminFoundUser.user_metadata?.is_owner ? 'Révoquer Owner' : 'Attribuer Owner'}
            </button>
            <button
              className="fsm-action-btn fsm-action-btn-inline"
              disabled={adminBusy || !adminFoundUser?.email}
              onClick={async () => {
                if (!adminFoundUser?.email) return
                setAdminBusy(true)
                try {
                  const { error } = await supabase.auth.resetPasswordForEmail(adminFoundUser.email, {
                    redirectTo: window.location.origin + '/',
                  })
                  if (error) throw error
                  setAdminInfo(`Email de réinitialisation envoyé à ${adminFoundUser.email}.`)
                } catch (err) { setAdminInfo(`Erreur : ${err?.message || err}`) }
                finally { setAdminBusy(false) }
              }}
            >
              ✉ Reset password
            </button>
            <button
              className="fsm-action-btn fsm-action-btn-inline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(adminFoundUser.id)
                  setAdminInfo(`ID copié : ${adminFoundUser.id}`)
                } catch (err) { setAdminInfo(`Erreur copie : ${err?.message || err}`) }
              }}
            >
              📋 Copier ID
            </button>
            {adminFoundUser.banned_until && new Date(adminFoundUser.banned_until) > new Date() ? (
              <button
                className="fsm-action-btn fsm-action-btn-inline"
                disabled={adminBusy}
                onClick={async () => {
                  setAdminBusy(true)
                  try {
                    await adminApi.unbanUser(adminFoundUser.id)
                    await adminRefreshFound()
                    setAdminInfo(`${adminFoundUser.email} débanni.`)
                  } catch (err) {
                    setAdminInfo(`Erreur : ${err?.message || err}`)
                  } finally {
                    setAdminBusy(false)
                  }
                }}
              >
                Débannir
              </button>
            ) : (
              <button
                className="fsm-action-btn fsm-action-btn-inline"
                style={ { color: '#f59e0b', borderColor: 'rgba(245,158,11,0.35)' } }
                disabled={adminBusy || adminFoundUser.id === user?.id}
                title={adminFoundUser.id === user?.id ? 'Impossible de te bannir toi-même' : ''}
                onClick={async () => {
                  if (!window.confirm(`Bannir ${adminFoundUser.email} ?\n\nL'utilisateur ne pourra plus se connecter. Action réversible via « Débannir ».`)) return
                  setAdminBusy(true)
                  try {
                    await adminApi.banUser(adminFoundUser.id)
                    await adminRefreshFound()
                    setAdminInfo(`${adminFoundUser.email} banni.`)
                  } catch (err) {
                    setAdminInfo(`Erreur : ${err?.message || err}`)
                  } finally {
                    setAdminBusy(false)
                  }
                }}
              >
                Bannir
              </button>
            )}
            <button
              className="fsm-action-btn fsm-action-btn-inline"
              style={ { color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)' } }
              disabled={adminBusy || adminFoundUser.id === user?.id}
              title={adminFoundUser.id === user?.id ? 'Impossible de te supprimer toi-même via cet outil' : ''}
              onClick={async () => {
                if (!window.confirm(`SUPPRIMER DÉFINITIVEMENT le compte ${adminFoundUser.email} ?\n\nCette action est IRRÉVERSIBLE. Le compte auth sera effacé ; selon les FK des tables métier (chats, partages, etc.), des rows orphelines peuvent rester.`)) return
                setAdminBusy(true)
                try {
                  await adminApi.deleteUserAccount(adminFoundUser.id)
                  setAdminFoundUser(null)
                  setAdminInfo(`${adminFoundUser.email} supprimé.`)
                } catch (err) {
                  setAdminInfo(`Erreur : ${err?.message || err}`)
                } finally {
                  setAdminBusy(false)
                }
              }}
            >
              Supprimer
            </button>
          </div>
        </div>
      )}

      {/* Journal d'audit — lazy load à l'ouverture du <details>. */}
      <details
        className="fsm-perf-details"
        style={ { marginTop: 16 } }
        onToggle={(e) => { if (e.currentTarget.open && adminAuditEntries.length === 0) adminLoadAudit() }}
      >
        <summary className="fsm-perf-detail-summary">
          <span className="fsm-perf-detail-icon">📜</span>
          <span className="fsm-perf-detail-title">Journal d'audit ({adminAuditEntries.length})</span>
          <svg className="fsm-perf-detail-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </summary>
        <div className="fsm-perf-detail-content">
          <button
            className="fsm-action-btn fsm-action-btn-inline"
            onClick={adminLoadAudit}
            style={ { marginBottom: 8 } }
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            Rafraîchir
          </button>
          {adminAuditEntries.length === 0 ? (
            <p className="fsm-label-sub">Aucune entrée pour le moment.</p>
          ) : (
            <div style={ { maxHeight: 320, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 } }>
              {adminAuditEntries.map((entry) => (
                <div key={entry.id} style={ { background: 'rgba(0,0,0,0.25)', padding: 8, borderRadius: 4, fontSize: 12, color: '#d1d5db', lineHeight: 1.5 } }>
                  <div style={ { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' } }>
                    <strong style={ { color: '#fde68a' } }>{entry.action}</strong>
                    <span style={ { color: '#6b7280', fontSize: 11 } }>{new Date(entry.created_at).toLocaleString('fr-CA')}</span>
                  </div>
                  <div style={ { marginTop: 2, fontSize: 11 } }>
                    <span style={ { color: '#9ca3af' } }>par</span> <code>{entry.actor_email || entry.actor_id || '?'}</code>
                    {entry.target_email && (
                      <>
                        <span style={ { color: '#9ca3af' } }> → </span>
                        <code>{entry.target_email}</code>
                      </>
                    )}
                  </div>
                  {entry.payload && (
                    <pre style={ { margin: '4px 0 0', fontSize: 10, color: '#9ca3af', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }>
{JSON.stringify(entry.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {/* === Messages système === */}
      <div className="fsm-divider" />
      <div className="fsm-divider" />
      <h4 className="fsm-group-title">Messages système</h4>
      <p className="fsm-label-sub" style={ { marginTop: -4, marginBottom: 12 } }>
        Diffuse un message à tous les utilisateurs ou à une sélection. Envoi immédiat ou programmé.
      </p>
      <div style={ { display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 } }>
        <div>
          <label className="fsm-label" style={ { fontSize: 12 } }>Destinataires</label>
          <div style={ { display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' } }>
            {[
              { id: 'all', label: 'Tous les utilisateurs', icon: '🌐', disabled: false },
              { id: 'allLoaded', label: `Liste chargée (${adminAllUsers.length})`, icon: '📋', disabled: adminAllUsers.length === 0 },
              { id: 'multi', label: `Choisir individuellement (${adminSelectedIds.size})`, icon: '☑️', disabled: false },
            ].map((opt) => {
              const active = sysMsgRecipients === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => { if (!opt.disabled) setSysMsgRecipients(opt.id) }}
                  disabled={opt.disabled}
                  style={ {
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${active ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
                    color: opt.disabled ? '#6b7280' : (active ? '#a5b4fc' : '#d1d5db'),
                    fontSize: 12, fontWeight: 600,
                    cursor: opt.disabled ? 'not-allowed' : 'pointer',
                    opacity: opt.disabled ? 0.5 : 1,
                    fontFamily: 'inherit',
                  } }
                >
                  <span style={ { marginRight: 6 } }>{opt.icon}</span>{opt.label}
                </button>
              )
            })}
          </div>
          {sysMsgRecipients === 'multi' && (
            <div style={ { marginTop: 10, background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 10 } }>
              {adminAllUsers.length === 0 ? (
                <p style={ { margin: 0, color: '#9ca3af', fontSize: 12 } }>
                  Charge d'abord la liste complète avec le bouton <strong>Voir tous</strong> dans <em>Gestion des utilisateurs</em>, puis reviens cocher les destinataires ici.
                </p>
              ) : (
                <>
                  <div style={ { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' } }>
                    <button
                      onClick={() => setAdminSelectedIds(new Set(adminAllUsers.map((u) => u.id)))}
                      className="fsm-action-btn fsm-action-btn-inline"
                      style={ { fontSize: 11, padding: '4px 8px' } }
                    >Tout cocher</button>
                    <button
                      onClick={() => setAdminSelectedIds(new Set())}
                      className="fsm-action-btn fsm-action-btn-inline"
                      style={ { fontSize: 11, padding: '4px 8px' } }
                    >Tout décocher</button>
                    <span style={ { color: '#9ca3af', fontSize: 11, marginLeft: 'auto' } }>
                      {adminSelectedIds.size} / {adminAllUsers.length} coché(s)
                    </span>
                  </div>
                  <div style={ { maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 } }>
                    {adminAllUsers.map((u) => {
                      const checked = adminSelectedIds.has(u.id)
                      const label = u.email || u.id
                      return (
                        <label
                          key={u.id}
                          style={ {
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 8px', borderRadius: 6,
                            background: checked ? 'rgba(99,102,241,0.12)' : 'transparent',
                            cursor: 'pointer', fontSize: 12, color: '#d1d5db',
                          } }
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAdminSelectedId(u.id)}
                            style={ { accentColor: '#6366f1', cursor: 'pointer' } }
                          />
                          <span style={ { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }>{label}</span>
                        </label>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="fsm-label" style={ { fontSize: 12 } }>Titre</label>
          <input
            type="text"
            value={sysMsgTitle}
            onChange={(e) => setSysMsgTitle(e.target.value)}
            placeholder="Ex. Maintenance prévue dimanche"
            maxLength={120}
            style={ {
              width: '100%', boxSizing: 'border-box',
              background: '#1e2535', color: '#fff',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
              padding: '8px 12px', fontSize: 14, fontFamily: 'inherit',
              marginTop: 4, outline: 'none',
            } }
          />
        </div>
        <div>
          <label className="fsm-label" style={ { fontSize: 12 } }>Message</label>
          <textarea
            value={sysMsgBody}
            onChange={(e) => setSysMsgBody(e.target.value)}
            placeholder="Contenu du message…"
            rows={4}
            maxLength={2000}
            style={ {
              width: '100%', boxSizing: 'border-box',
              background: '#1e2535', color: '#fff',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
              padding: '8px 12px', fontSize: 14, fontFamily: 'inherit',
              resize: 'vertical', marginTop: 4, outline: 'none', minHeight: 80,
            } }
          />
          <div style={ { color: '#6b7280', fontSize: 11, textAlign: 'right', marginTop: 2 } }>
            {sysMsgBody.length} / 2000
          </div>
        </div>
        <div>
          <label className="fsm-label" style={ { fontSize: 12 } }>Programmer (optionnel)</label>
          <p className="fsm-label-sub" style={ { fontSize: 11, marginTop: 2, marginBottom: 4 } }>
            Laisse vide pour envoyer maintenant. Sinon, le cron le délivrera à l'heure choisie.
          </p>
          <div style={ { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } }>
            <input
              type="datetime-local"
              value={sysMsgScheduledFor}
              onChange={(e) => setSysMsgScheduledFor(e.target.value)}
              style={ {
                background: '#1e2535', color: '#fff',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
                padding: '8px 12px', fontSize: 14, fontFamily: 'inherit',
                colorScheme: 'dark', outline: 'none',
              } }
            />
            {sysMsgScheduledFor && (
              <button
                onClick={() => setSysMsgScheduledFor('')}
                style={ {
                  background: 'transparent', border: 'none', color: '#9ca3af',
                  fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
                } }
              >Effacer</button>
            )}
          </div>
        </div>
        <div style={ { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 } }>
          <button
            onClick={adminSendOrScheduleMessage}
            disabled={sysMsgBusy || !sysMsgTitle.trim() || !sysMsgBody.trim()}
            className="fsm-action-btn fsm-action-btn-inline"
            style={ {
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              borderColor: 'transparent', color: '#fff', fontWeight: 600,
            } }
          >
            {sysMsgBusy ? '…' : (sysMsgScheduledFor ? '⏰ Programmer' : '✉️ Envoyer maintenant')}
          </button>
          <button
            onClick={adminLoadSystemMessages}
            disabled={sysMsgBusy}
            className="fsm-action-btn fsm-action-btn-inline"
          >
            🔄 Charger l'historique
          </button>
        </div>
      </div>
      {sysMsgList.length > 0 && (
        <details style={ { marginTop: 12 } }>
          <summary style={ { cursor: 'pointer', color: '#9ca3af', fontSize: 13, padding: '8px 0' } }>
            Historique ({sysMsgList.length})
          </summary>
          <div style={ { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 } }>
            {sysMsgList.map((m) => {
              const statusColor = m.status === 'sent' ? '#22c55e'
                : m.status === 'pending' ? '#fbbf24'
                : m.status === 'cancelled' ? '#9ca3af' : '#ef4444'
              const statusLabel = m.status === 'sent' ? '✓ Envoyé'
                : m.status === 'pending' ? '⏳ En attente'
                : m.status === 'cancelled' ? '🚫 Annulé' : '❌ Échec'
              return (
                <div key={m.id} style={ {
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, padding: 10,
                } }>
                  <div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 } }>
                    <span style={ { color: '#fff', fontWeight: 600, fontSize: 13 } }>{m.title}</span>
                    <span style={ { color: statusColor, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' } }>{statusLabel}</span>
                  </div>
                  <p style={ { color: '#d1d5db', fontSize: 12, margin: '4px 0 6px', whiteSpace: 'pre-wrap' } }>{m.body}</p>
                  <div style={ { color: '#6b7280', fontSize: 11, display: 'flex', gap: 10, flexWrap: 'wrap' } }>
                    <span>Créé : {new Date(m.created_at).toLocaleString('fr-CA')}</span>
                    {m.scheduled_for && <span>Programmé : {new Date(m.scheduled_for).toLocaleString('fr-CA')}</span>}
                    {m.delivered_at && <span>Délivré : {new Date(m.delivered_at).toLocaleString('fr-CA')} → {m.delivered_count}</span>}
                    <span>Cible : {m.recipient_mode === 'all' ? 'Tous' : `${(m.recipient_user_ids || []).length} utilisateur(s)`}</span>
                  </div>
                  {m.status === 'pending' && (
                    <button
                      onClick={() => adminCancelSystemMessageHandler(m.id)}
                      className="fsm-action-btn fsm-action-btn-inline"
                      style={ { marginTop: 8, color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)', fontSize: 12 } }
                    >
                      🚫 Annuler
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </details>
      )}

      {/* === Outils de debug === */}
      <div className="fsm-divider" />
      <h4 className="fsm-group-title">Outils de debug</h4>
      <details className="fsm-perf-details">
        <summary className="fsm-perf-detail-summary">
          <span className="fsm-perf-detail-icon">🔬</span>
          <span className="fsm-perf-detail-title">Voir mon user_metadata complet</span>
          <svg className="fsm-perf-detail-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </summary>
        <div className="fsm-perf-detail-content">
          <pre style={ { background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6, fontSize: 12, color: '#d1d5db', overflow: 'auto', maxHeight: 280, margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }>
{JSON.stringify(user?.user_metadata || {}, null, 2)}
          </pre>
        </div>
      </details>
      <details className="fsm-perf-details">
        <summary className="fsm-perf-detail-summary">
          <span className="fsm-perf-detail-icon">🆔</span>
          <span className="fsm-perf-detail-title">Identifiants techniques</span>
          <svg className="fsm-perf-detail-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </summary>
        <div className="fsm-perf-detail-content">
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">user.id</span>
              <span className="fsm-perf-row-desc"><code>{user?.id || '—'}</code></span>
            </div>
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Email</span>
              <span className="fsm-perf-row-desc"><code>{user?.email || '—'}</code></span>
            </div>
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Compte créé</span>
              <span className="fsm-perf-row-desc"><code>{user?.created_at || '—'}</code></span>
            </div>
          </div>
          <div className="fsm-perf-row">
            <div className="fsm-perf-row-label">
              <span className="fsm-perf-row-name">Email confirmé</span>
              <span className="fsm-perf-row-desc">{user?.email_confirmed_at ? `✅ ${user.email_confirmed_at}` : '❌ Non confirmé'}</span>
            </div>
          </div>
        </div>
      </details>
    </div>
  )
}