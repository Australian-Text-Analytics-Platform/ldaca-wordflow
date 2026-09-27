# Frontend Configuration Reference

The current application uses the Rust project backend by default. No `.env`
file, experimental mode, backend selector or saved backend URL is required.

## Development ports

Set shell environment variables when starting the root development command:

```sh
FRONTEND_PORT=4000 VITE_BACKEND_PORT=8003 pnpm dev
```

Defaults are frontend port 3000 and Rust backend port 8002. The browser uses
same-origin `/api/project` and `/health` requests; Vite proxies them to Rust.
Vite binds loopback and refuses an occupied port.

`pnpm dev:desktop` uses the fixed Vite origin `http://127.0.0.1:3001` and
separate ephemeral embedded-backend ports discovered through Tauri IPC.

## Optional build variables

- `VITE_DOCS_ORIGIN`: online documentation root, with bundled documentation as
  fallback. May be set in `.env.local` during development.
- `VITE_DEPLOYMENT_ID`: deployment label displayed in Feedback.

App version, build revision and build date are supplied by Vite from the
package and checkout. The retired FastAPI OAuth and API-base settings do not
configure the current project interface.
