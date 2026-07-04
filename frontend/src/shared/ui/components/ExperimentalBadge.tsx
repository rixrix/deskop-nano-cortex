/**
 * Small amber pill marking a surface as experimental/provisional. Keeps the UI
 * honest about which state is project-verified versus still under capture.
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-25]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-UI]
 */
export function ExperimentalBadge({ label = "Experimental" }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[1px]"
      style={{
        background: "rgba(212,160,23,0.12)",
        borderColor: "rgba(212,160,23,0.38)",
        color: "var(--color-amber-accent)",
      }}
      title="Experimental / provisional — not yet graduated by project evidence"
    >
      {label}
    </span>
  );
}
