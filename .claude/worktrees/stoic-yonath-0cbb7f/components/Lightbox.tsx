'use client'

import { useEffect, useState } from 'react'

interface Props {
  urls: string[]
  startIndex: number
  onClose: () => void
}

export default function Lightbox({ urls, startIndex, onClose }: Props) {
  const [idx, setIdx] = useState(startIndex)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIdx(i => Math.min(urls.length - 1, i + 1))
    }
    document.addEventListener('keydown', handler)
    // Prevent body scroll while open
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [urls.length, onClose])

  const prev = () => setIdx(i => Math.max(0, i - 1))
  const next = () => setIdx(i => Math.min(urls.length - 1, i + 1))

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors text-xl"
        aria-label="Schließen"
      >
        ✕
      </button>

      {/* Counter */}
      {urls.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm tabular-nums">
          {idx + 1} / {urls.length}
        </div>
      )}

      {/* Prev arrow */}
      {urls.length > 1 && idx > 0 && (
        <button
          onClick={e => { e.stopPropagation(); prev() }}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors text-2xl"
          aria-label="Vorheriges Bild"
        >
          ‹
        </button>
      )}

      {/* Image */}
      <img
        src={urls[idx]}
        alt={`Bild ${idx + 1}`}
        className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg select-none"
        onClick={e => e.stopPropagation()}
        draggable={false}
      />

      {/* Next arrow */}
      {urls.length > 1 && idx < urls.length - 1 && (
        <button
          onClick={e => { e.stopPropagation(); next() }}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors text-2xl"
          aria-label="Nächstes Bild"
        >
          ›
        </button>
      )}

      {/* Dot indicators */}
      {urls.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {urls.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setIdx(i) }}
              className={`w-2 h-2 rounded-full transition-colors ${i === idx ? 'bg-white' : 'bg-white/30 hover:bg-white/60'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
