'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Client, Message } from '@/lib/types'
import { StaggerItem, useToast } from '@/components/Motion'

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const Icon = {
  search: <svg viewBox="0 0 24 24" {...stroke}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  send: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.6L21 12 3.4 3.4 3 10l13 2-13 2 .4 6.6z" /></svg>,
  chat: <svg viewBox="0 0 24 24" {...stroke}><path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2h-7l-4 3.5V17H6a2 2 0 01-2-2V6z" /></svg>,
  lock: <svg viewBox="0 0 24 24" {...stroke}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>,
  back: <svg viewBox="0 0 24 24" {...stroke}><path d="M15 19l-7-7 7-7" /></svg>,
}

const AVATAR_GRADIENTS = [
  'from-[#A78BFA] to-[#7C3AED]',
  'from-[#A78BFA] to-[#7C3AED]',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-blue-500 to-cyan-600',
  'from-fuchsia-500 to-purple-600',
]
function avatarGradient(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]
}

function isSameDay(a: string, b: string) {
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  if (isSameDay(iso, today.toISOString())) return 'Heute'
  if (isSameDay(iso, yest.toISOString())) return 'Gestern'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatMessageTimestamp(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  if (isSameDay(iso, today.toISOString())) {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) +
    ' ' +
    date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

type BackendParticipant = {
  id: string
  fullName: string | null
  email: string | null
}

type BackendClientListItem = {
  id: string
  trainerId: string
  userId: string | null
  fullName: string
  email: string
  phone: string | null
  notes: string | null
  createdAt: string
  latestMessageAt: string | null
  unreadCount: number
  messagingEnabled: boolean
}

type BackendMessage = {
  id: string
  senderId: string
  receiverId: string
  content: string
  createdAt: string
  readAt: string | null
  sender?: BackendParticipant | null
}

function mapClient(client: BackendClientListItem): Client {
  return {
    id: client.id,
    trainer_id: client.trainerId,
    user_id: client.userId,
    full_name: client.fullName,
    email: client.email,
    phone: client.phone,
    notes: client.notes,
    created_at: client.createdAt,
  }
}

function mapMessage(message: BackendMessage): Message {
  return {
    id: message.id,
    sender_id: message.senderId,
    receiver_id: message.receiverId,
    content: message.content,
    created_at: message.createdAt,
    read_at: message.readAt,
    sender: message.sender
      ? {
          id: message.sender.id,
          email: message.sender.email ?? '',
          full_name: message.sender.fullName ?? message.sender.email ?? '',
          role: 'client',
          created_at: '',
        }
      : undefined,
  }
}

export default function TrainerMessagesPage() {
  const searchParams = useSearchParams()
  const { showToast } = useToast()
  const initialClientId = searchParams.get('client')

  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [myUserId, setMyUserId] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [unreadByClientId, setUnreadByClientId] = useState<Record<string, number>>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sendingRef = useRef(false)
  const prevMessageCountRef = useRef(0)
  const didApplyInitialClientRef = useRef(false)

  const appendMessage = useCallback((message: Message) => {
    setMessages(prev => {
      if (prev.some(existing => existing.id === message.id)) return prev
      return [...prev, message].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
    })
  }, [])

  const loadClients = useCallback(async () => {
    try {
      const response = await fetch('/api/backend/messages/clients', { cache: 'no-store' })
      const data = await response.json().catch(() => null) as {
        trainerUserId?: string
        clients?: BackendClientListItem[]
        message?: string
      } | null

      if (!response.ok) {
        throw new Error(data?.message ?? 'Load clients failed')
      }

      const rawClients = (data?.clients ?? []) as BackendClientListItem[]
      const nextClients = rawClients.map(mapClient)
      const nextUnread = Object.fromEntries(rawClients.map(client => [client.id, client.unreadCount ?? 0]))

      setMyUserId(data?.trainerUserId ?? '')
      setClients(nextClients)
      setUnreadByClientId(nextUnread)
      setSelectedClient(prev => {
        const targetId = prev?.id ?? (!didApplyInitialClientRef.current ? initialClientId : null)
        didApplyInitialClientRef.current = true
        if (!targetId) return prev
        return nextClients.find(client => client.id === targetId) ?? null
      })
    } catch (error) {
      console.error('[Admin Messages] load clients failed:', error)
    } finally {
      setLoading(false)
    }
  }, [initialClientId])

  const markConversationRead = useCallback(async (client: Client, currentUserId: string) => {
    if (!client.user_id) return

    try {
      const response = await fetch(`/api/backend/clients/${client.id}/messages/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!response.ok) return

      const readAt = new Date().toISOString()
      setMessages(prev => prev.map(message => (
        message.sender_id === client.user_id && message.receiver_id === currentUserId && !message.read_at
          ? { ...message, read_at: readAt }
          : message
      )))
      setUnreadByClientId(prev => ({ ...prev, [client.id]: 0 }))
    } catch (error) {
      console.error('[Admin Messages] mark read failed:', error)
    }
  }, [])

  const loadConversation = useCallback(async () => {
    if (!selectedClient) {
      setMessages([])
      return
    }
    if (!selectedClient.user_id || !myUserId) {
      setMessages([])
      return
    }

    try {
      const response = await fetch(`/api/backend/clients/${selectedClient.id}/messages`, { cache: 'no-store' })
      const data = await response.json().catch(() => null) as {
        messages?: BackendMessage[]
        message?: string
      } | null

      if (!response.ok) {
        throw new Error(data?.message ?? 'Load conversation failed')
      }

      setMessages(((data?.messages ?? []) as BackendMessage[]).map(mapMessage))
      await markConversationRead(selectedClient, myUserId)
    } catch (error) {
      console.error('[Admin Messages] load conversation failed:', error)
    }
  }, [markConversationRead, myUserId, selectedClient])

  useEffect(() => {
    void loadClients()
  }, [loadClients])

  useEffect(() => {
    if (!selectedClient?.user_id || !myUserId) {
      setMessages([])
      return
    }
    void loadConversation()
  }, [selectedClient?.id, selectedClient?.user_id, myUserId, loadConversation])

  useEffect(() => {
    if (!selectedClient?.user_id || !myUserId) return
    const refresh = () => { void loadConversation() }

    const intervalId = setInterval(refresh, 8000)
    window.addEventListener('focus', refresh)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [selectedClient, myUserId, loadConversation])

  useEffect(() => {
    const refresh = () => { void loadClients() }
    const intervalId = setInterval(refresh, 8000)
    window.addEventListener('focus', refresh)
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(intervalId)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadClients])

  useEffect(() => {
    prevMessageCountRef.current = 0
  }, [selectedClient?.id])

  useEffect(() => {
    const prev = prevMessageCountRef.current
    prevMessageCountRef.current = messages.length
    if (messages.length === 0) return
    bottomRef.current?.scrollIntoView({
      behavior: prev === 0 ? 'instant' : 'smooth',
      block: 'end',
    })
  }, [messages])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [newMessage])

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (sendingRef.current) return
    if (!newMessage.trim() || !selectedClient?.user_id || !myUserId) return
    sendingRef.current = true
    const content = newMessage.trim()
    setSending(true)
    setNewMessage('')

    try {
      const response = await fetch(`/api/backend/clients/${selectedClient.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await response.json().catch(() => null) as {
        message?: BackendMessage | string
      } | null

      if (!response.ok || !data || typeof data.message === 'string' || !data.message) {
        showToast('Senden fehlgeschlagen', 'danger')
        setNewMessage(content)
        return
      }

      appendMessage(mapMessage(data.message))
      setUnreadByClientId(prev => ({ ...prev, [selectedClient.id]: 0 }))
      showToast('Gesendet', 'info')
    } catch (error) {
      console.error('[Admin Messages] send failed:', error)
      showToast('Senden fehlgeschlagen', 'danger')
      setNewMessage(content)
    } finally {
      setSending(false)
      sendingRef.current = false
      inputRef.current?.focus()
    }
  }

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients
    const q = search.toLowerCase()
    return clients.filter(c => c.full_name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
  }, [clients, search])

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="h-[calc(100vh-4rem)] lg:h-screen flex bg-[#050504]">
      <aside className={`
        ${selectedClient ? 'hidden md:flex' : 'flex'}
        w-full md:w-72 lg:w-80 flex-shrink-0 border-r border-white/[0.06] bg-[#111111] flex-col
      `}>
        <div className="px-4 pt-5 pb-3">
          <h2 className="font-semibold text-[#EDECEA] tracking-tight text-[18px]">Nachrichten</h2>
          <p className="text-[12px] text-[#797D83] mt-0.5">{clients.length} {clients.length === 1 ? 'Kunde' : 'Kunden'}</p>
        </div>
        <div className="px-3 pb-2">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#797D83]">{Icon.search}</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Suchen..."
              className="w-full pl-9 pr-3 py-2 bg-white/[0.05] border border-transparent rounded-xl text-[13px] placeholder:text-[#797D83] focus:bg-[#111111] focus:border-white/[0.12] focus:ring-0 transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {filteredClients.length === 0 ? (
            <p className="text-[13px] text-[#797D83] px-3 py-8 text-center">
              {search ? 'Keine Treffer.' : 'Keine Kunden vorhanden.'}
            </p>
          ) : (
            filteredClients.map((client, index) => {
              const isSelected = selectedClient?.id === client.id
              const unreadCount = unreadByClientId[client.id] ?? 0
              return (
                <StaggerItem key={client.id} index={index}>
                  <button
                    onClick={() => setSelectedClient(client)}
                    className={`press relative w-full flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-xl text-left transition-colors ${
                      isSelected ? 'bg-[#A78BFA]/10' : 'hover:bg-[#050504]'
                    }`}
                  >
                    {isSelected && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-r-full bg-[#A78BFA]" />}
                    <Avatar name={client.full_name} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`min-w-0 truncate text-[13.5px] font-medium tracking-tight ${isSelected ? 'text-[#A78BFA]' : 'text-[#EDECEA]'}`}>
                          {client.full_name}
                        </span>
                        {unreadCount > 0 && (
                          <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#A78BFA] text-white text-[11px] font-bold leading-none flex items-center justify-center ring-1 ring-white tabular-nums">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-[#797D83] truncate">
                        {client.user_id ? client.email : 'Kein App-Zugang'}
                      </div>
                    </div>
                    {!client.user_id && (
                      <span className="w-3.5 h-3.5 text-white/50">{Icon.lock}</span>
                    )}
                  </button>
                </StaggerItem>
              )
            })
          )}
        </div>
      </aside>

      <section className={`${selectedClient ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
        {!selectedClient ? (
          <EmptyState icon={Icon.chat} title="Wähle einen Kunden" subtitle="Klicke links auf einen Kunden, um die Unterhaltung zu oeffnen." />
        ) : !selectedClient.user_id ? (
          <EmptyState
            icon={Icon.lock}
            title={`${selectedClient.full_name} hat noch keinen App-Zugang`}
            subtitle="Kunden müssen sich registrieren, um Nachrichten zu empfangen."
          />
        ) : (
          <>
            <header className="px-4 lg:px-6 py-3.5 border-b border-white/[0.06] bg-[#0b0c0f]/95 backdrop-blur-md flex items-center gap-3 sticky top-0 z-10">
              <button
                onClick={() => setSelectedClient(null)}
                className="press md:hidden -ml-1 p-1.5 rounded-lg text-[#EDECEA] hover:bg-white/[0.05]"
                aria-label="Zurück"
              >
                <span className="w-5 h-5 block">{Icon.back}</span>
              </button>
              <Avatar name={selectedClient.full_name} size={36} />
              <div className="min-w-0">
                <div className="font-semibold text-[#EDECEA] text-[14px] tracking-tight truncate">{selectedClient.full_name}</div>
                <div className="text-[11.5px] text-[#797D83] truncate">{selectedClient.email}</div>
              </div>
              <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#A78BFA]/10 text-[#A78BFA] text-[10.5px] font-medium ring-1 ring-inset ring-[#A78BFA]/20">
                <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
                Auto-Refresh
              </span>
            </header>

            <div className="flex-1 overflow-y-auto px-3 lg:px-6 py-5 bg-[#050504]">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center px-6">
                    <p className="text-[#797D83] text-[13px] font-medium">Noch keine Nachrichten</p>
                    <p className="text-[#797D83] text-[12px] mt-1">Schreibe die erste Nachricht.</p>
                  </div>
                </div>
              ) : (
                <MessageList messages={messages} myId={myUserId} accent="indigo" />
              )}
              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={sendMessage}
              className="px-3 lg:px-6 py-3 border-t border-white/[0.06] bg-[#111111]"
            >
              <div className="flex items-end gap-2 bg-[#050504] border border-white/[0.08] rounded-2xl px-3 py-2 focus-within:border-[#A78BFA]/40 focus-within:ring-1 focus-within:ring-[#A78BFA]/10 transition-all">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder="Nachricht schreiben..."
                  className="flex-1 resize-none bg-transparent text-[14px] py-1.5 max-h-[140px] placeholder:text-[#797D83] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="press shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-[#A78BFA] to-[#7C3AED] shadow-[0_4px_12px_-4px_rgba(79,70,229,0.55)] disabled:opacity-40 disabled:shadow-none transition-opacity"
                  aria-label="Senden"
                >
                  {sending ? (
                    <span className="text-[10px] font-semibold">...</span>
                  ) : (
                    <span className="w-4 h-4 block translate-x-[1px]">{Icon.send}</span>
                  )}
                </button>
              </div>
              <p className="text-[10.5px] text-[#797D83] mt-1.5 px-1 hidden sm:block">
                Enter zum Senden | Shift+Enter für neue Zeile
              </p>
            </form>
          </>
        )}
      </section>
    </div>
  )
}

function MessageList({ messages, myId, accent }: { messages: Message[]; myId: string; accent: 'indigo' | 'emerald' }) {
  const groups: Array<{ dateLabel: string; items: Message[] }> = []
  for (const m of messages) {
    const last = groups[groups.length - 1]
    if (!last || !isSameDay(last.items[0].created_at, m.created_at)) {
      groups.push({ dateLabel: dayLabel(m.created_at), items: [m] })
    } else {
      last.items.push(m)
    }
  }

  return (
    <div className="space-y-5">
      {groups.map((g, gi) => (
        <div key={gi} className="space-y-1">
          <div className="flex items-center justify-center my-3">
            <span className="px-3 py-1 rounded-full bg-[#111111] border border-white/[0.06] text-[10.5px] font-medium uppercase tracking-[0.1em] text-[#797D83]">
              {g.dateLabel}
            </span>
          </div>
          {g.items.map((msg, i) => {
            const isMe = msg.sender_id === myId
            const prev = g.items[i - 1]
            const next = g.items[i + 1]
            const isFirstOfRun = !prev || prev.sender_id !== msg.sender_id
            const isLastOfRun = !next || next.sender_id !== msg.sender_id
            return (
              <Bubble
                key={msg.id}
                isMe={isMe}
                content={msg.content}
                createdAt={msg.created_at}
                readAt={msg.read_at}
                isFirstOfRun={isFirstOfRun}
                isLastOfRun={isLastOfRun}
                accent={accent}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

function Bubble({
  isMe, content, createdAt, readAt, isFirstOfRun, isLastOfRun, accent,
}: {
  isMe: boolean; content: string; createdAt: string;
  readAt?: string | null;
  isFirstOfRun: boolean; isLastOfRun: boolean;
  accent: 'indigo' | 'emerald'
}) {
  const meBg = accent === 'indigo'
    ? 'bg-gradient-to-br from-[#A78BFA] to-[#7C3AED] text-white shadow-[0_4px_12px_-6px_rgba(79,70,229,0.5)]'
    : 'bg-gradient-to-br from-[#A78BFA] to-[#7C3AED] text-white shadow-[0_4px_12px_-6px_rgba(167,139,250,0.4)]'
  const themBg = 'bg-[#111111] border border-white/[0.06] text-[#EDECEA] shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

  const radius = isMe
    ? `rounded-2xl ${isLastOfRun ? 'rounded-br-md' : ''} ${!isFirstOfRun ? 'rounded-tr-md' : ''}`
    : `rounded-2xl ${isLastOfRun ? 'rounded-bl-md' : ''} ${!isFirstOfRun ? 'rounded-tl-md' : ''}`

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isFirstOfRun ? 'mt-2' : 'mt-0.5'}`}>
      <div className={`bubble-in max-w-[78%] sm:max-w-[68%] lg:max-w-[60%] px-3.5 py-2 ${radius} ${isMe ? meBg : themBg}`}>
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{content}</p>
        <div className={`flex items-center gap-1 mt-1 ${isMe ? 'text-white/70' : 'text-[#797D83]'}`}>
          <span className="text-[10.5px] tabular-nums">
            {formatMessageTimestamp(createdAt)}
          </span>
          {isMe && isLastOfRun && (
            <svg className={readAt ? 'text-[#A78BFA]/80' : 'text-white/40'} viewBox="0 0 20 12" width="18" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="1,7 4.5,10.5 10.5,2.5" />
              <polyline points="7,7 10.5,10.5 16.5,2.5" />
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const grad = avatarGradient(name)
  return (
    <div
      className={`shrink-0 rounded-full bg-gradient-to-br ${grad} text-white flex items-center justify-center font-semibold ring-2 ring-white shadow-sm`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function EmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[#111111] ring-1 ring-inset ring-white/[0.06] flex items-center justify-center text-[#797D83] shadow-sm">
          <span className="w-7 h-7 block">{icon}</span>
        </div>
        <h3 className="mt-4 font-semibold text-[#EDECEA] tracking-tight">{title}</h3>
        <p className="text-[13px] text-[#797D83] mt-1">{subtitle}</p>
      </div>
    </div>
  )
}
