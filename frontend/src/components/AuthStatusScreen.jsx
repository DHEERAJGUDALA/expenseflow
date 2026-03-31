import { motion } from "framer-motion";

export function AuthStatusScreen({ title = "Checking authentication...", subtitle }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "var(--sidebar-bg)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        {/* Pulsing ring loader */}
        <div className="relative w-12 h-12 mx-auto mb-6">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: "2px solid var(--sidebar-border)",
            }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: "2px solid transparent",
              borderTopColor: "var(--accent)",
              animation: "spin 0.8s linear infinite",
            }}
          />
        </div>
        <p style={{ color: "var(--sidebar-text)", fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: "15px" }}>
          {title}
        </p>
        {subtitle && (
          <p className="mt-2 text-sm" style={{ color: "var(--sidebar-text-dim)" }}>{subtitle}</p>
        )}
      </motion.div>
    </div>
  );
}
