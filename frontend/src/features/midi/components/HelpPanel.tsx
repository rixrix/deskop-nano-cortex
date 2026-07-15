/**
 * HelpPanel - compact Console guide for connection modes, Tone Studio, pairing, and debugging.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-1]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-CONSOLE]
 */
import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  BluetoothIcon,
  BugIcon,
  CheckCircleIcon,
  FadersIcon,
  FloppyDiskIcon,
  UsbIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

const ISSUES_URL = "https://github.com/rixrix/deskop-nano-cortex/issues";

const CONNECTION_ROWS = [
  {
    feature: "Presets, tap tempo, tuner, expression, FX",
    usb: "Yes",
    bluetooth: "No",
    both: "Best",
  },
  {
    feature: "Preset names, knob state, assets, signal path",
    usb: "No",
    bluetooth: "Yes",
    both: "Best",
  },
  {
    feature: "Knob and Tone Studio writes",
    usb: "Limited",
    bluetooth: "Required",
    both: "Best",
  },
  {
    feature: "Save/discard reliability",
    usb: "Partial",
    bluetooth: "Partial",
    both: "Best",
  },
];

const ROLE_CARDS = [
  {
    icon: <UsbIcon size={18} weight="bold" aria-hidden="true" />,
    eyebrow: "USB",
    title: "Sends commands",
    detail: "Presets, tap tempo, tuner, FX",
  },
  {
    icon: <BluetoothIcon size={18} weight="bold" aria-hidden="true" />,
    eyebrow: "Bluetooth",
    title: "Reads live state",
    detail: "Names, knobs, signal path",
  },
  {
    icon: <CheckCircleIcon size={18} weight="bold" aria-hidden="true" />,
    eyebrow: "USB + Bluetooth",
    title: "Full control",
    detail: "Read and write together",
  },
];

