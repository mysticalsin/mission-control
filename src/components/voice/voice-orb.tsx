'use client'

import React, { useCallback } from 'react'
import './voice-animations.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoiceOrbState = 'idle' | 'listening' | 'speaking' | 'processing'

interface VoiceOrbProps {
  state: VoiceOrbState
  onClick: () => void
  size?: number
  className?: string
}

// ---------------------------------------------------------------------------
// State-dependent visual configuration
// ---------------------------------------------------------------------------

interface OrbVisuals {
  readonly glowClass: string
  readonly ringClass: string
  readonly iconClass: string
  readonly label: string
}

const ORB_VISUALS: Record<VoiceOrbState, OrbVisuals> = {
  idle: {
    glowClass: 'voice-glow-idle',
    ringClass: 'border-slate-500/30',
    iconClass: 'text-slate-400',
    label: 'Ready',
  },
  listening: {
    glowClass: 'voice-glow-listen',
    ringClass: 'border-blue-500/50',
    iconClass: 'text-blue-400',
    label: 'Listening...',
  },
  speaking: {
    glowClass: 'voice-glow-speak',
    ringClass: 'border-green-500/50',
    iconClass: 'text-green-400',
    label: 'Speaking...',
  },
  processing: {
    glowClass: 'voice-glow-process',
    ringClass: 'border-amber-500/50',
    iconClass: 'text-amber-400',
    label: 'Processing...',
  },
} as const

// ---------------------------------------------------------------------------
// Inline SVG icons — avoids external icon library dependency
// ---------------------------------------------------------------------------

function MicIcon({ size }: { size: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

function WaveIcon({ size }: { size: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <line x1="4" y1="8" x2="4" y2="16" className="voice-bar" style={{ animationDelay: '0ms' }} />
      <line x1="8" y1="5" x2="8" y2="19" className="voice-bar" style={{ animationDelay: '120ms' }} />
      <line x1="12" y1="3" x2="12" y2="21" className="voice-bar" style={{ animationDelay: '240ms' }} />
      <line x1="16" y1="5" x2="16" y2="19" className="voice-bar" style={{ animationDelay: '120ms' }} />
      <line x1="20" y1="8" x2="20" y2="16" className="voice-bar" style={{ animationDelay: '0ms' }} />
    </svg>
  )
}

function SpinnerIcon({ size }: { size: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function OrbIcon({ state, size }: { state: VoiceOrbState; size: number }): React.JSX.Element {
  if (state === 'speaking') return <WaveIcon size={size} />
  if (state === 'processing') return <SpinnerIcon size={size} />
  return <MicIcon size={size} />
}

// ---------------------------------------------------------------------------
// VoiceOrb
// ---------------------------------------------------------------------------

export function VoiceOrb({
  state,
  onClick,
  size = 80,
  className = '',
}: VoiceOrbProps): React.JSX.Element {
  const visuals = ORB_VISUALS[state]
  const iconSize = Math.round(size * 0.35)

  const handleClick = useCallback((): void => {
    onClick()
  }, [onClick])

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* Animated glow backdrop */}
        <div
          className={`absolute inset-[-8px] rounded-full blur-xl transition-all duration-500 ${visuals.glowClass}`}
        />

        {/* Interactive orb button */}
        <button
          type="button"
          onClick={handleClick}
          aria-label={`Voice control: ${visuals.label}`}
          className={[
            'relative z-10 w-full h-full rounded-full',
            'bg-card border-2 transition-all duration-300',
            'flex items-center justify-center',
            'hover:scale-105 active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            visuals.ringClass,
          ].join(' ')}
        >
          <span className={`${visuals.iconClass} transition-colors duration-300`}>
            <OrbIcon state={state} size={iconSize} />
          </span>
        </button>
      </div>

      {/* Status label beneath the orb */}
      <span
        className={`text-xs font-mono tracking-wider uppercase transition-colors duration-300 ${visuals.iconClass}`}
      >
        {visuals.label}
      </span>
    </div>
  )
}
