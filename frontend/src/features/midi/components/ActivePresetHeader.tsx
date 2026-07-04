/**
 * Save-mode contract for the active preset: manual save matches the device behavior observed in
 * hardware sessions (edits stay unsaved until an explicit Save), auto save writes device-backed
 * edits after the live edit settles.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-43]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
export type SaveMode = "manual" | "auto";
