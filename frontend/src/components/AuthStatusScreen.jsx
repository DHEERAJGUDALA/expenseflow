export function AuthStatusScreen({ eyebrow, title, description }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,rgba(255,122,26,0.16),transparent_20rem),linear-gradient(135deg,#f7f0e3_0%,#efe5d2_48%,#e5ddcb_100%)] px-4">
      <section className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white/85 p-8 shadow-[0_24px_60px_rgba(18,51,42,0.12)] backdrop-blur">
        <div className="flex h-14 w-14 items-center justify-center rounded-[1.15rem] bg-slate-950 text-sm font-bold uppercase tracking-[0.2em] text-white">
          RM
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          {eyebrow}
        </p>
        <h1
          className="mt-3 text-4xl leading-none text-slate-950"
          style={{ fontFamily: '"Space Grotesk", sans-serif' }}
        >
          {title}
        </h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-slate-500">{description}</p>
        <div className="mt-8 flex items-center gap-3">
          <span className="h-3 w-3 animate-pulse rounded-full bg-orange-500" />
          <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-500 [animation-delay:160ms]" />
          <span className="h-3 w-3 animate-pulse rounded-full bg-slate-900 [animation-delay:320ms]" />
        </div>
      </section>
    </main>
  );
}
