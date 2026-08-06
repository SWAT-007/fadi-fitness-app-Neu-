'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ClientGender } from '@/lib/types'

export default function NewClientPage() {
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState<ClientGender | ''>('')
  const [notes, setNotes] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!fullName.trim()) {
      setError('Name ist erforderlich.')
      return
    }

    // Password is optional. If set, an email is required and it must be ≥ 6 chars.
    const wantsLogin = password.length > 0
    if (wantsLogin && !email.trim()) {
      setError('Für ein Passwort ist eine E-Mail erforderlich.')
      return
    }
    if (wantsLogin && password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen haben.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/backend/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          gender: gender || null,
          notes: notes.trim(),
          ...(wantsLogin ? { password } : {}),
        }),
      })

      const payload = await response.json().catch(() => null) as {
        message?: string
        error?: string
      } | null

      if (!response.ok) {
        if (response.status === 401) {
          setError('Backend-Login erforderlich.')
        } else {
          setError(payload?.message ?? payload?.error ?? 'Unbekannter Fehler.')
        }
        setSaving(false)
        return
      }

      router.push('/admin/clients')
    } catch {
      setError('Netzwerkfehler beim Erstellen des Kunden.')
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/clients" className="text-sm text-[#797D83] hover:text-[#EDECEA] transition-colors">
          ← Zurück zu Kunden
        </Link>
        <h1 className="text-2xl font-bold text-[#EDECEA] mt-3">Neuer Kunde</h1>
        <p className="text-[#797D83] text-sm mt-1">
          Erstellt ein Kundenprofil im neuen Backend.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#111318] border border-white/[0.08] rounded-2xl shadow-lg p-6 space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-[#797D83] mb-1.5">
            Name
          </label>
          <input
            id="full_name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            autoFocus
            placeholder="Max Mustermann"
            className="w-full px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61]"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[#797D83] mb-1.5">
            E-Mail <span className="text-[#555A61] font-normal">(optional)</span>
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="max@example.com"
            className="w-full px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61]"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-[#797D83] mb-1.5">
            Telefon <span className="text-[#555A61] font-normal">(optional)</span>
          </label>
          <input
            id="phone"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+49 123 456789"
            className="w-full px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61]"
          />
        </div>

        <div>
          <label htmlFor="gender" className="block text-sm font-medium text-[#797D83] mb-1.5">
            Geschlecht <span className="text-[#555A61] font-normal">(optional)</span>
          </label>
          <select
            id="gender"
            value={gender}
            onChange={e => setGender(e.target.value as ClientGender | '')}
            className="w-full px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition"
          >
            <option value="">Nicht angegeben</option>
            <option value="FEMALE">Weiblich</option>
            <option value="MALE">Männlich</option>
            <option value="DIVERSE">Divers</option>
          </select>
          <p className="text-xs text-[#555A61] mt-1.5">
            Bei „Weiblich“ wird in der Kunden-App das private Zyklus-Tracking freigeschaltet.
          </p>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-[#797D83] mb-1.5">
            Notiz <span className="text-[#555A61] font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Interne Notiz"
            className="w-full px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61] resize-none"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[#797D83] mb-1.5">
            Passwort <span className="text-[#555A61] font-normal">(optional)</span>
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            placeholder="Mindestens 6 Zeichen"
            className="w-full px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61]"
          />
          <p className="text-xs text-[#555A61] mt-1.5">
            Leer lassen = nur Profil, Login später. Mit Passwort kann sich der Kunde sofort anmelden (E-Mail erforderlich).
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/clients"
            className="press flex-1 py-2.5 border border-white/[0.08] text-[#797D83] hover:text-[#EDECEA] hover:bg-white/[0.04] text-sm font-medium rounded-xl transition-colors text-center"
          >
            Abbrechen
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="press flex-1 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
          >
            {saving ? 'Wird erstellt…' : 'Kunde erstellen'}
          </button>
        </div>
      </form>
    </div>
  )
}
