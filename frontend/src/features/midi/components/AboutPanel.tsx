/**
 * AboutPanel — app identity, release/support links, telemetry posture toggle, project credits,
 * open-source acknowledgements (adopted BLE protocol attribution), tested firmware, license, and
 * the no-warranty disclaimer.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-39]
 * @see docs/specs/120-backend-ipc/spec.md [FR-30]
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-28]
 */
import {
  ArrowSquareOutIcon,
  CodeIcon,
  CoffeeIcon,
  DownloadSimpleIcon,
  GithubLogoIcon,
  HeartIcon,
  InfoIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { openExternal } from "../../../shared/ipc/commands";
import type { UpdateState } from "../hooks/useLatestRelease";
import {
  initClarity,
  isTelemetryEnabled,
  setTelemetryEnabled,
} from "../../../shared/telemetry/clarity";
import appIcon from "../../../assets/app-icon.svg";

const REPO_URL = "https://github.com/rixrix/deskop-nano-cortex";
const RELEASES_URL = "https://github.com/rixrix/deskop-nano-cortex/releases";
const ISSUES_URL = "https://github.com/rixrix/deskop-nano-cortex/issues";
const LICENSE_URL = "https://www.apache.org/licenses/LICENSE-2.0";
const AUTHOR_URL = "https://github.com/rixrix";
const AFX_URL = "https://agenticflowx.github.io/";
const WEB_EDITOR_URL = "https://github.com/choldy/nano-cortex-web-editor";
const PRESET_SWITCHER_URL = "https://github.com/AlieksieievOU/nanoCortexPresetSwitcher";
const NOTICES_URL = "https://github.com/rixrix/deskop-nano-cortex/blob/main/THIRD-PARTY-NOTICES.md";
const TESTED_FIRMWARE = "2.2.1";
const LICENSE = "Apache-2.0";

const SUPPORT_LINKS = [
  { label: "Ko-fi", url: "https://ko-fi.com/rixrix", color: "#ff5e5b", icon: CoffeeIcon },
  {
    label: "Buy Me a Coffee",
    url: "https://buymeacoffee.com/rixrix",
    color: "#c69300",
    icon: CoffeeIcon,
  },
  {
    label: "GitHub Sponsors",
    url: "https://github.com/sponsors/AgenticFlowX",
    color: "#db61a2",
    icon: HeartIcon,
  },
];

const PROJECT_LINKS = [
  { label: "GitHub repository", url: REPO_URL, icon: GithubLogoIcon },
  { label: "Releases", url: RELEASES_URL, icon: DownloadSimpleIcon },
  { label: "Issues", url: ISSUES_URL, icon: InfoIcon },
  { label: "License", url: LICENSE_URL, icon: ShieldCheckIcon },
  { label: "AgenticFlowX", url: AFX_URL, icon: ShieldCheckIcon },
  { label: "Author", url: AUTHOR_URL, icon: CodeIcon },
];

const open = (url: string) => void openExternal(url).catch(() => {});

interface AboutPanelProps {
  /** App version from `get_app_version`; falls back to a dash while loading. */
  appVersion: string;
  /** Update-check state, checked once at app level (offline-safe). */
  update: UpdateState;
}

function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "cyan" | "green" | "amber" | "muted";
}) {
  const toneStyles = {
    cyan: {
      color: "var(--color-cyan-accent)",
      borderColor: "rgba(0,153,204,0.32)",
      background: "rgba(0,153,204,0.07)",
    },
    green: {
      color: "var(--color-green-accent)",
      borderColor: "rgba(0,170,85,0.34)",
      background: "rgba(0,170,85,0.07)",
    },
    amber: {
      color: "var(--color-amber-accent)",
      borderColor: "rgba(204,153,0,0.34)",
      background: "rgba(204,153,0,0.07)",
    },
    muted: {
      color: "var(--text-secondary)",
      borderColor: "var(--panel-border-light)",
      background: "var(--surface)",
    },
  }[tone];

  return (
    <span
      className="inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-extrabold uppercase tracking-[0.9px]"
      style={toneStyles}
    >
      {children}
    </span>
  );
}

function FactCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
    >
      <div
        className="text-[9px] font-extrabold uppercase tracking-[1.2px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </div>
      <div className="mt-1 font-mono text-[13px] font-extrabold" style={{ color: "var(--text)" }}>
        {value}
      </div>
      {note ? (
        <div className="mt-1 text-[10px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          {note}
        </div>
      ) : null}
    </div>
  );
}

function SectionCard({
  title,
  eyebrow,
  children,
  accent = "var(--panel-border-light)",
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <section
      className="rounded-xl border p-3"
      style={{ background: "var(--surface)", borderColor: accent }}
    >
      <div
        className="text-[9px] font-extrabold uppercase tracking-[1.2px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {eyebrow ?? "About"}
      </div>
      <div className="mt-1 text-[14px] font-extrabold" style={{ color: "var(--text)" }}>
        {title}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ProjectLinkRow({
  label,
  url,
  icon: Icon,
}: {
  label: string;
  url: string;
  icon: typeof GithubLogoIcon;
}) {
  return (
    <button
      type="button"
      onClick={() => open(url)}
      className="group flex w-full items-center gap-3 rounded-lg border border-[var(--panel-border-light)] px-3 py-2.5 text-left transition-colors hover:border-[rgba(0,153,204,0.4)]"
      style={{ background: "var(--surface)" }}
    >
      <span
        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border"
        style={{
          background: "rgba(0,153,204,0.1)",
          borderColor: "rgba(0,153,204,0.3)",
          color: "var(--color-cyan-accent)",
        }}
      >
        <Icon size={16} weight="bold" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block text-[11px] font-extrabold uppercase tracking-[0.8px]"
          style={{ color: "var(--text)" }}
        >
          {label}
        </span>
        <span
          className="mt-0.5 block truncate font-mono text-[10px] font-semibold group-hover:underline"
          style={{ color: "var(--color-cyan-accent)" }}
        >
          {url}
        </span>
      </span>
      <ArrowSquareOutIcon
        size={14}
        weight="bold"
        aria-hidden="true"
        className="flex-shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        style={{ color: "var(--color-cyan-accent)" }}
      />
    </button>
  );
}

function SupportButton({ label, url, color, icon: Icon }: (typeof SUPPORT_LINKS)[number]) {
  return (
    <button
      type="button"
      onClick={() => open(url)}
      className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-extrabold transition-transform hover:-translate-y-0.5"
      style={{ color: "var(--text)", background: "var(--surface)", borderColor: `${color}66` }}
      title={`Support via ${label}`}
    >
      <Icon size={16} weight="bold" aria-hidden="true" style={{ color }} />
      {label}
    </button>
  );
}

function UpdateCard({ update }: { update: UpdateState }) {
  const isUpdate = update.status === "update";
  const statusText =
    update.status === "checking"
      ? "Checking for updates"
      : update.status === "latest"
        ? `Current version v${update.version}`
        : update.status === "update"
          ? `Update available: v${update.version}`
          : "Browse releases to check manually";

  return (
    <SectionCard
      title="Release channel"
      eyebrow="Updates"
      accent={isUpdate ? "rgba(0,170,85,0.4)" : "var(--panel-border-light)"}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <div
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border"
            style={{
              color: isUpdate ? "var(--color-green-accent)" : "var(--color-cyan-accent)",
              background: isUpdate ? "rgba(0,170,85,0.08)" : "rgba(0,153,204,0.08)",
              borderColor: isUpdate ? "rgba(0,170,85,0.34)" : "rgba(0,153,204,0.28)",
            }}
          >
            <DownloadSimpleIcon size={17} weight="bold" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-extrabold" style={{ color: "var(--text)" }}>
              {statusText}
            </div>
            <div
              className="mt-0.5 text-[10px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Updates are checked once per session and never block the app.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => open(RELEASES_URL)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[11px] font-extrabold uppercase tracking-[0.8px]"
          style={{
            color: isUpdate ? "var(--color-green-accent)" : "var(--color-cyan-accent)",
            background: "var(--surface)",
            borderColor: isUpdate ? "rgba(0,170,85,0.4)" : "var(--panel-border-light)",
          }}
        >
          {isUpdate ? "Download" : "Releases"}
          <ArrowSquareOutIcon size={12} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </SectionCard>
  );
}

function TelemetrySection() {
  const [enabled, setEnabled] = useState(isTelemetryEnabled);

  const toggle = () => {
    const next = !enabled;
    setTelemetryEnabled(next);
    setEnabled(next);
    if (next) initClarity();
  };

  const accent = enabled ? "var(--color-cyan-accent)" : "var(--color-green-accent)";
  const accentBorder = enabled ? "rgba(0,153,204,0.34)" : "rgba(0,170,85,0.34)";
  const accentBg = enabled ? "rgba(0,153,204,0.08)" : "rgba(0,170,85,0.08)";

  return (
    <SectionCard title="Telemetry posture" eyebrow="Privacy" accent="rgba(0,170,85,0.28)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <div className="text-[12px] font-extrabold" style={{ color: "var(--text)" }}>
            {enabled ? "Telemetry is on" : "Telemetry is off"}
          </div>
          <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
            Uses Microsoft Clarity (session interactions, heatmaps, JS errors) and forwards this
            app's diagnostic log lines as Clarity events. On by default; see{" "}
            <span style={{ color: "var(--color-cyan-accent)" }}>PRIVACY.md</span> for the full
            disclosure.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-9 min-w-[108px] items-center justify-between gap-2 rounded-full border px-2 opacity-95 transition-colors"
          style={{ background: accentBg, borderColor: accentBorder, color: accent }}
          aria-label={enabled ? "Telemetry collection is on" : "Telemetry collection is off"}
        >
          <span className="text-[9px] font-extrabold uppercase tracking-[0.9px]">Telemetry</span>
          <span
            className="inline-flex h-6 w-11 items-center rounded-full border px-0.5"
            style={{
              background: "var(--surface)",
              borderColor: accentBorder,
              justifyContent: enabled ? "flex-end" : "flex-start",
            }}
          >
            <span
              className="grid h-5 w-5 place-items-center rounded-full text-[8px] font-black uppercase"
              style={{ background: accent, color: "white" }}
            >
              {enabled ? "On" : "Off"}
            </span>
          </span>
        </button>
      </div>
      <div
        className="mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-[10px] font-semibold"
        style={{
          color: "var(--text-secondary)",
          background: "var(--surface-2)",
          borderColor: "var(--panel-border-light)",
        }}
      >
        <InfoIcon size={14} weight="bold" aria-hidden="true" className="mt-0.5 flex-shrink-0" />
        <span>
          Turning telemetry off here takes full effect the next time you launch the app. Device
          MIDI/BLE data, presets, and diagnostics files never leave your machine regardless of this
          setting.
        </span>
      </div>
    </SectionCard>
  );
}

function WarrantySection() {
  return (
    <SectionCard title="Warranty notice" eyebrow="Device safety" accent="rgba(204,153,0,0.28)">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pill tone="amber">Use at your own risk</Pill>
        <Pill tone="muted">Unofficial</Pill>
      </div>
      <div
        className="rounded-lg border p-3 text-[10px] font-medium leading-relaxed"
        style={{
          color: "var(--text-secondary)",
          background: "var(--surface-2)",
          borderColor: "var(--panel-border-light)",
        }}
      >
        <span
          className="mb-2 inline-flex items-center gap-1 font-extrabold uppercase tracking-[0.8px]"
          style={{ color: "var(--text)" }}
        >
          <WarningCircleIcon size={14} weight="bold" aria-hidden="true" />
          No warranty.
        </span>
        <div>
          This software is provided <strong>"as is", without warranty of any kind</strong>, express
          or implied. It is an unofficial community project,{" "}
          <strong>not affiliated with or endorsed by Neural DSP</strong>. It communicates with your
          Nano Cortex using private device behavior and should be used at your own risk.
        </div>
        <div className="mt-2">
          The author is{" "}
          <strong>not responsible for damage, malfunction, data loss, or voided warranty</strong>{" "}
          affecting your device. By using this software you accept full responsibility for the
          outcome.
        </div>
      </div>
    </SectionCard>
  );
}

function AcknowledgementsSection() {
  return (
    <section className="px-1 pb-1">
      <div
        className="text-[9px] font-extrabold uppercase tracking-[1.2px]"
        style={{ color: "var(--text-secondary)" }}
      >
        Credits
      </div>
      <div className="mt-1 text-[14px] font-extrabold" style={{ color: "var(--text)" }}>
        Open-source acknowledgements
      </div>
      <div className="mt-2 grid gap-2">
        <ProjectLinkRow
          label="nano-cortex-web-editor (MIT)"
          url={WEB_EDITOR_URL}
          icon={GithubLogoIcon}
        />
        <ProjectLinkRow
          label="nanoCortexPresetSwitcher (MIT)"
          url={PRESET_SWITCHER_URL}
          icon={GithubLogoIcon}
        />
        <ProjectLinkRow label="Third-party notices" url={NOTICES_URL} icon={ShieldCheckIcon} />
      </div>
    </section>
  );
}

export function AboutPanel({ appVersion, update }: AboutPanelProps) {
  return (
    <section
      className="flex max-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-2xl border"
      style={{ background: "var(--surface-2)", borderColor: "var(--panel-border-light)" }}
    >
      <div
        className="flex-shrink-0 border-b px-4 py-4"
        style={{
          borderColor: "var(--panel-border)",
          background:
            "linear-gradient(135deg, var(--panel-raised) 0%, var(--surface-2) 52%, rgba(0,153,204,0.08) 100%)",
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <img src={appIcon} alt="" className="h-14 w-14 flex-shrink-0 rounded-xl shadow-sm" />
          <div className="min-w-[240px] flex-1">
            <div
              className="text-[10px] font-extrabold uppercase tracking-[1.6px]"
              style={{ color: "var(--color-cyan-accent)" }}
            >
              Desktop control surface
            </div>
            <h2
              className="mt-1 text-[22px] font-black leading-tight"
              style={{ color: "var(--text)" }}
            >
              Unofficial Nano Cortex
            </h2>
            <p
              className="mt-1 max-w-3xl text-[12px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              A device-first desktop companion for browsing presets, monitoring live state, and
              making the Nano Cortex easier to use at a desk, in practice, and on a gig.
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <FactCard label="App version" value={appVersion || "--"} />
              <FactCard label="Tested firmware" value={TESTED_FIRMWARE} note="Nano Cortex" />
              <FactCard label="License" value={LICENSE} note="Community project" />
            </div>

            <UpdateCard update={update} />

            <SectionCard
              title="Built with AgenticFlowX"
              eyebrow="Workflow"
              accent="rgba(0,153,204,0.28)"
            >
              <button
                type="button"
                onClick={() => open(AFX_URL)}
                className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-transform hover:-translate-y-0.5"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--panel-border-light)",
                  color: "var(--text-secondary)",
                }}
              >
                <div
                  className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border"
                  style={{
                    color: "var(--color-cyan-accent)",
                    background: "rgba(0,153,204,0.08)",
                    borderColor: "rgba(0,153,204,0.28)",
                  }}
                >
                  <ShieldCheckIcon size={18} weight="bold" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-[12px] font-extrabold" style={{ color: "var(--text)" }}>
                    Spec-driven development
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium">
                    Every shipped surface is traced through written specs, design notes, tasks, and
                    repeatable checks. Learn more at{" "}
                    <span style={{ color: "var(--color-cyan-accent)" }}>
                      agenticflowx.github.io
                    </span>
                  </div>
                </div>
              </button>
            </SectionCard>

            <TelemetrySection />
          </div>

          <div className="space-y-3">
            <WarrantySection />

            <SectionCard
              title="Support the work"
              eyebrow="Community"
              accent="rgba(219,97,162,0.26)"
            >
              <p className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                Time, care, hardware testing, and personal cost have gone into making this useful
                with real devices. If it saves you time or makes practice easier, support helps the
                author keep it maintained, polished, and free.
              </p>
              <div className="mt-3 grid gap-2">
                {SUPPORT_LINKS.map((link) => (
                  <SupportButton key={link.label} {...link} />
                ))}
              </div>
            </SectionCard>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <AcknowledgementsSection />

          <section className="px-1 pb-1 lg:col-span-2">
            <div
              className="text-[9px] font-extrabold uppercase tracking-[1.2px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Source
            </div>
            <div className="mt-1 text-[14px] font-extrabold" style={{ color: "var(--text)" }}>
              Project links
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PROJECT_LINKS.map((link) => (
                <ProjectLinkRow key={link.label} {...link} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
