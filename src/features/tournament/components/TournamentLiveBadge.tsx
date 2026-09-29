// Golden 2.5D plaque shown to visitors while the host runs a tournament. Server-safe (no hooks).
function TournamentLiveBadge() {
  return (
    <span className="mg-spring inline-flex items-center gap-2 rounded-full border-[3px] border-[#b45309] bg-gradient-to-b from-[#fff7ae] via-[#fcd34d] to-[#f59e0b] px-3.5 py-1 font-game text-sm font-extrabold text-[#5a2a02] shadow-[inset_0_2px_0_rgba(255,255,255,0.7),0_4px_0_#8a4a0c,0_0_18px_rgba(250,204,21,0.55)] [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
      <span aria-hidden>🏆</span> Mind Tournament is Live!
    </span>
  )
}

export { TournamentLiveBadge }
