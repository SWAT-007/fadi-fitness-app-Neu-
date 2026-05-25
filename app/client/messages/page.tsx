'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Message, Profile, Client } from '@/lib/types'

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const Icon = {
  send: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.6L21 12 3.4 3.4 3 10l13 2-13 2 .4 6.6z" /></svg>,
  lock: <svg viewBox="0 0 24 24" {...stroke}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>,
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

export default function ClientMessagesPage() {
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [trainerProfile, setTrainerProfile] = useState<Profile | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sendingRef = useRef(false)
  const prevMessageCountRef = useRef(0)

  const appendMessage = useCallback((message: Message) => {
    setMessages(prev => {
      if (prev.some(existing => existing.id === message.id)) return prev
      return [...prev, message].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
    })
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setMyProfile(prof)

      const { data: cl } = await supabase.from('clients').select('*').eq('user_id', user.id).maybeSingle()
      if (!cl) { setLoading(false); return }
      setClient(cl)

      const { data: trainer } = await supabase.from('profiles').select('*').eq('id', cl.trainer_id).single()
      setTrainerProfile(trainer)

      if (!prof || !trainer) { setLoading(false); return }

      const { data: msgs } = await supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(*)')
        .or(`and(sender_id.eq.${prof.id},receiver_id.eq.${trainer.id}),and(sender_id.eq.${trainer.id},receiver_id.eq.${prof.id})`)
        .order('created_at')
      setMessages((msgs ?? []) as Message[])

      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('sender_id', trainer.id)
        .eq('receiver_id', prof.id)
        .is('read_at', null)

      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('client_id', user.id)
        .eq('type', 'message')
        .is('is_read', false)

      setLoading(false)
    }
    init()
  }, [])

  const loadConversation = useCallback(async () => {
    if (!myProfile || !trainerProfile) return
    const { data: msgs } = await supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(*)')
      .or(`and(sender_id.eq.${myProfile.id},receiver_id.eq.${trainerProfile.id}),and(sender_id.eq.${trainerProfile.id},receiver_id.eq.${myProfile.id})`)
      .order('created_at')
    setMessages((msgs ?? []) as Message[])
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', trainerProfile.id)
      .eq('receiver_id', myProfile.id)
      .is('read_at', null)
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('client_id', myProfile.id)
      .eq('type', 'message')
      .eq('is_read', false)
  }, [myProfile, trainerProfile])

  useEffect(() => {
    if (!myProfile || !trainerProfile) return
    const meId = myProfile.id
    const trainerId = trainerProfile.id

    const channel = supabase
      .channel(`client-messages-${meId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new as Message
        if (
          (msg.sender_id === meId && msg.receiver_id === trainerId) ||
          (msg.sender_id === trainerId && msg.receiver_id === meId)
        ) {
          appendMessage(msg)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [myProfile, trainerProfile, appendMessage])

  useEffect(() => {
    if (!myProfile || !trainerProfile) return
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
  }, [myProfile, trainerProfile, loadConversation])

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
    if (!newMessage.trim() || !myProfile || !trainerProfile || !client) return
    sendingRef.current = true
    const content = newMessage.trim()
    setSending(true)
    setNewMessage('')
    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: myProfile.id, receiver_id: trainerProfile.id, content })
      .select('*, sender:profiles!messages_sender_id_fkey(*)')
      .single()
    if (!error && data) {
      appendMessage(data as Message)
      // Notify the trainer
      const senderName = myProfile.full_name || client.full_name || 'Ein Kunde'
      const notification = {
        client_id: trainerProfile.id,
        type: 'message',
        title: `${senderName} hat dir eine Nachricht geschickt`,
        body: content.slice(0, 60),
        is_read: false,
      }
      console.log('[Notifications] client->trainer message insert', {
        insertedClientId: notification.client_id,
        trainerAuthUserId: trainerProfile.id,
        clientTrainerId: client.trainer_id,
        clientAuthUserId: myProfile.id,
        clientRowId: client.id,
        insertsTrainerUserId: notification.client_id === trainerProfile.id,
        insertsClientOwnId: notification.client_id === myProfile.id,
      })
      const { data: sessionData } = await supabase.auth.getSession()
      const notificationResponse = await fetch('/api/notifications/client-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ content }),
      })
      const notificationResult = await notificationResponse.json().catch(() => null)
      console.log('[Notifications] client->trainer insert result', notificationResult)
      if (!notificationResponse.ok) {
        console.error('[Notifications] client->trainer insert failed:', notificationResult)
      }
    }
    if (error) {
      setNewMessage(content)
    }
    setSending(false)
    sendingRef.current = false
    inputRef.current?.focus()
  }

  if (loading) {
    return <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (!client || !trainerProfile) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-white ring-1 ring-inset ring-black/5 flex items-center justify-center text-gray-400 shadow-sm">
          <span className="w-7 h-7 block">{Icon.lock}</span>
        </div>
        <p className="mt-4 text-gray-700 text-[14px] font-medium">Du bist keinem Trainer zugeordnet</p>
        <p className="text-gray-500 text-[12.5px] mt-1 max-w-xs">
          Bitte registriere dich mit derselben E-Mail, die dein Trainer hinterlegt hat.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 bg-gradient-to-b from-gray-50 to-white">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center px-6">
              <p className="text-gray-500 text-[13px] font-medium">Noch keine Nachrichten</p>
              <p className="text-gray-400 text-[12px] mt-1">Schreib deinem Trainer die erste Nachricht!</p>
            </div>
          </div>
        ) : (
          <MessageList messages={messages} myId={myProfile?.id ?? ''} accent="emerald" />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="px-3 py-3 bg-white border-t border-gray-200/70">
        <div className="flex items-end gap-2 bg-gray-50 border border-gray-200/80 rounded-2xl px-3 py-2 focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-100 transition-all">
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
            className="press shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-emerald-500 to-teal-600 shadow-[0_4px_12px_-4px_rgba(16,185,129,0.55)] disabled:opacity-40 disabled:shadow-none transition-opacity"
            aria-label="Senden"
          >
            {sending ? (
              <span className="text-[10px] font-semibold">…</span>
            ) : (
              <span className="w-4 h-4 block translate-x-[1px]">{Icon.send}</span>
            )}
          </button>
        </div>
      </form>
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
      <div className={`bubble-in max-w-[80%] sm:max-w-[68%] px-3.5 py-2 ${radius} ${isMe ? meBg : themBg}`}>
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{content}</p>
        <div className={`flex items-center gap-1 mt-1 ${isMe ? 'text-white/70' : 'text-gray-400'}`}>
          <span className="text-[10.5px] tabular-nums">
            {formatMessageTimestamp(createdAt)}
          </span>
          {isMe && isLastOfRun && (
            <svg className={readAt ? 'text-sky-300' : 'text-white/40'} viewBox="0 0 20 12" width="18" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="1,7 4.5,10.5 10.5,2.5" />
              <polyline points="7,7 10.5,10.5 16.5,2.5" />
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
