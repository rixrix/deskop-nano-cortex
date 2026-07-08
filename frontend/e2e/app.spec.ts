/**
 * End-to-end smoke + IPC-path tests for the control surface, driven against the Vite
 * dev server with a mocked Tauri backend (see fixtures/tauri-mock.ts).
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-1]
 * @see docs/specs/400-dx-tooling/spec.md [FR-11] [FR-12]
 */
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { installTauriMock, type NanoMockOptions } from "./fixtures/tauri-mock";

async function openMockedApp(page: Page, options?: NanoMockOptions) {
  await installTauriMock(page, options);
  await page.goto("/");
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await page
    .locator("#splash")
    .waitFor({ state: "detached", timeout: 6000 })
    .catch(() => {});
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(name, {
    path: screenshotPath,
    contentType: "image/png",
  });
}

async function emitBleNotification(page: Page, hexPayload: string) {
  await page.evaluate((payload) => {
    window.__nanoMock.emit("midi://log", {
      ts: Date.now(),
      level: "info",
      message: `[ble] notification 0000c305-0000-1000-8000-00805f9b34fb: ${payload}`,
    });
  }, hexPayload);
}

test("boots with the app title and the main surfaces", async ({ page }) => {
  await openMockedApp(page);
  await expect(page).toHaveTitle("Desktop Nano Cortex");
  await expect(page.getByRole("tab", { name: "Console" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Advanced" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Help" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "About" })).toBeVisible();
  await expect(page.getByText("Presets", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Footswitch Deck")).toBeVisible();
  await expect(page.getByText("Utilities", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Logs", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Save/Load")).toHaveCount(0);
  await expect(page.getByText(/Memory auto-saves|Settings export JSON/i)).toHaveCount(0);
  await expect(
    page.getByText("Connect from the top bar; USB sends commands, Bluetooth reads state"),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Help" }).click();
  await expect(page.getByText("What each connection can do")).toBeVisible();
  await expect(page.getByText("Confirm vs Auto-discard")).toBeVisible();
});

test("exposes the experimental Capture Lab behind the dev flag, with an Exp badge", async ({
  page,
}) => {
  await openMockedApp(page);
  await page.getByRole("tab", { name: "Advanced" }).click();
  await expect(page.getByRole("tab", { name: "Diagnostics" })).toBeVisible();
  await expect(page.getByText("Diagnostics Capture")).toBeVisible();
  await expect(page.getByText("Diagnostics are off")).toBeVisible();
  await page.getByRole("button", { name: "Enable diagnostics" }).click();
  await expect(page.getByRole("button", { name: "Diagnostics on" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Settings" })).toHaveCount(0);
  // EXPERIMENTAL_FEATURES is on under `vite dev`, so Capture Lab + the badge appear.
  await expect(page.getByRole("tab", { name: /Capture Lab/ })).toBeVisible();
  await expect(page.getByText("Exp", { exact: true }).first()).toBeVisible();
});

test("USB connect routes through Tauri IPC and reflects the connected state", async ({ page }) => {
  await openMockedApp(page);
  await expect(page.getByRole("banner").getByText("Disconnected", { exact: true })).toBeVisible();
  await page.getByTitle("Connect via USB MIDI").click();

  await expect
    .poll(() => page.evaluate(() => window.__nanoMock.invokeLog.some((e) => e.cmd === "connect")))
    .toBe(true);
  // The connection poller flips the UI to Connected within its 2s interval.
  await expect(page.getByRole("banner").getByText("Connected", { exact: true })).toBeVisible({
    timeout: 8000,
  });
  await expect(page.getByText("Bluetooth needed")).toBeVisible();
  await expect(
    page.getByText("Live knobs, names, loaded assets, and monitor need Bluetooth"),
  ).toBeVisible();
});

test("a documented control sends the correct MIDI bytes over IPC", async ({ page }) => {
  await openMockedApp(page);
  await page.getByTitle("Connect via USB MIDI").click();
  await expect(page.getByRole("banner").getByText("Connected", { exact: true })).toBeVisible({
    timeout: 8000,
  });

  await page.getByRole("button", { name: /^Tap/i }).first().click();

  // Tap tempo is a momentary CC42: 127 (press) then 0 (release) on channel 1 (0xB0).
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nanoMock
          .sentMidi()
          .some((m) => m.bytes[0] === 0xb0 && m.bytes[1] === 42 && m.bytes[2] === 127),
      ),
    )
    .toBe(true);
});

test("an inbound midi://message event keeps the app responsive", async ({ page }) => {
  await openMockedApp(page);
  // The app subscribes to midi://message; emitting a Program Change must not crash it.
  await page.getByTitle("Connect via USB MIDI").click();
  await page.evaluate(() =>
    window.__nanoMock.emit("midi://message", { ts_ms: 1, bytes: [0xc0, 0x04] }),
  );
  await expect(page.getByRole("tab", { name: "Console" })).toBeVisible();
});

test("document-level shortcuts are deferred while typing remains safe", async ({ page }) => {
  await openMockedApp(page);
  await page.getByTitle("Connect via USB MIDI").click();
  await expect(page.getByRole("banner").getByText("Connected", { exact: true })).toBeVisible({
    timeout: 8000,
  });

  await page.keyboard.press("1");
  await expect.poll(() => page.evaluate(() => window.__nanoMock.sentMidi().length)).toBe(0);

  await page.getByLabel("A1 name").fill("123");
  await expect.poll(() => page.evaluate(() => window.__nanoMock.sentMidi().length)).toBe(0);
});

test("live view screenshots cover transport states and control dedupe", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await openMockedApp(page, {
    connection: "full",
    presetNames: Array.from({ length: 64 }, (_, index) => `Full Name ${index + 1}`),
  });

  await expect(page.getByText("Preset names complete")).toBeVisible({ timeout: 9000 });
  await expect(page.getByRole("button", { name: /^Tap$/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Tuner (Closed|Open)/ })).toHaveCount(1);
  await expect(page.getByLabel("Expression CC1")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Hold I/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Hold II/i })).toHaveCount(0);
  await expect(page.getByText("Hardware monitor")).toHaveCount(0);
  await expect(page.getByTestId("signal-path-overview")).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByTestId("signal-path-overview")
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__nanoMock.invokeLog.filter((e) => e.cmd === "request_fx_params").length,
        ),
      { timeout: 9000 },
    )
    .toBeGreaterThanOrEqual(5);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(
          new Set(
            window.__nanoMock.invokeLog
              .filter((e) => e.cmd === "request_fx_params")
              .map((e) => (e.args as { slot?: string }).slot)
              .filter((slot): slot is string => Boolean(slot)),
          ),
        )
          .sort()
          .join(","),
      ),
    )
    .toBe("post-1,post-2,post-3,pre-1,pre-2");
  await attachScreenshot(page, testInfo, "usb-bluetooth-full-live");
  await expect(page.getByText("Apache-2.0")).toBeVisible();
  await expect(page.getByRole("link", { name: "Donate" })).toBeVisible();

  await emitBleNotification(page, "c0 08 01 18 01 1c");
  await expect(page.getByText("Unsaved", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Save$/ }).first()).toBeEnabled();

  for (const bank of ["B", "C", "D", "E", "F", "G", "H"]) {
    await page.getByRole("button", { name: new RegExp(`Bank ${bank}`) }).click();
  }
  await expect
    .poll(() =>
      page
        .getByTestId("preset-rail-scroll")
        .evaluate((node) => node.scrollHeight > node.clientHeight),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.getByTestId("utilities-rail").evaluate((node) => {
        const railHeight = node.getBoundingClientRect().height;
        return railHeight <= window.innerHeight - 140;
      }),
    )
    .toBe(true);
  await attachScreenshot(page, testInfo, "expanded-preset-rail-scroll");

  await page.getByLabel("Open floating tone studio").click();
  const toneStudioDialog = page.getByRole("dialog", { name: "Floating Tone Studio" });
  await expect(toneStudioDialog).toBeVisible();
  await expect(page.getByTestId("tone-studio-signal-path")).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByTestId("tone-studio-signal-path")
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    )
    .toBe(true);

  // Select Post FX 2 (Dual Reverse Delay, 22 params) inside the already-open modal so the
  // screenshot below shows a param-heavy pedal rather than the 5-param default (Transpose).
  // Selecting it before opening doesn't stick: PedalWorkbench resets to Pre FX 1 on every
  // mount (its currentPreset-reset effect fires on mount too, not just on preset changes).
  await toneStudioDialog.getByLabel("Select Post FX 2").click();
  await page.getByRole("button", { name: "Refresh values" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__nanoMock.invokeLog.some((e) => e.cmd === "request_fx_params")),
    )
    .toBe(true);
  await expect(page.getByText("50.0 %").first()).toBeVisible();
  await attachScreenshot(page, testInfo, "floating-tone-studio");

  await page.getByLabel("Close tone studio").click();
  await page.getByLabel("Collapse utilities").click();
  await expect(page.getByLabel("Show utilities")).toBeVisible();
  await attachScreenshot(page, testInfo, "utilities-sidebar-collapsed");
});

