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
      setLoading(false)
    }
    init()
  }, [])

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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [newMessage])

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!newMessage.trim() || !myProfile || !trainerProfile) return
    const content = newMessage.trim()
    setSending(true)
    setNewMessage('')
    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: myProfile.id, receiver_id: trainerProfile.id, content })
      .select('*, sender:profiles!messages_sender_id_fkey(*)')
      .single()
    if (!error && data) appendMessage(data as Message)
    setSending(false)
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

  const trainerName = trainerProfile.full_name ?? 'Trainer'
  const grad = avatarGradient(trainerName)

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Chat header — gradient card */}
      <header className="relative overflow-hidden mx-3 mt-3 rounded-2xl px-4 py-3 text-white bg-gradient-to-br from-[#0b0c0f] via-[#111318] to-[#1a1d24] shadow-[0_8px_24px_-16px_rgba(0,0,0,0.5)]">
        <span className="pointer-events-none absolute -right-8 -top-8 w-28 h-28 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div
            className={`shrink-0 w-10 h-10 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center font-semibold text-[14px] ring-2 ring-white/20`}
          >
            {trainerName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[14px] tracking-tight truncate">{trainerName}</div>
            <div className="text-[11.5px] text-white/60">Dein Trainer</div>
          </div>
        </div>
      </header>

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
            <span className="w-4 h-4 block translate-x-[1px]">{Icon.send}</span>
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
  isMe, content, createdAt, isFirstOfRun, isLastOfRun, accent,
}: {
  isMe: boolean; content: string; createdAt: string;
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
        {isLastOfRun && (
          <p className={`text-[10.5px] mt-1 tabular-nums ${isMe ? 'text-white/70' : 'text-gray-400'}`}>
            {new Date(createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  )
}

