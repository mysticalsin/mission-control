'use client'

/**
 * Official Mantu brand logo — sourced from mantu.com.
 * Purple rounded-rect background with 4 overlapping white arch strokes
 * at decreasing opacity (0.85, 0.75, 0.55, 0.38) forming the "M" mark.
 *
 * Props:
 *  - size: controls height/width in px
 *  - className: additional Tailwind/CSS classes
 *  - variant: 'mark' (icon only) or 'full' (icon + wordmark)
 *  - background: override background color (default: Mantu purple #7F00DA)
 */

interface MantuLogoProps {
  readonly size?: number
  readonly className?: string
  readonly variant?: 'full' | 'mark'
  readonly background?: string
}

export function MantuLogo({
  size = 32,
  className = '',
  variant = 'mark',
  background = '#7F00DA',
}: MantuLogoProps) {
  if (variant === 'full') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <MantuMark size={size} background={background} />
        <span
          className="font-semibold tracking-tight text-white"
          style={{ fontSize: size * 0.5 }}
        >
          Mantu
        </span>
      </div>
    )
  }

  return <MantuMark size={size} className={className} background={background} />
}

/**
 * The official Mantu "M" icon mark.
 * 4 overlapping arch paths on a purple rounded-rect, exactly as
 * served by mantu.com/icon.svg (viewBox 0 0 424 424).
 */
function MantuMark({
  size = 32,
  className = '',
  background = '#7F00DA',
}: {
  readonly size?: number
  readonly className?: string
  readonly background?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 424 424"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Mantu"
    >
      {/* Purple rounded background */}
      <rect width="424" height="424" rx="75" fill={background} />

      {/* Right outer arch — highest opacity */}
      <path
        opacity="0.85"
        d="M331.479 310.173C318.663 310.173 306.496 302.576 301.246 289.962L246.905 159.403C239.933 142.651 247.809 123.376 264.492 116.375C281.175 109.374 300.371 117.282 307.343 134.034L361.655 264.593C368.628 281.345 360.752 300.62 344.069 307.621C339.947 309.351 335.657 310.173 331.45 310.173"
        fill="white"
      />

      {/* Right inner arch */}
      <path
        opacity="0.75"
        d="M211.953 310.176C207.013 310.176 202.016 309.042 197.302 306.689C181.127 298.554 174.578 278.797 182.68 262.555L247.804 131.997C255.905 115.755 275.581 109.178 291.756 117.314C307.931 125.449 314.48 145.205 306.378 161.447L241.254 292.006C235.524 303.514 223.95 310.176 211.953 310.176Z"
        fill="white"
      />

      {/* Left inner arch */}
      <path
        opacity="0.55"
        d="M212.083 310.176C200.085 310.176 188.512 303.514 182.781 292.006L117.657 161.447C109.556 145.205 116.105 125.449 132.28 117.314C148.455 109.178 168.13 115.755 176.232 131.997L241.356 262.555C249.458 278.797 242.908 298.554 226.733 306.689C222.019 309.07 217.023 310.176 212.083 310.176Z"
        fill="white"
      />

      {/* Left outer arch — lowest opacity */}
      <path
        opacity="0.38"
        d="M92.5614 310.173C88.3553 310.173 84.0645 309.351 79.9431 307.621C63.2599 300.62 55.3558 281.345 62.3566 264.593L116.669 134.034C123.641 117.282 142.837 109.374 159.52 116.375C176.203 123.376 184.107 142.651 177.107 159.403L122.794 289.962C117.544 302.576 105.377 310.173 92.5614 310.173Z"
        fill="white"
      />
    </svg>
  )
}

export default MantuLogo
