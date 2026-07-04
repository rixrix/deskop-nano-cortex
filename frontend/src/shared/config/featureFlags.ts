/**
 * Build/runtime feature flags.
 *
 * Experimental surfaces (BLE protocol capture, speculative editors not yet
 * graduated by project evidence) are gated behind a single flag so
 * production builds ship the honest, documented-MIDI control surface by default.
 *
 * Enable in any build with `VITE_EXPERIMENTAL=true`; on automatically during `vite dev`.
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-26]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-FLAGS]
 */
export const EXPERIMENTAL_FEATURES: boolean =
  import.meta.env.VITE_EXPERIMENTAL === "true" || import.meta.env.DEV;
