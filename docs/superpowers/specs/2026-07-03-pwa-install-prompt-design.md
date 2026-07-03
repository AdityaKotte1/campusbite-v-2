# PWA Install Prompt — Design

**Date:** 2026-07-03
**App:** `apps/student-app`
**Goal:** Let students install the MunchAdda web app to their phone home screen with a single button, so it launches full-screen with no browser URL bar.

---

## Background — what already exists

The student-app is **already a fully configured PWA**. No new manifest, icons, or service worker are needed:

- `public/manifest.json` — complete: `display: "fullscreen"`, `display_override: ["fullscreen","standalone","minimal-ui"]`, regular + maskable icons (192/512), screenshots, app shortcuts, `start_url: "/?source=pwa"`.
- `public/sw.js` — service worker, registered by `src/components/pwa/sw-register.tsx` (mounted in `layout.tsx`).
- `public/offline.html` — offline fallback.
- `public/.well-known/assetlinks.json` — references an Android TWA package (not used by this feature; we install the PWA directly, not via Play Store).

**What's missing:** the install *button/UI*. That is the entire scope of this feature.

---

## Key constraint (drives the whole design)

The browser URL bar can **only** be removed by *installing* the PWA and launching it from the home-screen icon. A normal browser tab can never hide its own URL bar (browser security rule). So "full-screen, no URL bar" = "install the app." That is what this button delivers.

- **Android (Chrome/Edge):** the browser fires a `beforeinstallprompt` event. We capture it and call `.prompt()` from our button → native install dialog → one tap, installed. True one-button flow.
- **iOS (Safari):** Apple provides **no** programmatic install. iPhone users must manually tap Share → "Add to Home Screen." Best we can do is show an instruction sheet.
- **Display mode:** stays `fullscreen` (already set) — installed app shows no URL bar AND no phone status bar (immersive). No manifest change.

---

## Decisions (locked with user)

1. **PWA install directly** — no Play Store / TWA redirect.
2. **Two entry points:** (a) an auto-appearing dismissible banner, and (b) a permanent "Install app" row in the Profile page.
3. **iOS:** both entry points appear on iPhone too; tapping opens an instruction sheet (Share → Add to Home Screen). *(Open to veto at spec review — alternative is Profile-only on iOS.)*
4. **Display mode:** `fullscreen` (unchanged).

---

## Behavior matrix

| Situation | Banner | Profile row tap |
|---|---|---|
| Android, installable | Shows (after delay). Tap → native install dialog. | Fires native install dialog. |
| iOS Safari, not installed | Shows (after delay). Tap → iOS instruction sheet. | Opens iOS instruction sheet. |
| Already installed / launched from icon (`display-mode: standalone` **or** `fullscreen`, or `?source=pwa`) | Hidden | Row hidden |
| Desktop / unsupported browser, not installable | Hidden | Row hidden |
| Banner dismissed (×) within snooze window | Hidden | Still works |

---

## Components

Two new files + two small edits. All the messy platform logic is isolated in the hook so the UI stays dumb.

### 1. `src/components/pwa/use-install-prompt.ts` (new) — the brain
A client hook that owns all install state and platform detection.

**Exposes:**
```ts
{
  canPrompt: boolean;   // true on Android when a beforeinstallprompt event is captured
  isIOS: boolean;       // iOS Safari, not in standalone
  isInstalled: boolean; // running in standalone/fullscreen or launched via ?source=pwa
  promptInstall: () => Promise<void>; // Android: call captured event.prompt(); iOS: no-op (UI opens sheet)
}
```

**Internals:**
- On mount, add a `beforeinstallprompt` listener; `preventDefault()` and stash the event in a ref; set `canPrompt = true`.
- Add an `appinstalled` listener → set `isInstalled = true`, clear the stashed event.
- Detect installed: `window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true || new URLSearchParams(location.search).get('source') === 'pwa'`.
- Detect iOS: userAgent test for iPhone/iPad/iPod (and iPadOS-as-Mac touch check), AND not installed.
- `promptInstall()`: if a stashed event exists, call `.prompt()`, await `userChoice`, then clear the ref (a `beforeinstallprompt` event can only be used once).
- SSR-safe: all `window` access guarded; return inert defaults during SSR.

### 2. `src/components/pwa/install-prompt.tsx` (new) — the banner + iOS sheet
Client component, consumes the hook. Rendered once globally.

