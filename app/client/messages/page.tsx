'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from '@/lib/types'

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

type BackendParticipant = {
  id: string
  fullName: string | null
  email: string | null
}

type BackendClientSummary = {
  id: string
  userId: string | null
  fullName: string
  email: string
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
          role: 'trainer',
          created_at: '',
        }
      : undefined,
  }
}

export default function ClientMessagesPage() {
  const [myUserId, setMyUserId] = useState('')
  const [trainer, setTrainer] = useState<BackendParticipant | null>(null)
  const [client, setClient] = useState<BackendClientSummary | null>(null)
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

  const markConversationRead = useCallback(async (trainerId: string, currentUserId: string) => {
    try {
      const response = await fetch('/api/backend/me/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!response.ok) return

      const readAt = new Date().toISOString()
      setMessages(prev => prev.map(message => (
        message.sender_id === trainerId && message.receiver_id === currentUserId && !message.read_at
          ? { ...message, read_at: readAt }
          : message
      )))
    } catch (error) {
      console.error('[Messages] mark read failed:', error)
    }
  }, [])

  const loadConversation = useCallback(async () => {
    try {
      const response = await fetch('/api/backend/me/messages', { cache: 'no-store' })
      const data = await response.json().catch(() => null) as {
        client?: BackendClientSummary | null
        trainer?: BackendParticipant | null
        messages?: BackendMessage[]
        message?: string
      } | null

      if (!response.ok) {
        if (response.status === 404) {
          setClient(null)
          setTrainer(null)
          setMyUserId('')
          setMessages([])
          return
        }
        throw new Error(data?.message ?? 'Load failed')
      }

      const nextClient = data?.client ?? null
      const nextTrainer = data?.trainer ?? null
      const mappedMessages = ((data?.messages ?? []) as BackendMessage[]).map(mapMessage)

      setClient(nextClient)
      setTrainer(nextTrainer)
      setMyUserId(nextClient?.userId ?? '')
      setMessages(mappedMessages)

      if (nextClient?.userId && nextTrainer?.id) {
        await markConversationRead(nextTrainer.id, nextClient.userId)
      }
    } catch (error) {
      console.error('[Messages] load failed:', error)
    } finally {
      setLoading(false)
    }
  }, [markConversationRead])

  useEffect(() => {
    void loadConversation()
  }, [loadConversation])

  useEffect(() => {
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
  }, [loadConversation])

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
    if (!newMessage.trim() || !trainer?.id || !client?.userId) return
    sendingRef.current = true
    const content = newMessage.trim()
    setSending(true)
    setNewMessage('')
    try {
      const response = await fetch('/api/backend/me/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await response.json().catch(() => null) as {
        message?: BackendMessage | string
        notificationCreated?: boolean
      } | null

      if (!response.ok || !data || typeof data.message === 'string' || !data.message) {
        setNewMessage(content)
        return
      }

      appendMessage(mapMessage(data.message))
      await markConversationRead(trainer.id, client.userId)
    } catch (error) {
      console.error('[Messages] send failed:', error)
      setNewMessage(content)
    } finally {
      setSending(false)
      sendingRef.current = false
      inputRef.current?.focus()
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!client || !trainer) {
    return (
      <div className="max-w-[480px] mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#111111] border border-white/[0.08] flex items-center justify-center text-[#797D83]">
          <span className="w-7 h-7 block">{Icon.lock}</span>
        </div>
        <p className="mt-4 text-[#EDECEA] text-[14px] font-medium">Du bist keinem Trainer zugeordnet</p>
        <p className="text-[#797D83] text-[12.5px] mt-1 max-w-xs leading-relaxed">
          Bitte registriere dich mit derselben E-Mail, die dein Trainer hinterlegt hat.
        </p>
      </div>
    )
  }

  const trainerInitial = (trainer.fullName ?? trainer.email ?? 'T').charAt(0).toUpperCase()

  return (
    <div className="max-w-[480px] mx-auto flex flex-col" style={{ height: 'calc(100dvh - 4rem - 170px)' }}>

      {/* Trainer info bar */}
      <div className="flex-none px-4 py-3 border-b border-white/[0.06] flex items-center gap-3 bg-[#0b0c0f]/80 backdrop-blur-sm">
        <div className="w-9 h-9 rounded-full bg-[#A78BFA]/15 border border-[#A78BFA]/20 flex items-center justify-center text-[#A78BFA] text-[14px] font-bold">
          {trainerInitial}
        </div>
        <div>
          <div className="text-[13px] font-semibold text-[#EDECEA] leading-tight">{trainer.fullName ?? trainer.email}</div>
          <div className="text-[11px] text-[#797D83]">Dein Trainer</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center px-6">
              <p className="text-[#797D83] text-[13px] font-medium">Noch keine Nachrichten</p>
              <p className="text-[#797D83]/60 text-[12px] mt-1">Schreibe die erste Nachricht.</p>
            </div>
          </div>
        ) : (
          <MessageList messages={messages} myId={myUserId} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={sendMessage}
        className="flex-none px-4 py-3 border-t border-white/[0.06] bg-[#0b0c0f]/95 backdrop-blur-md"
      >
        <div className="flex items-end gap-2.5 bg-[#111111] border border-white/[0.08] rounded-2xl px-3.5 py-2 focus-within:border-[#A78BFA]/30 transition-colors">
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
            className="flex-1 resize-none bg-transparent text-[14px] py-1.5 max-h-[140px] text-[#EDECEA] placeholder-[#797D83]/60 focus:outline-none leading-relaxed"
          />
          <button
            type="submit"
            disabled={sending || !newMessage.trim()}
            className="press shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[#050504] bg-[#A78BFA] shadow-[0_4px_12px_-4px_rgba(167,139,250,0.45)] disabled:opacity-35 disabled:shadow-none transition-opacity"
            aria-label="Senden"
          >
            {sending ? (
              <span className="w-3 h-3 border-2 border-[#050504] border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="w-4 h-4 block translate-x-[1px]">{Icon.send}</span>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

function MessageList({ messages, myId }: { messages: Message[]; myId: string }) {
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
        <div key={gi} className="space-y-0.5">
          <div className="flex items-center justify-center my-3">
            <span className="px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-[10.5px] font-medium uppercase tracking-[0.1em] text-[#797D83]">
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
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

function Bubble({
  isMe, content, createdAt, readAt, isFirstOfRun, isLastOfRun,
}: {
  isMe: boolean; content: string; createdAt: string;
  readAt?: string | null;
  isFirstOfRun: boolean; isLastOfRun: boolean;
}) {
  const meBg = 'bg-[#A78BFA] text-[#050504] shadow-[0_4px_14px_-6px_rgba(167,139,250,0.5)]'
  const themBg = 'bg-[#1a1a1a] border border-white/[0.07] text-[#EDECEA]'

  const radius = isMe
    ? `rounded-2xl ${isLastOfRun ? 'rounded-br-md' : ''} ${!isFirstOfRun ? 'rounded-tr-md' : ''}`
    : `rounded-2xl ${isLastOfRun ? 'rounded-bl-md' : ''} ${!isFirstOfRun ? 'rounded-tl-md' : ''}`

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isFirstOfRun ? 'mt-2' : 'mt-0.5'}`}>
      <div className={`bubble-in max-w-[80%] sm:max-w-[70%] px-3.5 py-2.5 ${radius} ${isMe ? meBg : themBg}`}>
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{content}</p>
        <div className={`flex items-center gap-1 mt-1 ${isMe ? 'text-[#050504]/55' : 'text-[#797D83]'}`}>
          <span className="text-[10.5px] tabular-nums">
            {formatMessageTimestamp(createdAt)}
          </span>
          {isMe && isLastOfRun && (
            <svg
              className={readAt ? 'text-[#050504]/70' : 'text-[#050504]/35'}
              viewBox="0 0 20 12" width="18" height="10"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="1,7 4.5,10.5 10.5,2.5" />
              <polyline points="7,7 10.5,10.5 16.5,2.5" />
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
