'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { currentLocalDateKey } from '@/lib/body-weight'
import { summarizePeriodTracking } from '@/lib/period-tracking'
import { useToast } from '@/components/Motion'

type PeriodFlow = 'LIGHT' | 'MEDIUM' | 'HEAVY'
type PeriodSymptom = 'CRAMPS' | 'HEADACHE' | 'FATIGUE' | 'BACK_PAIN' | 'MOOD_CHANGES' | 'CRAVINGS'

type PeriodEntry = {
  id: string
  clientId: string
  startDate: string
  endDate: string | null
  flow: PeriodFlow | null
  symptoms: PeriodSymptom[]
  notes: string | null
  createdAt: string
  updatedAt: string
}

const FLOW_OPTIONS: Array<{ value: PeriodFlow; label: string }> = [
  { value: 'LIGHT', label: 'Leicht' },
  { value: 'MEDIUM', label: 'Mittel' },
  { value: 'HEAVY', label: 'Stark' },
]

const SYMPTOM_OPTIONS: Array<{ value: PeriodSymptom; label: string }> = [
  { value: 'CRAMPS', label: 'Krämpfe' },
  { value: 'HEADACHE', label: 'Kopfschmerzen' },
  { value: 'FATIGUE', label: 'Müdigkeit' },
  { value: 'BACK_PAIN', label: 'Rückenschmerzen' },
  { value: 'MOOD_CHANGES', label: 'Stimmung' },
  { value: 'CRAVINGS', label: 'Heißhunger' },
]

const FLOW_LABELS = Object.fromEntries(FLOW_OPTIONS.map(option => [option.value, option.label])) as Record<PeriodFlow, string>
const SYMPTOM_LABELS = Object.fromEntries(SYMPTOM_OPTIONS.map(option => [option.value, option.label])) as Record<PeriodSymptom, string>

const sortEntries = (entries: PeriodEntry[]) => [...entries].sort((a, b) => (
  b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt)
))