function RoleCard({
  icon,
  eyebrow,
  title,
  detail,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div
      className="flex min-w-[210px] flex-1 items-start gap-3 rounded-xl border px-3 py-2.5"
      style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border"
        style={{
          background: "rgba(0,153,204,0.08)",
          borderColor: "rgba(0,153,204,0.26)",
          color: "var(--color-cyan-accent)",
        }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className="block text-[9px] font-extrabold uppercase tracking-[1px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {eyebrow}
        </span>
        <span className="block text-[13px] font-extrabold" style={{ color: "var(--text)" }}>
          {title}
        </span>
        <span
          className="block text-[11px] font-semibold leading-4"
          style={{ color: "var(--text-secondary)" }}
        >
          {detail}
        </span>
      </span>
    </div>
  );
}

function SectionShell({
  title,
  eyebrow,
  icon,
  children,
}: {
  title: string;
  eyebrow: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
    >
      <div className="mb-3 flex items-center gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border"
          style={{
            background: "rgba(0,153,204,0.08)",
            borderColor: "rgba(0,153,204,0.28)",
            color: "var(--color-cyan-accent)",
          }}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span
            className="block text-[9px] font-extrabold uppercase tracking-[1.25px]"
            style={{ color: "var(--text-secondary)" }}
          >
            {eyebrow}
          </span>
          <span className="block text-[18px] font-extrabold" style={{ color: "var(--text)" }}>
            {title}
          </span>
        </span>
      </div>
      {children}
    </section>
  );
}

function StepList({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="mt-3 space-y-2">
      {steps.map((step, index) => (
        <li key={index} className="flex items-start gap-2">
          <span
            className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-extrabold"
            style={{ background: "rgba(0,153,204,0.12)", color: "var(--color-cyan-accent)" }}
          >
            {index + 1}
          </span>
          <span className="text-[12px] font-bold leading-5" style={{ color: "var(--text)" }}>
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ConnectionTable() {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: "var(--panel-border-light)" }}
    >
      <table className="w-full border-collapse text-left text-[11px]">
        <thead style={{ background: "var(--surface-2)" }}>
          <tr>
            {["Capability", "USB only", "Bluetooth only", "USB + Bluetooth"].map((heading) => (
              <th
                key={heading}
                className="border-b px-3 py-2 text-[9px] font-extrabold uppercase tracking-[1px]"
                style={{ borderColor: "var(--panel-border-light)", color: "var(--text-secondary)" }}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CONNECTION_ROWS.map((row) => (
            <tr key={row.feature}>
              <td
                className="border-b px-3 py-2 font-bold"
                style={{ borderColor: "var(--panel-border-light)", color: "var(--text)" }}
              >
                {row.feature}
              </td>
              <td
                className="border-b px-3 py-2 font-semibold"
                style={{ borderColor: "var(--panel-border-light)", color: "var(--text-secondary)" }}
              >
                {row.usb}
              </td>
              <td
                className="border-b px-3 py-2 font-semibold"
                style={{ borderColor: "var(--panel-border-light)", color: "var(--text-secondary)" }}
              >
                {row.bluetooth}
              </td>
              <td
                className="border-b px-3 py-2 font-extrabold"
                style={{
                  borderColor: "var(--panel-border-light)",
                  color: "var(--color-green-accent)",
                }}
              >
                {row.both}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PairingChecklist() {
  const steps = [
    "Press EXIT + CAPTURE on the device.",
    "Connect Bluetooth from the app.",
    "Flaky session? Restart the app and repeat steps 1 and 2.",
  ];

  return (
    <SectionShell
      eyebrow="Bluetooth pairing"
      title="Pair again each app session"
      icon={<BluetoothIcon size={19} weight="bold" aria-hidden="true" />}
    >
      <p className="text-[12px] font-semibold leading-5" style={{ color: "var(--text-secondary)" }}>
        Verified in testing: Bluetooth needs re-pairing from the Nano on every reconnect. The mobile
        app has proprietary auto-reconnect; this unofficial app uses the manual pairing path
        instead.
      </p>
      <StepList steps={steps} />
    </SectionShell>
  );
}

function DebuggingChecklist() {
  const steps: ReactNode[] = [
    "Open the Event Log from the Logs button in the top bar.",
    "Reproduce the problem so it lands in the log.",
    "Click Copy diagnostics to grab the log plus app and device details.",
    <>
      Paste it into a new{" "}
      <a
        href={ISSUES_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 underline underline-offset-2"
        style={{ color: "var(--color-cyan-accent)" }}
      >
        GitHub issue
        <ArrowSquareOutIcon size={12} weight="bold" aria-hidden="true" />
      </a>
      .
    </>,
  ];

  return (
    <SectionShell
      eyebrow="Debugging"
      title="Send logs when something breaks"
      icon={<BugIcon size={19} weight="bold" aria-hidden="true" />}
    >
      <p className="text-[12px] font-semibold leading-5" style={{ color: "var(--text-secondary)" }}>
        The app keeps an event log of connection and MIDI activity. For a focused report, use
        Advanced then Diagnostics to record only the steps that reproduce the problem.
      </p>
      <StepList steps={steps} />
    </SectionShell>
  );
}

function WorkflowTile({
  title,
  eyebrow,
  icon,
  children,
}: {
  title: string;
  eyebrow: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <article
      className="h-full rounded-2xl border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border"
          style={{
            background: "rgba(0,153,204,0.08)",
            borderColor: "rgba(0,153,204,0.28)",
            color: "var(--color-cyan-accent)",
          }}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span
            className="block text-[9px] font-extrabold uppercase tracking-[1.2px]"
            style={{ color: "var(--text-secondary)" }}
          >
            {eyebrow}
          </span>
          <span className="block text-[17px] font-extrabold" style={{ color: "var(--text)" }}>
            {title}
          </span>
        </span>
      </div>
      <div
        className="mt-3 text-[12px] font-semibold leading-5"
        style={{ color: "var(--text-secondary)" }}
      >
        {children}
      </div>
    </article>
  );
}

export function HelpPanel() {
  return (
    <div className="space-y-3">
      <section
        className="rounded-2xl border p-4"
        style={{
          background: "linear-gradient(180deg, rgba(0,153,204,0.08), var(--surface))",
          borderColor: "var(--panel-border-light)",
        }}
      >
        <div className="min-w-0">
          <div
            className="text-[10px] font-extrabold uppercase tracking-[1.6px]"
            style={{ color: "var(--color-cyan-accent)" }}
          >
            Help
          </div>
          <h1 className="mt-1 text-[24px] font-extrabold" style={{ color: "var(--text)" }}>
            Working with the Nano at a desk
          </h1>
          <ul
            className="mt-2 max-w-[780px] space-y-1.5 text-[13px] font-semibold leading-6"
            style={{ color: "var(--text-secondary)" }}
          >
            <li className="flex items-start gap-2">
              <UsbIcon
                size={16}
                weight="bold"
                aria-hidden="true"
                className="mt-1 flex-shrink-0"
                style={{ color: "var(--color-green-accent)" }}
              />
              <span>
                USB sends the documented commands: preset recall, FX toggles, tap tempo, tuner, and
                expression.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <WarningCircleIcon
                size={16}
                weight="bold"
                aria-hidden="true"
                className="mt-1 flex-shrink-0"
                style={{ color: "var(--color-amber-accent)" }}
              />
              <span>
                The Nano Cortex never sends anything back over USB, so USB alone can't show what the
                device is doing.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <BluetoothIcon
                size={16}
                weight="bold"
                aria-hidden="true"
                className="mt-1 flex-shrink-0"
                style={{ color: "var(--color-cyan-accent)" }}
              />
              <span>
                Bluetooth is the only source of live device state (knob positions, preset names,
                signal path) and is required for Tone Studio writes; most commands can't be sent
                over it.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon
                size={16}
                weight="bold"
                aria-hidden="true"
                className="mt-1 flex-shrink-0"
                style={{ color: "var(--color-green-accent)" }}
              />
              <span>Connect both for full control with live feedback.</span>
            </li>
          </ul>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {ROLE_CARDS.map((role) => (
            <RoleCard key={role.eyebrow} {...role} />
          ))}
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
        <div className="space-y-3">
          <SectionShell
            eyebrow="Connection guide"
            title="What each connection can do"
            icon={
              <span className="flex items-center gap-1">
                <UsbIcon size={17} weight="bold" aria-hidden="true" />
                <BluetoothIcon size={17} weight="bold" aria-hidden="true" />
              </span>
            }
          >
            <ConnectionTable />
          </SectionShell>
          <div className="grid gap-3 sm:grid-cols-2">
            <WorkflowTile
              eyebrow="Save modes"
              title="Manual save is the default"
              icon={<FloppyDiskIcon size={18} weight="bold" aria-hidden="true" />}
            >
              Edits change the live sound immediately; you choose when to write them back. Auto save
              is faster, but the device stays the source of truth either way.
            </WorkflowTile>
            <WorkflowTile
              eyebrow="Unsaved switching"
              title="Confirm vs Auto-discard"
              icon={<ArrowCounterClockwiseIcon size={18} weight="bold" aria-hidden="true" />}
            >
              Confirm warns before a preset switch abandons live edits. Auto-discard clears them
              instantly for fast browsing.
            </WorkflowTile>
            <WorkflowTile
              eyebrow="Tone Studio"
              title="Open the tone surface"
              icon={<FadersIcon size={18} weight="bold" aria-hidden="true" />}
            >
              Tone Studio floats over the Console with the device signal chain and knob values. Open
              it from the signal path or the Utilities rail. Writing changes back to the device
              needs Bluetooth.
            </WorkflowTile>
            <WorkflowTile
              eyebrow="Progress and safety"
              title="Save is intentional"
              icon={<WarningCircleIcon size={18} weight="bold" aria-hidden="true" />}
            >
              The top dock shows live activity without shifting the layout. Save writes to the
              preset; Discard mirrors the device EXIT behavior.
            </WorkflowTile>
          </div>
        </div>
        <div className="space-y-3">
          <PairingChecklist />
          <DebuggingChecklist />
        </div>
      </div>
    </div>
  );
}
