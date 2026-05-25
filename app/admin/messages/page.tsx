'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Client, Message, Profile } from '@/lib/types'
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
  'from-indigo-500 to-violet-600',
  'from-emerald-500 to-teal-600',
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
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function TrainerMessagesPage() {
  const searchParams = useSearchParams()
  const { showToast } = useToast()
  const initialClientId = searchParams.get('client')

  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [unreadByClientId, setUnreadByClientId] = useState<Record<string, number>>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const prevMessageCountRef = useRef(0)

  const appendMessage = useCallback((message: Message) => {
    setMessages(prev => {
      if (prev.some(existing => existing.id === message.id)) return prev
      return [...prev, message].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
    })
  }, [])

  const loadUnreadCounts = useCallback(async (trainerId: string, clientList: Client[]) => {
    const clientUserIds = clientList.map(client => client.user_id).filter(Boolean) as string[]
    if (clientUserIds.length === 0) {
      setUnreadByClientId({})
      return
    }

    const { data } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', trainerId)
      .is('read_at', null)
      .in('sender_id', clientUserIds)

    const senderCounts = new Map<string, number>()
    for (const message of data ?? []) {
      senderCounts.set(message.sender_id, (senderCounts.get(message.sender_id) ?? 0) + 1)
    }

    setUnreadByClientId(Object.fromEntries(
      clientList.map(client => [client.id, client.user_id ? senderCounts.get(client.user_id) ?? 0 : 0])
    ))
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [profileRes, clientsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('clients').select('*').eq('trainer_id', user.id).order('full_name'),
      ])

      setMyProfile(profileRes.data)
      const clientList = clientsRes.data ?? []
      setClients(clientList)
      await loadUnreadCounts(user.id, clientList)

      if (initialClientId) {
        const found = clientList.find(c => c.id === initialClientId)
        if (found) setSelectedClient(found)
      }

    setLoading(false)
    }
    init()
  }, [initialClientId, loadUnreadCounts])

  const loadConversation = useCallback(async () => {
    if (!selectedClient?.user_id || !myProfile) {
      setMessages([])
      return
    }

    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(*)')
      .or(`and(sender_id.eq.${myProfile.id},receiver_id.eq.${selectedClient.user_id}),and(sender_id.eq.${selectedClient.user_id},receiver_id.eq.${myProfile.id})`)
      .order('created_at')
    setMessages((data ?? []) as Message[])
    setUnreadByClientId(prev => ({ ...prev, [selectedClient.id]: 0 }))
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', selectedClient.user_id)
      .eq('receiver_id', myProfile.id)
      .is('read_at', null)
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('client_id', myProfile.id)
      .eq('type', 'message')
      .eq('is_read', false)
  }, [selectedClient, myProfile])

  useEffect(() => {
    if (!selectedClient?.user_id || !myProfile) {
      setMessages([])
      return
    }

    loadConversation()

    const channel = supabase
      .channel(`messages-${selectedClient.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new as Message
        if (
          (msg.sender_id === myProfile.id && msg.receiver_id === selectedClient.user_id) ||
          (msg.sender_id === selectedClient.user_id && msg.receiver_id === myProfile.id)
        ) {
          appendMessage(msg)
          if (msg.sender_id === selectedClient.user_id && msg.receiver_id === myProfile.id) {
            setUnreadByClientId(prev => ({ ...prev, [selectedClient.id]: 0 }))
            supabase
              .from('messages')
              .update({ read_at: new Date().toISOString() })
              .eq('id', msg.id)
              .then()
          }
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedClient, myProfile, loadConversation, appendMessage])

  useEffect(() => {
    if (!selectedClient?.user_id || !myProfile) return
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
  }, [selectedClient, myProfile, loadConversation])

  useEffect(() => {
    if (!myProfile || clients.length === 0) return

    const channel = supabase
      .channel(`admin-message-badges-${myProfile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${myProfile.id}` }, payload => {
        const msg = payload.new as Message
        const senderClient = clients.find(client => client.user_id === msg.sender_id)
        if (!senderClient) return

        if (selectedClient?.user_id === msg.sender_id) {
          appendMessage(msg)
          setUnreadByClientId(prev => ({ ...prev, [senderClient.id]: 0 }))
          supabase
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', msg.id)
            .then()
          return
        }

        setUnreadByClientId(prev => ({
          ...prev,
          [senderClient.id]: (prev[senderClient.id] ?? 0) + 1,
        }))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [clients, myProfile, selectedClient, appendMessage])

  useEffect(() => {
    if (!myProfile || clients.length === 0) return
    const trainerId = myProfile.id
    const refresh = () => { void loadUnreadCounts(trainerId, clients) }
    const intervalId = setInterval(refresh, 8000)
    window.addEventListener('focus', refresh)
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(intervalId)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [myProfile, clients, loadUnreadCounts])

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

  // Auto-grow textarea
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [newMessage])

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!newMessage.trim() || !selectedClient?.user_id || !myProfile) return
    const content = newMessage.trim()
    setSending(true)
    setNewMessage('')
    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: myProfile.id,
        receiver_id: selectedClient.user_id,
        content,
      })
      .select('*, sender:profiles!messages_sender_id_fkey(*)')
      .single()
    if (!error && data) {
      appendMessage(data as Message)
      const notificationBody = content.length > 50 ? `${content.slice(0, 50)}…` : content
      const { error: notificationError } = await supabase.from('notifications').insert({
        client_id: selectedClient.user_id,
        type: 'message',
        title: 'Neue Nachricht von deinem Trainer',
        body: notificationBody,
        is_read: false,
      })
      if (notificationError) console.error('[Notifications] message insert failed:', notificationError)
      showToast('Gesendet', 'info')
    }
    setSending(false)
    inputRef.current?.focus()
  }

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients
    const q = search.toLowerCase()
    return clients.filter(c => c.full_name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
  }, [clients, search])

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="h-[calc(100vh-4rem)] lg:h-screen flex bg-gray-50">
      {/* Client list */}
      <aside className={`
        ${selectedClient ? 'hidden md:flex' : 'flex'}
        w-full md:w-72 lg:w-80 flex-shrink-0 border-r border-gray-200/70 bg-white flex-col
      `}>
        <div className="px-4 pt-5 pb-3">
          <h2 className="font-semibold text-gray-900 tracking-tight text-[18px]">Nachrichten</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">{clients.length} {clients.length === 1 ? 'Kunde' : 'Kunden'}</p>
        </div>
        <div className="px-3 pb-2">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400">{Icon.search}</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Suchen…"
              className="w-full pl-9 pr-3 py-2 bg-gray-100 border border-transparent rounded-xl text-[13px] placeholder:text-gray-400 focus:bg-white focus:border-gray-300 focus:ring-4 focus:ring-indigo-100 transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {filteredClients.length === 0 ? (
            <p className="text-[13px] text-gray-400 px-3 py-8 text-center">
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
                      isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    {isSelected && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-r-full bg-indigo-600" />}
                    <Avatar name={client.full_name} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`min-w-0 truncate text-[13.5px] font-medium tracking-tight ${isSelected ? 'text-indigo-700' : 'text-gray-900'}`}>
                          {client.full_name}
                        </span>
                        {unreadCount > 0 && (
                          <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-indigo-500 text-white text-[11px] font-bold leading-none flex items-center justify-center ring-1 ring-white tabular-nums">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-gray-400 truncate">
                        {client.user_id ? client.email : 'Kein App-Zugang'}
                      </div>
                    </div>
                    {!client.user_id && (
                      <span className="w-3.5 h-3.5 text-gray-300">{Icon.lock}</span>
                    )}
                  </button>
                </StaggerItem>
              )
            })
          )}
        </div>
      </aside>

      {/* Chat area */}
      <section className={`${selectedClient ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
        {!selectedClient ? (
          <EmptyState icon={Icon.chat} title="Wähle einen Kunden" subtitle="Klicke links auf einen Kunden, um die Unterhaltung zu öffnen." />
        ) : !selectedClient.user_id ? (
          <EmptyState
            icon={Icon.lock}
            title={`${selectedClient.full_name} hat noch keinen App-Zugang`}
            subtitle="Kunden müssen sich registrieren, um Nachrichten zu empfangen."
          />
        ) : (
          <>
            {/* Chat header */}
            <header className="px-4 lg:px-6 py-3.5 border-b border-gray-200/70 bg-white/80 backdrop-blur-md flex items-center gap-3 sticky top-0 z-10">
              <button
                onClick={() => setSelectedClient(null)}
                className="press md:hidden -ml-1 p-1.5 rounded-lg text-gray-700 hover:bg-gray-100"
                aria-label="Zurück"
              >
                <span className="w-5 h-5 block">{Icon.back}</span>
              </button>
              <Avatar name={selectedClient.full_name} size={36} />
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 text-[14px] tracking-tight truncate">{selectedClient.full_name}</div>
                <div className="text-[11.5px] text-gray-500 truncate">{selectedClient.email}</div>
              </div>
              <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10.5px] font-medium ring-1 ring-inset ring-emerald-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Live
              </span>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 lg:px-6 py-5 bg-gradient-to-b from-gray-50 to-white">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-400 text-[13px]">Noch keine Nachrichten. Schreib die erste!</p>
                </div>
              ) : (
                <MessageList messages={messages} myId={myProfile?.id ?? ''} accent="indigo" />
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={sendMessage}
              className="px-3 lg:px-6 py-3 border-t border-gray-200/70 bg-white"
            >
              <div className="flex items-end gap-2 bg-gray-50 border border-gray-200/80 rounded-2xl px-3 py-2 focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-100 transition-all">
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
                  placeholder="Nachricht schreiben…"
                  className="flex-1 resize-none bg-transparent text-[14px] py-1.5 max-h-[140px] placeholder:text-gray-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="press shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-indigo-600 to-violet-600 shadow-[0_4px_12px_-4px_rgba(79,70,229,0.55)] disabled:opacity-40 disabled:shadow-none transition-opacity"
                  aria-label="Senden"
                >
                  <span className="w-4 h-4 block translate-x-[1px]">{Icon.send}</span>
                </button>
              </div>
              <p className="text-[10.5px] text-gray-400 mt-1.5 px-1 hidden sm:block">
                Enter zum Senden · Shift+Enter für neue Zeile
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
            <span className="px-3 py-1 rounded-full bg-white border border-gray-200/70 text-[10.5px] font-medium uppercase tracking-[0.1em] text-gray-500">
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
    ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-[0_4px_12px_-6px_rgba(79,70,229,0.5)]'
    : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_4px_12px_-6px_rgba(16,185,129,0.5)]'
  const themBg = 'bg-white border border-gray-200/70 text-gray-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

  const radius = isMe
    ? `rounded-2xl ${isLastOfRun ? 'rounded-br-md' : ''} ${!isFirstOfRun ? 'rounded-tr-md' : ''}`
    : `rounded-2xl ${isLastOfRun ? 'rounded-bl-md' : ''} ${!isFirstOfRun ? 'rounded-tl-md' : ''}`

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isFirstOfRun ? 'mt-2' : 'mt-0.5'}`}>
      <div className={`bubble-in max-w-[78%] sm:max-w-[68%] lg:max-w-[60%] px-3.5 py-2 ${radius} ${isMe ? meBg : themBg}`}>
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{content}</p>
        {isLastOfRun && (
          <div className={`flex items-center gap-1 mt-1 ${isMe ? 'text-white/70' : 'text-gray-400'}`}>
            <span className="text-[10.5px] tabular-nums">
              {new Date(createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {isMe && (
              <svg className={readAt ? 'text-sky-300' : 'text-white/40'} viewBox="0 0 20 12" width="18" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="1,7 4.5,10.5 10.5,2.5" />
                <polyline points="7,7 10.5,10.5 16.5,2.5" />
              </svg>
            )}
          </div>
        )}
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
        <div className="mx-auto w-14 h-14 rounded-2xl bg-white ring-1 ring-inset ring-black/5 flex items-center justify-center text-gray-400 shadow-sm">
          <span className="w-7 h-7 block">{icon}</span>
        </div>
        <h3 className="mt-4 font-semibold text-gray-900 tracking-tight">{title}</h3>
        <p className="text-[13px] text-gray-500 mt-1">{subtitle}</p>
      </div>
    </div>
  )
}
