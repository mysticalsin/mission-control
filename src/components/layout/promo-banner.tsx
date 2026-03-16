'use client'

export function PromoBanner() {
  return (
    <div className="mx-4 mt-3 mb-0 flex flex-col gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm md:flex-row md:items-center">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
        <p className="text-xs text-amber-200/90">
          Built by <span className="font-semibold text-amber-100">Tony W.</span> for Mantu Group · AI orchestration platform.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:ml-auto">
        <a
          href="https://mantu.group"
          target="_blank"
          rel="noopener noreferrer"
          className="text-2xs font-medium text-amber-100 hover:text-white px-2 py-1 rounded border border-amber-300/30 hover:border-amber-200/50 transition-colors"
        >
          Contact Us
        </a>
        <a
          href="https://mantu.group"
          target="_blank"
          rel="noopener noreferrer"
          className="text-2xs font-medium text-amber-200 hover:text-amber-100 px-2 py-1 rounded border border-amber-500/20 hover:border-amber-400/40 transition-colors"
        >
          Mantu Group
        </a>
        <a
          href="https://dictx.splitlabs.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-2xs font-medium text-amber-200 hover:text-amber-100 px-2 py-1 rounded border border-amber-500/20 hover:border-amber-400/40 transition-colors"
        >
          DictX (Upcoming)
        </a>
        <a
          href="https://mantu.group"
          target="_blank"
          rel="noopener noreferrer"
          className="text-2xs font-medium text-amber-200 hover:text-amber-100 px-2 py-1 rounded border border-amber-500/20 hover:border-amber-400/40 transition-colors"
        >
          Flight Deck Pro (Upcoming)
        </a>
      </div>
    </div>
  )
}
