# App icon — Pulse

Source assets for the Personal Dashboard desktop app icon. Kept in the repo so
every platform format can be re-rendered from the vector master.

## Files

```
resources/icon/
├─ pulse-icon.svg     ← vector master (1024×1024, transparent corners) — source of truth
├─ icon.png           ← 1024×1024  (electron-builder default source / Linux)
├─ icon-512.png       ← 512×512    (dev Dock icon, set in src/main.ts)
├─ icon-256.png       ← 256×256    (Windows base, if ever needed)
├─ Pulse.iconset/     ← every size macOS needs to build the .icns
└─ icon.icns          ← native macOS bundle icon (generated — see below)
```

## Where it's wired

- **Packaged bundle** (Finder/Dock of the installed `.app`): `electron-builder.yml`
  → `mac.icon: resources/icon/icon.icns`.
- **Dev Dock** (`pnpm start`): `src/main.ts` calls `app.dock.setIcon()` with
  `icon-512.png`, guarded by `!app.isPackaged` (this folder isn't shipped in the
  packaged `files` glob).

## Regenerating

Re-render PNGs from `pulse-icon.svg` at the sizes above, then rebuild the `.icns`
from the iconset (macOS only):

```sh
cd apps/desktop-electron/resources/icon
iconutil -c icns Pulse.iconset -o icon.icns
```

## Notes

- The squircle corners are baked into the PNGs (transparent outside); macOS adds
  its own drop shadow, so the exports intentionally have none.
- For a Windows `.ico`, run `icon-256.png` (plus 16/32/48) through any png→ico
  tool, or let electron-builder derive it from `icon.png`.
