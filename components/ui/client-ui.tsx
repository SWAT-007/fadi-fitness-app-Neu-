'use client'

import { type ReactNode } from 'react'
import Image from 'next/image'

// ─── HeroImageCard ────────────────────────────────────────────────────────────
// Premium hero with trainer photo, dark gradient, neon rim light, text overlay.

export function HeroImageCard({
  src,
  alt = 'Trainer',
  height = 320,
  children,
}: {
  src: string
  alt?: string
  height?: number
  children?: ReactNode
}) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl w-full"
      style={{ height }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority
        className="object-cover object-top"
        style={{ filter: 'brightness(0.62) contrast(1.08) saturate(0.95)' }}
      />
      {/* Primary dark gradient from bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#050504] via-[#050504]/55 to-transparent" />
      {/* Side vignette */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#050504]/50 via-transparent to-[#050504]/30" />
      {/* Neon rim light — subtle top-right glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_10%,rgba(167,139,250,0.08)_0%,transparent_60%)] pointer-events-none" />
      {/* Neon bottom edge line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#A78BFA]/35 to-transparent" />
      {/* Content overlay */}
      <div className="absolute inset-0 flex flex-col justify-end p-5">
        {children}
      </div>
    </div>
  )
}

// ─── DarkCard ─────────────────────────────────────────────────────────────────

export function DarkCard({
  children,
  className = '',
  glow = false,
}: {
  children: ReactNode
  className?: string
  glow?: boolean
}) {
  return (
    <div
      className={`bg-[#111111] rounded-2xl border border-white/[0.06] ${glow ? 'shadow-[0_0_0_1px_rgba(167,139,250,0.08),0_8px_32px_rgba(167,139,250,0.04)]' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  icon,
  sub,
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
  sub?: string
}) {
  return (
    <DarkCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-card-title tabular-nums leading-none">
            {value}
          </div>
          {sub && <div className="text-[11px] text-[#A78BFA] font-medium mt-0.5">{sub}</div>}
          <div className="text-caption mt-1.5">{label}</div>
        </div>
        {icon && (
          <div className="shrink-0 w-9 h-9 rounded-xl bg-[#A78BFA]/10 flex items-center justify-center text-[#A78BFA]">
            <span className="w-4 h-4 block">{icon}</span>
          </div>
        )}
      </div>
    </DarkCard>
  )
}

// ─── ProgressRing ─────────────────────────────────────────────────────────────

export function ProgressRing({
  pct,
  size = 56,
  strokeWidth = 4,
  label,
}: {
  pct: number
  size?: number
  strokeWidth?: number
  label?: string
}) {
  const r = (size - strokeWidth * 2) / 2
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  const cx = size / 2

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        className="absolute inset-0 -rotate-90"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
      >
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke="rgba(167,139,250,0.12)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke="#A78BFA"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{
            transition: 'stroke-dasharray 700ms cubic-bezier(0.23,1,0.32,1)',
            filter: 'drop-shadow(0 0 4px rgba(167,139,250,0.55))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[13px] font-bold tabular-nums text-[#A78BFA] leading-none">
          {pct}%
        </span>
        {label && (
          <span className="text-[8px] text-[#797D83] mt-0.5 uppercase tracking-wide">{label}</span>
        )}
      </div>
    </div>
  )
}

// ─── NeonButton ───────────────────────────────────────────────────────────────

export function NeonButton({
  children,
  onClick,
  disabled = false,
  className = '',
  size = 'md',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass = size === 'sm'
    ? 'px-3 py-1.5 text-[12px]'
    : size === 'lg'
    ? 'px-6 py-4 text-[16px]'
    : 'px-4 py-3 text-[14px]'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`press inline-flex items-center justify-center gap-2 font-bold rounded-2xl bg-[#A78BFA] hover:bg-[#B79FFB] disabled:opacity-40 text-[#050504] tracking-wide transition-colors shadow-[0_4px_16px_-4px_rgba(167,139,250,0.45)] ${sizeClass} ${className}`}
    >
      {children}
    </button>
  )
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-section mb-2 px-1">
      {children}
    </p>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
// Unified premium empty state: purple-tinted icon, title, optional subtext + CTA.

export function EmptyState({
  icon,
  title,
  subtext,
  ctaLabel,
  ctaOnClick,
  className = '',
}: {
  icon: ReactNode
  title: string
  subtext?: string
  ctaLabel?: string
  ctaOnClick?: () => void
  className?: string
}) {
  return (
    <div className="w-full py-12 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-[rgba(139,92,246,0.12)] border border-[rgba(139,92,246,0.2)] flex items-center justify-center mb-1 text-[#A78BFA]">
        {icon}
      </div>
      <p className={`text-card-title ${className}`}>{title}</p>
      {subtext && <p className="text-caption max-w-[220px]">{subtext}</p>}
      {ctaLabel && (
        <button
          type="button"
          onClick={ctaOnClick}
          className="press mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)', border: 'none' }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  )
}
