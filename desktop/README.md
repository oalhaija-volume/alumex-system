# AlumexFlow Desktop for Windows

This package wraps the existing AlumexFlow application in an isolated Electron window. It uses the same employee login and permissions as `https://www.alumexflow.com`. The installer creates Desktop and Start menu shortcuts for the current Windows user.

The app starts at `/offline?path=%2Fdashboard`. Its persistent Chromium session retains the service worker, saved login, IndexedDB workspace and pending changes between app restarts. The web application's offline workspace and synchronization rules still determine which business actions work without a connection. Connect and sign in on each laptop once, download the employee workspace, then wait for any pending changes to sync before switching accounts.

The installer keeps the user's data separately from application files, under `%APPDATA%\AlumexFlow Desktop`. Upgrading or uninstalling the program preserves that offline data. Do not clear that folder while work is waiting to sync.

## Build

From the repository root:

```sh
node --test desktop/tests/*.test.cjs
node desktop/scripts/build-windows.mjs
```

The build writes the Windows x64 installer and its SHA-256 checksum/report under `desktop/dist/`. Each build uses a new output name and preserves earlier artifacts. No npm installation, global configuration, environment-variable changes, system tools installation or Wine is required on this Mac. The Node build downloads pinned official Electron and NSIS tools plus the `7zip-bin` extraction tool into `desktop/.cache/`, verifies their hashes, and bundles only explicit public wrapper files. No repository environment files or service credentials are packaged.

The upstream POSIX NSIS compiler embeds a system resource directory. A build-local copy changes that single default path to its current tool directory. The original downloaded binary remains unchanged; `-NOCONFIG` prevents loading user/global NSIS configuration. This keeps the build's data and caches inside this repository without setting `NSISDIR`.

The resulting installer is unsigned. The macOS build verifies the Windows executable format, x64 runtime, package contents, and installer compilation. Running the installed application and exercising Windows printing/installation still requires a Windows laptop.

The manual `windows-desktop.yml` GitHub Actions workflow builds on Windows, silently installs into its runner workspace, checks Desktop/Start menu shortcuts, observes a native window, and loads the public login without employee credentials. Its `--smoke-test --smoke-root=<absolute directory>` mode records only application/window checks and keeps all test data inside that explicit directory. The workflow uploads the installer, checksum, and verification reports; it does not deploy the web app or publish a release.

## Local development

When launching this source with an Electron runtime, pass `--local-test` to use **only** `http://localhost:3003`. No other origin flag is accepted. Test storage defaults to `desktop/.runtime/local-test`; an explicit `--test-data-dir=` is accepted only with local testing and must remain inside this package. Normal installs use the production domain.

## Security and references

Renderers run with context isolation, sandboxing and web security enabled. Node integration, webviews, external navigation, arbitrary popups and device permission requests are disabled. Same-origin document downloads use a native Save dialog; printing uses the native print dialog. The renderer receives no Electron bridge or filesystem API.

Implementation follows the current [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [persistent session API](https://www.electronjs.org/docs/latest/api/session), [webContents navigation API](https://www.electronjs.org/docs/latest/api/web-contents), and [NSIS compiler reference](https://nsis.sourceforge.io/Docs/Chapter3.html). Pinned runtime downloads come from [official Electron releases](https://github.com/electron/electron/releases), and the NSIS compiler comes from [electron-builder's official binary repository](https://github.com/electron-userland/electron-builder-binaries).