const formatDate = (dateKey: string) => new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${dateKey}T00:00:00.000Z`))

const periodDuration = (entry: PeriodEntry) => {
  if (!entry.endDate) return null
  const start = Date.parse(`${entry.startDate}T00:00:00.000Z`)
  const end = Date.parse(`${entry.endDate}T00:00:00.000Z`)
  return Math.round((end - start) / 86_400_000) + 1
}

function DropIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5s6 6.24 6 11a6 6 0 11-12 0c0-4.76 6-11 6-11z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.25 15.2a3.1 3.1 0 002.55 2.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export default function PeriodTracker() {
  const { showToast } = useToast()
  const today = currentLocalDateKey()
  const [entries, setEntries] = useState<PeriodEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState('')
  const [flow, setFlow] = useState<PeriodFlow | ''>('')
  const [symptoms, setSymptoms] = useState<PeriodSymptom[]>([])
  const [notes, setNotes] = useState('')

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/backend/me/period-entries?limit=24', { cache: 'no-store' })
      const payload = await response.json().catch(() => null) as { periodEntries?: PeriodEntry[]; message?: string } | null
      if (!response.ok) {
        setError(payload?.message ?? 'Zyklusdaten konnten nicht geladen werden.')
        return
      }
      setEntries(sortEntries(payload?.periodEntries ?? []))
    } catch {
      setError('Zyklusdaten konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadEntries() }, [loadEntries])

  const summary = useMemo(
    () => summarizePeriodTracking(entries, today),
    [entries, today],
  )

  const resetForm = () => {
    setStartDate(today)
    setEndDate('')
    setFlow('')
    setSymptoms([])
    setNotes('')
    setError(null)
  }

  const toggleSymptom = (symptom: PeriodSymptom) => {
    setSymptoms(current => current.includes(symptom)
      ? current.filter(item => item !== symptom)
      : [...current, symptom])
  }

  const saveEntry = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/backend/me/period-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate: endDate || null,
          flow: flow || null,
          symptoms,
          notes: notes.trim() || null,
        }),
      })
      const payload = await response.json().catch(() => null) as { periodEntry?: PeriodEntry; message?: string } | null
      if (!response.ok || !payload?.periodEntry) {
        setError(payload?.message ?? 'Eintrag konnte nicht gespeichert werden.')
        return
      }

      setEntries(current => sortEntries([...current, payload.periodEntry!]))
      resetForm()
      setShowForm(false)
      showToast('Periode eingetragen ✓', 'success')
    } catch {
      setError('Netzwerkfehler beim Speichern.')
    } finally {
      setSaving(false)
    }
  }

  const finishActivePeriod = async (entry: PeriodEntry) => {
    setMutatingId(entry.id)
    setError(null)
    try {
      const response = await fetch(`/api/backend/me/period-entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endDate: today }),
      })
      const payload = await response.json().catch(() => null) as { periodEntry?: PeriodEntry; message?: string } | null
      if (!response.ok || !payload?.periodEntry) {
        setError(payload?.message ?? 'Eintrag konnte nicht aktualisiert werden.')
        return
      }
      setEntries(current => sortEntries(current.map(item => item.id === entry.id ? payload.periodEntry! : item)))
      showToast('Periode als beendet markiert ✓', 'success')
    } catch {
      setError('Netzwerkfehler beim Aktualisieren.')
    } finally {
      setMutatingId(null)
    }
  }

  const deleteEntry = async (entry: PeriodEntry) => {
    if (!window.confirm(`Eintrag vom ${formatDate(entry.startDate)} wirklich löschen?`)) return
    setMutatingId(entry.id)
    setError(null)
    try {
      const response = await fetch(`/api/backend/me/period-entries/${entry.id}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null) as { message?: string } | null
      if (!response.ok) {
        setError(payload?.message ?? 'Eintrag konnte nicht gelöscht werden.')
        return
      }
      setEntries(current => current.filter(item => item.id !== entry.id))
      showToast('Zykluseintrag gelöscht', 'success')
    } catch {
      setError('Netzwerkfehler beim Löschen.')
    } finally {
      setMutatingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#F472B6] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-[#F472B6]/20 bg-gradient-to-br from-[#20131c] via-[#151116] to-[#111111] p-5 shadow-[0_20px_70px_rgba(244,114,182,0.08)]">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#F472B6]/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F472B6]/15 text-[#F9A8D4] ring-1 ring-[#F472B6]/20">
              <DropIcon />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9A8D4]">Dein Zyklus</p>
            <h2 className="mt-1 text-2xl font-bold text-[#EDECEA]">
              {summary.activeEntry ? 'Periode läuft' : summary.predictedNextStart ? `Voraussichtlich ${formatDate(summary.predictedNextStart)}` : 'Ersten Eintrag anlegen'}
            </h2>
            <p className="mt-2 max-w-[290px] text-xs leading-5 text-[#8E8A91]">
              {summary.activeEntry
                ? `Gestartet am ${formatDate(summary.activeEntry.startDate)}. Du kannst sie mit einem Tipp als beendet markieren.`
                : summary.daysUntilNext !== null
                  ? summary.daysUntilNext >= 0
                    ? `Noch ungefähr ${summary.daysUntilNext} ${summary.daysUntilNext === 1 ? 'Tag' : 'Tage'} – eine Schätzung aus deinen Einträgen.`
                    : 'Der geschätzte Termin ist vorbei. Trage den neuen Start ein, sobald du möchtest.'
                  : 'Mit regelmäßigen Einträgen entsteht hier deine persönliche Übersicht.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (showForm) resetForm()
              setShowForm(current => !current)
            }}
            className="press relative rounded-xl bg-[#F472B6] px-3.5 py-2.5 text-xs font-bold text-[#190811] shadow-lg shadow-[#F472B6]/10 transition hover:bg-[#F9A8D4]"
          >
            {showForm ? 'Schließen' : '+ Eintragen'}
          </button>
        </div>

        {entries.length > 0 && (
          <div className="relative mt-5 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-4">
            <div>
              <div className="text-xl font-bold text-[#EDECEA]">{summary.currentCycleDay ?? '–'}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[#797D83]">Zyklustag</div>
            </div>
            <div>
              <div className="text-xl font-bold text-[#EDECEA]">{summary.averageCycleDays ?? '–'}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[#797D83]">Ø Zyklus</div>
            </div>
            <div>
              <div className="text-xl font-bold text-[#EDECEA]">{summary.averagePeriodDays ?? '–'}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[#797D83]">Ø Periode</div>
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={saveEntry} className="rounded-2xl border border-white/[0.07] bg-[#111111] p-5 shadow-sm">
          <div className="mb-5">
            <h3 className="font-semibold text-[#EDECEA]">Periode eintragen</h3>
            <p className="mt-1 text-xs text-[#797D83]">Nur der Start ist erforderlich. Alles Weitere ist optional.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-[#A9A6AC]">
              Start
              <input
                type="date"
                required
                max={today}
                value={startDate}
                onChange={event => setStartDate(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#0B0B0B] px-3 py-2.5 text-sm text-[#EDECEA] outline-none focus:border-[#F472B6]/50 focus:ring-2 focus:ring-[#F472B6]/10"
              />
            </label>
            <label className="text-xs font-medium text-[#A9A6AC]">
              Ende <span className="font-normal text-[#5F5C63]">optional</span>
              <input
                type="date"
                min={startDate}
                max={today}
                value={endDate}
                onChange={event => setEndDate(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#0B0B0B] px-3 py-2.5 text-sm text-[#EDECEA] outline-none focus:border-[#F472B6]/50 focus:ring-2 focus:ring-[#F472B6]/10"
              />
            </label>
          </div>

          <fieldset className="mt-5">
            <legend className="text-xs font-medium text-[#A9A6AC]">Stärke</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {FLOW_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={flow === option.value}
                  onClick={() => setFlow(current => current === option.value ? '' : option.value)}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${flow === option.value ? 'border-[#F472B6]/50 bg-[#F472B6]/15 text-[#F9A8D4]' : 'border-white/[0.07] bg-[#0B0B0B] text-[#797D83] hover:text-[#EDECEA]'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-xs font-medium text-[#A9A6AC]">Symptome</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SYMPTOM_OPTIONS.map(option => {
                const selected = symptoms.includes(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleSymptom(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${selected ? 'border-[#F472B6]/40 bg-[#F472B6]/12 text-[#F9A8D4]' : 'border-white/[0.07] text-[#797D83] hover:text-[#EDECEA]'}`}
                  >
                    {selected ? '✓ ' : ''}{option.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className="mt-5 block text-xs font-medium text-[#A9A6AC]">
            Notiz <span className="font-normal text-[#5F5C63]">optional</span>
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Wie fühlst du dich?"
              className="mt-1.5 w-full resize-none rounded-xl border border-white/[0.08] bg-[#0B0B0B] px-3 py-2.5 text-sm text-[#EDECEA] outline-none placeholder:text-[#4E4B51] focus:border-[#F472B6]/50 focus:ring-2 focus:ring-[#F472B6]/10"
            />
          </label>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => { resetForm(); setShowForm(false) }}
              disabled={saving}
              className="press flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm font-medium text-[#797D83] disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="press flex-1 rounded-xl bg-[#F472B6] py-2.5 text-sm font-bold text-[#190811] transition hover:bg-[#F9A8D4] disabled:opacity-50"
            >
              {saving ? 'Speichert…' : 'Speichern'}
            </button>
          </div>
        </form>
      )}

      {summary.activeEntry && !showForm && (
        <button
          type="button"
          onClick={() => void finishActivePeriod(summary.activeEntry as PeriodEntry)}
          disabled={mutatingId === (summary.activeEntry as PeriodEntry).id}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl border border-[#F472B6]/20 bg-[#F472B6]/8 py-3 text-sm font-semibold text-[#F9A8D4] disabled:opacity-50"
        >
          <span className="h-2 w-2 rounded-full bg-[#F472B6]" />
          {mutatingId === (summary.activeEntry as PeriodEntry).id ? 'Wird gespeichert…' : 'Periode heute beendet'}
        </button>
      )}

      <section className="rounded-2xl border border-white/[0.06] bg-[#111111] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[#EDECEA]">Verlauf</h3>
            <p className="mt-0.5 text-xs text-[#797D83]">Deine letzten 24 Einträge</p>
          </div>
          <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-[#8E8A91]">{entries.length}</span>
        </div>

        {entries.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F472B6]/10 text-[#F9A8D4]">
              <DropIcon className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-medium text-[#EDECEA]">Noch keine Einträge</p>
            <p className="mx-auto mt-1 max-w-[260px] text-xs leading-5 text-[#797D83]">Trage den ersten Tag deiner Periode ein, um deinen persönlichen Verlauf zu starten.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {entries.map(entry => {
              const duration = periodDuration(entry)
              return (
                <article key={entry.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${entry.endDate ? 'bg-white/[0.04] text-[#8E8A91]' : 'bg-[#F472B6]/15 text-[#F9A8D4]'}`}>
                        <DropIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#EDECEA]">
                          {formatDate(entry.startDate)}
                          {entry.endDate ? ` – ${formatDate(entry.endDate)}` : ''}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#797D83]">
                          <span>{duration ? `${duration} ${duration === 1 ? 'Tag' : 'Tage'}` : 'Aktuell'}</span>
                          {entry.flow && <><span className="text-[#454249]">•</span><span>{FLOW_LABELS[entry.flow]}</span></>}
                        </div>
                        {entry.symptoms.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {entry.symptoms.map(symptom => (
                              <span key={symptom} className="rounded-full bg-white/[0.04] px-2 py-1 text-[10px] text-[#8E8A91]">
                                {SYMPTOM_LABELS[symptom]}
                              </span>
                            ))}
                          </div>
                        )}
                        {entry.notes && <p className="mt-2 text-xs leading-5 text-[#8E8A91]">{entry.notes}</p>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteEntry(entry)}
                      disabled={mutatingId === entry.id}
                      aria-label={`Eintrag vom ${formatDate(entry.startDate)} löschen`}
                      className="rounded-lg p-2 text-[#555159] transition hover:bg-red-400/10 hover:text-red-300 disabled:opacity-40"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <div className="flex gap-2 rounded-2xl border border-white/[0.05] bg-white/[0.025] px-4 py-3 text-[11px] leading-5 text-[#6F6B73]">
        <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#A78BFA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></svg>
        <p>Deine Zyklusdaten sind privat und nur in deinem Kundenkonto abrufbar. Prognosen sind Schätzungen und keine medizinische Beratung.</p>
      </div>
    </div>
  )
}