- **Visibility gate:** render nothing if `isInstalled`, or if neither `canPrompt` nor `isIOS`, or if snoozed (see below), or before the initial delay elapses.
- **Banner:** fixed near the bottom (above the existing `bottom-nav`), branded (brand color, app icon), copy "Install MunchAdda — add to your home screen," an **Install** button and a **×** dismiss. Uses existing design tokens (`bg-surface`, `text-brand`, `bg-brand-pale`, etc.) and `framer-motion` for slide-up (already a dependency).
- **Install button click:** if `canPrompt` → `promptInstall()`. If `isIOS` → open the iOS instruction sheet.
- **iOS instruction sheet:** reuse `src/components/ui/bottom-sheet.tsx` (`<BottomSheet>`), titled "Install MunchAdda," showing the 2 steps with a Share-icon graphic: 1) Tap the Share icon in Safari's toolbar. 2) Choose "Add to Home Screen." 3) Tap "Add."
- **Delay:** don't show on first paint. Show after ~a few seconds, or once a light "intent" signal has passed (simplest acceptable: a `setTimeout` of ~3–4s after mount). Keep it simple — a timer is fine.
- **Snooze on dismiss:** `localStorage` key `ma_install_dismissed_at` = timestamp. Banner suppressed if dismissed within the last **14 days**. Profile row is never suppressed.

### 3. `src/app/layout.tsx` (edit)
Mount `<InstallPrompt />` once, as a sibling of the existing `<ServiceWorkerRegister />`.

### 4. `src/app/(main)/profile/page.tsx` (edit)
Add an **"Install app"** row. Placement: a new item in (or just above) the **Settings** section, matching the existing row markup (icon tile + label + chevron). Icon: `Download` or `Smartphone` (lucide). On click, call the same hook's `promptInstall()` (Android) or open the iOS sheet (iOS). The row **hides itself when `isInstalled`** so installed users don't see a dead button.

---

## Data flow

```
layout.tsx
  └─ <InstallPrompt/> ── uses ──> use-install-prompt (captures beforeinstallprompt, detects platform/installed)
        ├─ Android: button → promptInstall() → native dialog
        └─ iOS:     button → <BottomSheet/> instructions

profile/page.tsx
  └─ "Install app" row ── uses ──> use-install-prompt (same hook, independent instance)
```

The hook is used in two independent places; each instance captures its own `beforeinstallprompt`. That is fine — the event fires per-page-load and either instance mounted at capture time gets it. (If this proves flaky, a shared context can be added later — out of scope for v1.)

---

## Edge cases & handling

- **Event fires before component mounts:** `beforeinstallprompt` can fire early. Acceptable risk for v1; the banner simply won't show that session if missed. (Mitigation if needed later: capture in a tiny inline script and re-dispatch — out of scope now.)
- **Already installed:** all UI hidden via the installed check. No dead buttons.
- **User dismisses native dialog:** `userChoice` resolves `dismissed`; we just clear state, no error. The 14-day snooze is set **only** when the user taps our **×** on the banner — never when they cancel the OS install dialog — so accidentally cancelling the native prompt does not hide the banner for two weeks.
- **Desktop Chrome:** `beforeinstallprompt` may fire; banner would show. Since the target is phones, gate the banner to small viewports (e.g. only show when `max-width` mobile) — Profile row can still show. *(Confirm at review: show banner on desktop or not.)*
- **localStorage unavailable / private mode:** wrap in try/catch; treat as "not snoozed."

---

## Testing

- **Chrome DevTools:** Application → Manifest shows installable; trigger the install flow; toggle `display-mode` to verify hiding.
- **Real Android device:** tap banner + Profile row → native dialog → install → relaunch from icon → confirm full-screen, no URL bar, and both entry points now hidden.
- **Real iPhone (Safari):** tap banner + Profile row → instruction sheet renders correctly → follow steps → launch from icon → confirm no Safari chrome and entry points hidden.
- **Snooze:** dismiss banner → reload → banner stays hidden; confirm it returns after clearing the localStorage key.

---

## Out of scope (YAGNI)

- Play Store / TWA redirect.
- Push notifications.
- Changing manifest display mode, icons, or service worker.
- A/B testing install copy, analytics events (can add a single event later).
- Shared React context for the install event (only if the two-instance approach proves unreliable).
