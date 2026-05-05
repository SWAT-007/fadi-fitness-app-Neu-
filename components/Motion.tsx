'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'

type ToastKind = 'success' | 'info' | 'danger'

type Toast = {
  id: number
  kind: ToastKind
  message: string
}

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const toastStyle: Record<ToastKind, string> = {
  success: 'border-emerald-200 bg-emerald-600 text-white shadow-emerald-200/70',
  info: 'border-blue-200 bg-blue-600 text-white shadow-blue-200/70',
  danger: 'border-red-200 bg-red-600 text-white shadow-red-200/70',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const showToast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId.current++
    setToasts(prev => [...prev, { id, kind, message }])
    window.setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 2000)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`motion-toast pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl ${toastStyle[toast.kind]}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) return { showToast: () => undefined }
  return context
}

export function PageFade({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`motion-page-fade ${className}`}>{children}</div>
}

export function Collapsible({
  open,
  children,
  className = '',
}: {
  open: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      } ${className}`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}

export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 500,
  suffix = '',
}: {
  value: number
  decimals?: number
  duration?: number
  suffix?: string
}) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const startValue = display
    const diff = value - startValue
    if (Math.abs(diff) < 0.001) return

    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(startValue + diff * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // display is intentionally captured as the current animation start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return <>{display.toFixed(decimals)}{suffix}</>
}

export function AnimatedBar({
  value,
  max,
  color,
  className = '',
}: {
  value: number
  max: number
  color: string
  className?: string
}) {
  const [mounted, setMounted] = useState(false)
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-gray-100 ${className}`}>
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${mounted ? pct : 0}%`, backgroundColor: color }}
      />
    </div>
  )
}

export function StaggerItem({
  index,
  children,
  className = '',
}: {
  index: number
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`motion-stagger ${className}`}
      style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
    >
      {children}
    </div>
  )
}

type SuccessButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  success: boolean
  successLabel?: ReactNode
}

export function SuccessButton({
  success,
  successLabel = '✓',
  children,
  className = '',
  ...props
}: SuccessButtonProps) {
  return (
    <button
      {...props}
      className={`${className} ${success ? 'motion-success-pulse bg-emerald-600 text-white ring-4 ring-emerald-200' : ''}`}
    >
      {success ? successLabel : children}
    </button>
  )
}
