export default function Home() {
  return (
    <main className="min-h-screen bg-[#030712] text-white">
      <section
        className="relative min-h-screen overflow-hidden bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(rgba(2, 6, 23, 0.35), rgba(2, 6, 23, 0.82)), url('/tapbumber-bg.png')",
        }}
      >
        {/* Background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.22),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(250,204,21,0.12),transparent_35%)]" />

        <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-5 py-7">
          
          {/* Header */}
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight">
                TAP<span className="text-yellow-400">BUMBER</span>
              </h1>

              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.28em] text-blue-200">
                Tap • Earn • Grow
              </p>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-yellow-400/30 bg-black/40 text-xl shadow-lg backdrop-blur-md">
              ⚡
            </div>
          </header>

          {/* Hero */}
          <div className="flex flex-1 flex-col justify-center py-12">
            <div className="mb-5 inline-flex w-fit rounded-full border border-blue-300/20 bg-black/35 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-blue-100 backdrop-blur-md">
              ✨ Welcome to TapBumber
            </div>

            <h2 className="text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl">
              TAP.
              <br />
              <span className="text-yellow-400">EARN.</span>
              <br />
              GROW.
            </h2>

            <p className="mt-6 max-w-sm text-base leading-7 text-slate-200">
              Complete tasks, earn rewards, invite friends and track your
              progress with TapBumber.
            </p>

            {/* Features */}
            <div className="mt-8 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-3 text-center backdrop-blur-md">
                <div className="text-xl">💰</div>
                <p className="mt-1 text-[10px] font-black tracking-wide">
                  EARN
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-3 text-center backdrop-blur-md">
                <div className="text-xl">🎯</div>
                <p className="mt-1 text-[10px] font-black tracking-wide">
                  TASKS
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-3 text-center backdrop-blur-md">
                <div className="text-xl">👥</div>
                <p className="mt-1 text-[10px] font-black tracking-wide">
                  INVITE
                </p>
              </div>
            </div>
          </div>

          {/* Main button */}
          <div className="pb-5">
            <button
              type="button"
              className="w-full rounded-2xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 px-6 py-4 text-lg font-black text-black shadow-[0_0_35px_rgba(250,204,21,0.25)] transition duration-200 hover:scale-[1.01] active:scale-[0.98]"
            >
              START EARNING 🚀
            </button>

            <p className="mt-3 text-center text-xs text-slate-300">
              Start your TapBumber journey today.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}