test("auto save persists dirty live rotary edits through the device save command", async ({
  page,
}) => {
  await openMockedApp(page, {
    connection: "full",
    presetNames: Array.from({ length: 64 }, (_, index) => `Auto Save Preset ${index + 1}`),
  });

  await expect(page.getByText("Preset names complete")).toBeVisible({ timeout: 9000 });
  await page
    .getByRole("button", { name: /^auto$/i })
    .first()
    .click();
  await emitBleNotification(page, "c0 08 01 18 03 1c");

  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__nanoMock.invokeLog.filter((e) => e.cmd === "save_active_preset").length,
        ),
      { timeout: 6000 },
    )
    .toBeGreaterThanOrEqual(1);
});

test("footswitch rotaries write live selector commands and mark the preset dirty", async ({
  page,
}) => {
  await openMockedApp(page, {
    connection: "full",
    presetNames: Array.from({ length: 64 }, (_, index) => `Rotary Preset ${index + 1}`),
  });

  await expect(page.getByText("Preset names complete")).toBeVisible({ timeout: 9000 });
  await page.getByRole("button", { name: /Cycle Capture.*right/i }).click();
  await page.getByRole("button", { name: /Cycle Cab.*right/i }).click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nanoMock.invokeLog.some(
          (entry) =>
            entry.cmd === "set_capture_slot" && (entry.args as { slot?: number }).slot === 2,
        ),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__nanoMock.invokeLog.some(
          (entry) =>
            entry.cmd === "set_cab_ir_slot" && (entry.args as { slot?: number }).slot === 1,
        ),
      ),
    )
    .toBe(true);
  await expect(page.getByText("Unsaved", { exact: true }).first()).toBeVisible();
});

