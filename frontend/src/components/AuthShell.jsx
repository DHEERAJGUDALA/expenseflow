import { motion } from "framer-motion";

export function AuthShell({
  eyebrow,
  title,
  description,
  highlights,
  children,
  formMaxWidth = "max-w-xl"
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,122,26,0.14),transparent_24rem),radial-gradient(circle_at_80%_20%,rgba(21,115,71,0.12),transparent_18rem),linear-gradient(135deg,#f7f0e3_0%,#efe5d2_48%,#e5ddcb_100%)] px-4 py-5 md:px-6 md:py-8">
      <div className="mx-auto overflow-hidden rounded-[2rem] border border-white/40 bg-white/20 shadow-[0_24px_60px_rgba(18,51,42,0.14)] backdrop-blur md:max-w-7xl">
        <div className="grid min-h-[calc(100vh-2.5rem)] lg:grid-cols-[1.1fr_0.9fr]">
          {/* ═══ Left Panel — Brand ═══ */}
          <section className="flex flex-col justify-center gap-8 bg-[linear-gradient(180deg,rgba(18,51,42,0.96),rgba(9,24,20,0.98))] px-6 py-10 text-white md:px-10 md:py-14">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold shadow-[0_18px_40px_rgba(255,122,26,0.28)]"
                style={{
                  background: "linear-gradient(135deg, #ff7a1a, #ffb26b)",
                  color: "#1a1a1a",
                  fontFamily: "var(--font-heading)",
                }}
              >
                RM
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <p
                className="text-xs font-bold uppercase tracking-[0.18em]"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                {eyebrow}
              </p>
              <h1
                className="mt-4 max-w-3xl text-4xl leading-[1.1] md:text-6xl"
                style={{ fontFamily: "var(--font-heading)", fontWeight: 700, letterSpacing: "-0.03em" }}
              >
                {title}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7" style={{ color: "rgba(255,255,255,0.6)" }}>
                {description}
              </p>
            </motion.div>

            <div className="grid gap-4 md:grid-cols-2">
              {highlights.map((item, index) => (
                <motion.article
                  key={item.title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 + index * 0.08 }}
                  className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] p-5 backdrop-blur"
                  style={{ transition: "border-color 0.2s" }}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
                >
                  <div
                    className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold"
                    style={{
                      background: "rgba(255,122,26,0.15)",
                      color: "#ffb26b",
                      fontFamily: "var(--font-heading)",
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{item.title}</h2>
                  <p className="mt-2 text-sm leading-6" style={{ color: "rgba(255,255,255,0.55)" }}>{item.body}</p>
                </motion.article>
              ))}
            </div>
          </section>

          {/* ═══ Right Panel — Form ═══ */}
          <section className="flex items-center justify-center bg-[rgba(255,252,247,0.88)] px-4 py-6 md:px-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className={`w-full ${formMaxWidth} rounded-2xl border p-6 shadow-[0_20px_48px_rgba(18,51,42,0.08)] backdrop-blur sm:p-8`}
              style={{
                background: "rgba(255,255,255,0.9)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {children}
            </motion.div>
          </section>
        </div>
      </div>
    </main>
  );
}
