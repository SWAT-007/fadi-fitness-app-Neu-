'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  onScan: (barcode: string) => void
  onClose: () => void
}

export default function BarcodeScannerModal({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'loading' | 'scanning' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  // Keep a stable ref to onScan so the effect doesn't re-run on re-render
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan }, [onScan])

  useEffect(() => {
    let stopped = false
    let stopControls: (() => void) | null = null

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (stopped || !videoRef.current) return

        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, _err, ctrl) => {
            if (result && !stopped) {
              stopped = true
              ctrl.stop()
              onScanRef.current(result.getText())
            }
          }
        )

        stopControls = () => controls.stop()

        if (stopped) {
          controls.stop()
        } else {
          setStatus('scanning')
        }
      } catch (err) {
        if (stopped) return
        const e = err as Error
        let msg = 'Kamera nicht verfügbar.'
        if (e.name === 'NotAllowedError')
          msg = 'Kamera-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.'
        else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError')
          msg = 'Keine Kamera gefunden.'
        else if (e.name === 'NotSupportedError')
          msg = 'Kamera benötigt eine HTTPS-Verbindung.'
        else if (e.message)
          msg = `Kamera-Fehler: ${e.message}`
        setErrorMsg(msg)
        setStatus('error')
      }
    }

    start()

    return () => {
      stopped = true
      stopControls?.()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#111318] rounded-2xl border border-white/[0.08] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.7)] w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#A78BFA]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
              <rect x="7" y="7" width="10" height="10" rx="1.5" />
            </svg>
            <span className="text-[#EDECEA] font-semibold text-sm">Barcode scannen</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="press p-1.5 rounded-lg text-[#797D83] hover:text-[#EDECEA] hover:bg-white/[0.06] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {status === 'error' ? (
            <div className="py-10 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <p className="text-sm text-red-400 px-2 leading-relaxed">{errorMsg}</p>
              <button
                type="button"
                onClick={onClose}
                className="press px-4 py-2 bg-white/[0.06] hover:bg-white/[0.09] text-[#EDECEA] text-sm font-medium rounded-xl transition-colors"
              >
                Schließen
              </button>
            </div>
          ) : (
            <>
              {/* Camera viewport */}
              <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '4/3' }}>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />

                {/* Overlay with cutout frame */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="relative z-10 w-60 h-28">
                    {/* Corner brackets */}
                    <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#A78BFA] rounded-tl-md" />
                    <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#A78BFA] rounded-tr-md" />
                    <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#A78BFA] rounded-bl-md" />
                    <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#A78BFA] rounded-br-md" />
                    {/* Scan line */}
                    {status === 'scanning' && (
                      <span
                        className="absolute left-2 right-2 h-px bg-gradient-to-r from-transparent via-[#A78BFA] to-transparent animate-bounce"
                        style={{ top: '50%' }}
                      />
                    )}
                  </div>
                </div>

                {/* Loading spinner */}
                {status === 'loading' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
                    <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              <p className="text-xs text-[#797D83] text-center mt-3">
                {status === 'loading' ? 'Kamera wird gestartet…' : 'Barcode in den Rahmen halten · automatisch erkannt'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
