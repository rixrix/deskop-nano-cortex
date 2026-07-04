/**
 * PresetRail — the left-hand preset browser for the Console workspace: all 64 presets grouped into
 * collapsible banks (A-H), the active preset highlighted and auto-scrolled into view,
 * inline-editable names, and click-to-load (selecting a preset recalls it on the device immediately,
 * matching the hardware; there is no preview). Collapsible so narrow windows can reclaim the width.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-44]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
import { useEffect, useRef, useState } from "react";
import {
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  CaretDownIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import { PRESETS_PER_ROW, TOTAL_BANKS } from "../constants";
import { getPresetName, presetLabel, savePresetNames, usePresetNames } from "../presetNames";

const BANKS = Array.from({ length: TOTAL_BANKS }, (_, index) => String.fromCharCode(65 + index));

interface PresetRailProps {
  currentPreset: number;
  isConnected: boolean;
  collapsed: boolean;
  disabled?: boolean;
  loadingPreset?: number | null;
  onSelectPreset: (preset: number) => void;
  onRenamePreset?: (preset: number, name: string) => void;
  onToggleCollapsed: () => void;
}

export function PresetRail({
  currentPreset,
  isConnected,
  collapsed,
  disabled = false,
  loadingPreset = null,
  onSelectPreset,
  onRenamePreset,
  onToggleCollapsed,
}: PresetRailProps) {
  const presetNames = usePresetNames();
  const activeRef = useRef<HTMLDivElement>(null);
  const activeBankIndex = Math.floor(currentPreset / PRESETS_PER_ROW);
  const [expandedBanks, setExpandedBanks] = useState(() =>
    BANKS.map((_, bankIndex) => bankIndex === activeBankIndex),
  );

  useEffect(() => {
    setExpandedBanks((prev) =>
      prev[activeBankIndex]
        ? prev
        : prev.map((expanded, bankIndex) => (bankIndex === activeBankIndex ? true : expanded)),
    );
  }, [activeBankIndex]);

  // Keep the active preset visible as it changes (click, keyboard, footswitch, or physical BLE).
  useEffect(() => {
    const scrollIntoView = activeRef.current?.scrollIntoView;
    if (!collapsed && typeof scrollIntoView === "function") {
      scrollIntoView.call(activeRef.current, { block: "nearest" });
    }
  }, [currentPreset, collapsed]);

  const rename = (preset: number, value: string) => {
    const nextName = value.slice(0, 42);
    const next = { ...presetNames };
    if (nextName.trim()) next[preset] = nextName;
    else delete next[preset];
    savePresetNames(next);
    onRenamePreset?.(preset, nextName);
  };
  const recallDisabled = !isConnected || disabled;
  const toggleBank = (bankIndex: number) => {
    setExpandedBanks((prev) =>
      prev.map((expanded, index) => {
        if (index !== bankIndex) return expanded;
        return index === activeBankIndex ? true : !expanded;
      }),
    );
  };

  if (collapsed) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl border p-2 xl:min-h-[360px] xl:w-14 xl:flex-col xl:justify-start"
        style={{ background: "var(--surface-2)", borderColor: "var(--panel-border-light)" }}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="Show preset list"
          aria-label="Show preset list"
          className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border"
          style={{
            background: "var(--surface)",
            borderColor: "var(--panel-border-light)",
            color: "var(--text-secondary)",
          }}
        >
          <CaretDoubleRightIcon size={14} weight="bold" aria-hidden="true" />
        </button>
        <div className="min-w-0 xl:hidden">
          <div
            className="text-[9px] font-extrabold uppercase tracking-[1.2px]"
            style={{ color: "var(--text-secondary)" }}
          >
            {disabled ? "Syncing preset" : "Preset"}
          </div>
          <div className="truncate text-[12px] font-extrabold" style={{ color: "var(--text)" }}>
            {presetLabel(currentPreset)} · {getPresetName(presetNames, currentPreset)}
          </div>
        </div>
        <div
          className="hidden text-center font-mono text-[11px] font-extrabold [writing-mode:vertical-rl] xl:block"
          style={{ color: "var(--color-cyan-accent)" }}
        >
          Preset - {presetLabel(currentPreset)}
        </div>
      </div>
    );
  }

  return (
    <section
      data-testid="preset-rail"
      className="flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border xl:max-h-[calc(100vh-11rem)]"
      style={{ background: "var(--surface-2)", borderColor: "var(--panel-border-light)" }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--panel-border)", background: "var(--panel-raised)" }}
      >
        <div>
          <span
            className="text-[10px] font-extrabold uppercase tracking-[1.5px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Presets
          </span>
          {disabled && (
            <span
              className="ml-2 align-middle text-[9px] font-extrabold uppercase tracking-[1px]"
              style={{ color: "var(--color-cyan-accent)" }}
            >
              Syncing {loadingPreset === null ? "" : presetLabel(loadingPreset)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="Collapse preset list"
          aria-label="Collapse preset list"
          className="grid h-6 w-6 place-items-center rounded-md border"
          style={{
            background: "var(--surface)",
            borderColor: "var(--panel-border-light)",
            color: "var(--text-secondary)",
          }}
        >
          <CaretDoubleLeftIcon size={12} weight="bold" aria-hidden="true" />
        </button>
      </div>

      <div data-testid="preset-rail-scroll" className="min-h-0 flex-1 overflow-y-auto p-2">
        {BANKS.map((bank, bankIndex) => {
          const isExpanded = expandedBanks[bankIndex] ?? false;
          const activeInBank = bankIndex === activeBankIndex;
          const firstPreset = bankIndex * PRESETS_PER_ROW;
          const lastPreset = firstPreset + PRESETS_PER_ROW - 1;
          const panelId = `preset-bank-${bank}`;
          return (
            <div key={bank} className="mb-1.5">
              <button
                type="button"
                onClick={() => toggleBank(bankIndex)}
                aria-expanded={isExpanded}
                aria-controls={panelId}
                title={activeInBank ? "Active bank stays open" : `Toggle Bank ${bank}`}
                className="sticky top-0 z-10 flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-[10px] font-extrabold uppercase tracking-[1.4px] backdrop-blur transition-colors"
                style={{
                  color: activeInBank ? "var(--color-cyan-accent)" : "var(--text-muted)",
                  background: activeInBank ? "rgba(0,153,204,0.08)" : "var(--surface-2)",
                }}
              >
                {isExpanded ? (
                  <CaretDownIcon size={12} weight="bold" aria-hidden="true" />
                ) : (
                  <CaretRightIcon size={12} weight="bold" aria-hidden="true" />
                )}
                <span>Bank {bank}</span>
                <span
                  className="ml-auto rounded-full border px-1.5 py-0.5 text-[8px] tracking-[0.9px]"
                  style={{
                    borderColor: "var(--panel-border-light)",
                    color: activeInBank ? "var(--color-cyan-accent)" : "var(--text-muted)",
                    background: "var(--panel-inset)",
                  }}
                >
                  {presetLabel(firstPreset)}-{presetLabel(lastPreset)}
                </span>
                {activeInBank && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[8px] tracking-[0.9px]"
                    style={{
                      color: "var(--surface)",
                      background: "var(--color-cyan-accent)",
                    }}
                  >
                    {presetLabel(currentPreset)}
                  </span>
                )}
              </button>
              {isExpanded && (
                <div id={panelId} className="mt-1 space-y-1">
                  {Array.from({ length: PRESETS_PER_ROW }, (_, i) => {
                    const preset = bankIndex * PRESETS_PER_ROW + i;
                    const active = preset === currentPreset;
                    const loading = preset === loadingPreset;
                    return (
                      <div
                        key={preset}
                        ref={active ? activeRef : undefined}
                        onClick={(event) => {
                          if (recallDisabled) return;
                          if ((event.target as HTMLElement).closest("input")) return;
                          onSelectPreset(preset);
                        }}
                        className="group flex cursor-pointer items-center gap-1.5 rounded-xl border p-1 transition-all"
                        style={{
                          background: active
                            ? "linear-gradient(90deg, rgba(0,153,204,0.14), var(--surface))"
                            : loading
                              ? "linear-gradient(90deg, rgba(0,153,204,0.08), var(--surface))"
                              : "var(--surface)",
                          borderColor: active
                            ? "var(--color-cyan-accent)"
                            : loading
                              ? "rgba(0,153,204,0.38)"
                              : "var(--panel-border-light)",
                          boxShadow: active
                            ? "0 0 0 2px rgba(0,153,204,0.10)"
                            : "inset 0 1px 0 var(--panel-border-light)",
                        }}
                      >
                        <button
                          type="button"
                          disabled={recallDisabled}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectPreset(preset);
                          }}
                          title={
                            disabled
                              ? "Waiting for the current preset state to finish syncing"
                              : `Recall ${presetLabel(preset)} (PC ${preset})`
                          }
                          className="grid w-10 flex-shrink-0 place-items-center rounded-lg py-1 font-mono text-[13px] font-extrabold transition-colors disabled:cursor-default disabled:opacity-55"
                          style={{
                            background: active ? "rgba(0,153,204,0.10)" : "var(--panel-inset)",
                            color: active ? "var(--color-cyan-accent)" : "var(--text)",
                          }}
                        >
                          {presetLabel(preset)}
                        </button>
                        <input
                          value={presetNames[preset] ?? ""}
                          onChange={(event) => rename(preset, event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          placeholder={`Preset ${preset + 1}`}
                          aria-label={`${presetLabel(preset)} name`}
                          className="h-6 min-w-0 flex-1 rounded-lg border px-1.5 text-[11px] font-bold outline-none"
                          style={{
                            background: "var(--panel-inset)",
                            borderColor: "var(--panel-border-light)",
                            color: "var(--text)",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
