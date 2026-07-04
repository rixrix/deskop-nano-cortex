// Conventional Commits with a required, hand-listed scope enum derived from the
// docs/specs zones plus cross-cutting scopes. Enforced by .husky/commit-msg.
//
// @see docs/specs/400-dx-tooling/spec.md [FR-20]
// @see docs/specs/400-dx-tooling/design.md [DES-DX-HOOKS]
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-empty": [2, "never"],
    "scope-enum": [
      2,
      "always",
      [
        // zone-derived
        "overview", // 001-overview
        "midi-usb", // 100-backend-midi-usb
        "ble", // 110-backend-midi-ble
        "ipc", // 120-backend-ipc + 210 frontend contracts
        "platform", // 130-backend-platform
        "frontend", // 200-frontend-control-surface
        "dx", // 400-dx-tooling
        "ci", // 500-ci-release (automation)
        "release", // 500-ci-release (cutting releases)
        "governance", // 900-project-governance
        // cross-cutting
        "deps",
        "docs",
        "repo",
        "scripts",
        "spec",
        "security",
      ],
    ],
    "header-max-length": [2, "always", 100],
  },
};
