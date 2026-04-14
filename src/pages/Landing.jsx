import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div
      className="min-h-screen w-full relative flex flex-col"
      style={{
        backgroundImage: 'url(/hero.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Dark overlay to ensure text legibility */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Log in button — top right */}
      <div className="relative z-10 flex justify-end px-6 py-5">
        <button
          onClick={() => navigate('/login')}
          className="bg-white/15 hover:bg-white/25 border border-white/50 backdrop-blur-sm text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
        >
          Log in
        </button>
      </div>

      {/* Centre content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 pb-24">
        <h1 className="text-6xl sm:text-7xl font-serif font-bold text-white tracking-tight mb-4 drop-shadow-lg">
          Alongside
        </h1>
        <p className="text-xl sm:text-2xl text-white/90 font-medium mb-6 drop-shadow">
          Not a plan. A conversation.
        </p>
        <p className="text-white/80 text-sm sm:text-base font-medium uppercase tracking-widest mb-3">
          Coming soon in 2026
        </p>
        <p className="text-white/70 text-xs sm:text-sm font-medium tracking-wide">
          For further information contact{' '}
          <a
            href="mailto:hello@alongside.fit"
            className="text-white underline underline-offset-4 hover:text-white/90 transition-colors"
          >
            hello@alongside.fit
          </a>
        </p>
      </div>
    </div>
  )
}
