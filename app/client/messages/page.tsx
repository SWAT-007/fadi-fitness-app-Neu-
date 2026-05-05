'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Message, Profile, Client } from '@/lib/types'
import { StaggerItem, SuccessButton, useToast } from '@/components/Motion'

export default function ClientMessagesPage() {
  const { showToast } = useToast()
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [trainerProfile, setTrainerProfile] = useState<Profile | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setMyProfile(prof)

      const { data: cl } = await supabase.from('clients').select('*').eq('user_id', user.id).maybeSingle()
      if (!cl) { setLoading(false); return }
      setClient(cl)

      // Get trainer profile
      const { data: trainer } = await supabase.from('profiles').select('*').eq('id', cl.trainer_id).single()
      setTrainerProfile(trainer)

      if (!prof || !trainer) { setLoading(false); return }

      // Load messages
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

  // Real-time subscription (separates Effect, damit Cleanup korrekt synchron läuft)
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
          setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [myProfile, trainerProfile])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !myProfile || !trainerProfile) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      sender_id: myProfile.id,
      receiver_id: trainerProfile.id,
      content: newMessage.trim(),
    })
    if (!error) {
      setSent(true)
      showToast('Nachricht gesendet ✓', 'info')
      window.setTimeout(() => setSent(false), 1500)
    }
    setNewMessage('')
    setSending(false)
  }

  if (loading) {
    return <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (!client || !trainerProfile) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="text-5xl mb-3">🔒</div>
        <p className="text-gray-500 text-sm">Du bist keinem Trainer zugeordnet.</p>
        <p className="text-gray-400 text-xs mt-1">Bitte registriere dich mit derselben E-Mail, die dein Trainer hinterlegt hat.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Chat header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">
          {trainerProfile.full_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-semibold text-gray-900 text-sm">{trainerProfile.full_name}</div>
          <div className="text-xs text-emerald-600">Dein Trainer</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-8">
            Noch keine Nachrichten. Schreib deinem Trainer!
          </p>
        )}
        {messages.map((msg, index) => {
          const isMe = msg.sender_id === myProfile?.id
          return (
            <StaggerItem key={msg.id} index={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                isMe
                  ? 'bg-emerald-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
              }`}>
                <p>{msg.content}</p>
                <p className={`text-xs mt-1 ${isMe ? 'text-emerald-200' : 'text-gray-400'}`}>
                  {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </StaggerItem>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="px-4 py-3 bg-white border-t border-gray-200 flex gap-3">
        <input
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Nachricht schreiben…"
          className="flex-1 px-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <SuccessButton
          type="submit"
          disabled={sending || !newMessage.trim()}
          success={sent}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          Senden
        </SuccessButton>
      </form>
    </div>
  )
}
