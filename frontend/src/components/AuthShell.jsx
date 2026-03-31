export function AuthShell({
  eyebrow,
  title,
  description,
  highlights,
  children,
  formMaxWidth = "max-w-xl"
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,122,26,0.16),transparent_24rem),radial-gradient(circle_at_80%_20%,rgba(21,115,71,0.14),transparent_18rem),linear-gradient(135deg,#f7f0e3_0%,#efe5d2_48%,#e5ddcb_100%)] px-4 py-5 md:px-6 md:py-8">
      <div className="mx-auto overflow-hidden rounded-[2rem] border border-white/40 bg-white/20 shadow-[0_24px_60px_rgba(18,51,42,0.14)] backdrop-blur md:max-w-7xl">
        <div className="grid min-h-[calc(100vh-2.5rem)] lg:grid-cols-[1.1fr_0.9fr]">
          <section className="flex flex-col justify-center gap-8 bg-[linear-gradient(180deg,rgba(18,51,42,0.96),rgba(9,24,20,0.98))] px-6 py-10 text-white md:px-10 md:py-14">
            <div className="flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-[linear-gradient(135deg,#ff7a1a,#ffb26b)] text-2xl font-bold text-stone-950 shadow-[0_18px_40px_rgba(255,122,26,0.28)]">
              RM
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">
                {eyebrow}
              </p>
              <h1
                className="mt-4 max-w-3xl text-5xl leading-none md:text-7xl"
                style={{ fontFamily: '"Space Grotesk", sans-serif' }}
              >
                {title}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/70">{description}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {highlights.map((item, index) => (
                <article
                  className="rounded-[1.6rem] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.06)] p-5 backdrop-blur"
                  key={item.title}
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-sm font-bold text-white/80">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <h2 className="text-lg font-semibold text-white">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-white/70">{item.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="flex items-center justify-center bg-[rgba(255,252,247,0.84)] px-4 py-6 md:px-8">
            <div
              className={`w-full ${formMaxWidth} rounded-[1.8rem] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_48px_rgba(18,51,42,0.10)] backdrop-blur sm:p-8`}
            >
              {children}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
