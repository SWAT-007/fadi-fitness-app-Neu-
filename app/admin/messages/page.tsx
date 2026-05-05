'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Client, Message, Profile } from '@/lib/types'
import { StaggerItem, SuccessButton, useToast } from '@/components/Motion'

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
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

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

      // Select initial client
      if (initialClientId) {
        const found = clientList.find(c => c.id === initialClientId)
        if (found) setSelectedClient(found)
      }

      setLoading(false)
    }
    init()
  }, [initialClientId])

  // Load messages when client selected
  useEffect(() => {
    if (!selectedClient?.user_id || !myProfile) {
      setMessages([])
      return
    }

    const loadMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(*)')
        .or(`and(sender_id.eq.${myProfile.id},receiver_id.eq.${selectedClient.user_id}),and(sender_id.eq.${selectedClient.user_id},receiver_id.eq.${myProfile.id})`)
        .order('created_at')
      setMessages((data ?? []) as Message[])
    }
    loadMessages()

    // Real-time subscription
    const channel = supabase
      .channel(`messages-${selectedClient.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new as Message
        if (
          (msg.sender_id === myProfile.id && msg.receiver_id === selectedClient.user_id) ||
          (msg.sender_id === selectedClient.user_id && msg.receiver_id === myProfile.id)
        ) {
          setMessages(prev => [...prev, msg])
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedClient, myProfile])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedClient?.user_id || !myProfile) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      sender_id: myProfile.id,
      receiver_id: selectedClient.user_id,
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
    return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="h-[calc(100vh-4rem)] lg:h-screen flex">
      {/* Client list */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Nachrichten</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {clients.length === 0 ? (
            <p className="text-sm text-gray-400 p-4">Keine Kunden vorhanden.</p>
          ) : (
            clients.map((client, index) => (
              <StaggerItem key={client.id} index={index}>
              <button
                onClick={() => {
                  setSelectedClient(client)
                  if (!client.user_id) setMessages([])
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${selectedClient?.id === client.id ? 'bg-indigo-50' : ''}`}
              >
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {client.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${selectedClient?.id === client.id ? 'text-indigo-700' : 'text-gray-900'}`}>
                    {client.full_name}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {client.user_id ? 'App-Nutzer' : 'Kein Zugang'}
                  </div>
                </div>
              </button>
              </StaggerItem>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedClient ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">💬</div>
              <p className="text-sm">Wähle einen Kunden aus</p>
            </div>
          </div>
        ) : !selectedClient.user_id ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">🔒</div>
              <p className="text-sm">{selectedClient.full_name} hat noch keinen App-Zugang.</p>
              <p className="text-xs mt-1">Kunden müssen sich registrieren, um Nachrichten empfangen zu können.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">
                {selectedClient.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-semibold text-gray-900 text-sm">{selectedClient.full_name}</div>
                <div className="text-xs text-gray-400">{selectedClient.email}</div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-center text-gray-400 text-sm mt-8">Noch keine Nachrichten.</p>
              )}
              {messages.map((msg, index) => {
                const isMe = msg.sender_id === myProfile?.id
                return (
                  <StaggerItem key={msg.id} index={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                      isMe
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm shadow-sm'
                    }`}>
                      <p>{msg.content}</p>
                      <p className={`text-xs mt-1 ${isMe ? 'text-indigo-200' : 'text-gray-400'}`}>
                        {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </StaggerItem>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="px-4 py-4 border-t border-gray-200 bg-white flex gap-3">
              <input
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Nachricht schreiben…"
                className="flex-1 px-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <SuccessButton
                type="submit"
                disabled={sending || !newMessage.trim()}
                success={sent}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                Senden
              </SuccessButton>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