test("desktop console keeps utilities and footswitch preset slots visible at 1080p width", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await openMockedApp(page, {
    connection: "full",
    presetNames: Array.from({ length: 64 }, (_, index) => `Desktop Preset ${index + 1}`),
  });

  await expect(page.getByText("Preset names complete")).toBeVisible({ timeout: 9000 });
  await expect(page.getByTestId("utilities-rail")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Manual$/i }).first()).toBeVisible();
  await expect(page.getByTestId("footswitch-quick-slots")).toBeVisible();
  await expect
    .poll(() =>
      page.getByTestId("footswitch-quick-slots").evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      }),
    )
    .toBe(true);
  await attachScreenshot(page, testInfo, "desktop-1920x900-console");
});

test("desktop console fits a maximized 1080p viewport with no page scroll", async ({
  page,
}, testInfo) => {
  // Windows 1920x1080 at 100% scale leaves ~1000 CSS px for a maximized window. The `short:`
  // density variant (max-height media query, see styles/index.css [NFR-9]) must keep the whole
  // Console page inside the viewport so no page-level scrollbar appears.
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openMockedApp(page, {
    connection: "full",
    presetNames: Array.from({ length: 64 }, (_, index) => `Desktop Preset ${index + 1}`),
  });

  await expect(page.getByText("Preset names complete")).toBeVisible({ timeout: 9000 });
  await expect(page.getByTestId("footswitch-quick-slots")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollHeight <= document.documentElement.clientHeight,
      ),
    )
    .toBe(true);
  await attachScreenshot(page, testInfo, "desktop-1920x1000-console-no-scroll");
});

test("partial preset metadata preserves usable names and reports incomplete sync", async ({
  page,
}, testInfo) => {
  await openMockedApp(page, {
    connection: "full",
    presetNames: ["Clean 1 Simple", "Clean 2 Simple"],
  });

  await expect(page.getByText("Preset names 2/64")).toBeVisible({ timeout: 9000 });
  await expect(page.getByLabel("A1 name")).toHaveValue("Clean 1 Simple");
  await expect(page.getByLabel("A2 name")).toHaveValue("Clean 2 Simple");
  await attachScreenshot(page, testInfo, "partial-preset-metadata");
});

test("offline screenshots cover disconnected, USB-only, Bluetooth-only, and narrow layouts", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await openMockedApp(page);
  await attachScreenshot(page, testInfo, "disconnected-live");
  await page.getByRole("tab", { name: "About" }).click();
  await expect(page.getByText("Telemetry posture")).toBeVisible();
  await expect(page.getByText("Telemetry is on")).toBeVisible();
  await attachScreenshot(page, testInfo, "about-panel");
  await page.getByRole("tab", { name: "Console" }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTitle("Connect via USB MIDI").click();
  await expect(page.getByText("Bluetooth needed")).toBeVisible({ timeout: 8000 });
  await attachScreenshot(page, testInfo, "usb-only-live");

  const bluetoothPage = await page.context().newPage();
  await openMockedApp(bluetoothPage, { connection: "bluetooth" });
  await expect(bluetoothPage.getByText("USB needed")).toBeVisible({ timeout: 8000 });
  await attachScreenshot(bluetoothPage, testInfo, "bluetooth-only-live");

  await bluetoothPage.close();

  const mobilePage = await page.context().newPage();
  await mobilePage.setViewportSize({ width: 390, height: 900 });
  await openMockedApp(mobilePage, { connection: "full" });
  await expect(mobilePage.getByRole("tab", { name: "Console" })).toBeVisible({ timeout: 8000 });
  await attachScreenshot(mobilePage, testInfo, "mobile-narrow-live");
  await mobilePage.close();
});
