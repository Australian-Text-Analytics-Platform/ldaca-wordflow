# Frontend Configuration Reference

The current application uses the Rust project backend by default. No `.env`
file, experimental mode, backend selector or saved backend URL is required.

## Development ports

Set shell environment variables when starting the root development command:

```sh
FRONTEND_PORT=4000 VITE_BACKEND_PORT=8003 vp run dev
```

Defaults are frontend port 3000 and Rust backend port 8002. The browser uses
same-origin `/api/project`, `/api/ai`, `/api/resources` and `/health` requests;
Vite proxies them to Rust, including language-model assets.
Vite binds loopback and refuses an occupied port.

`vp run dev:desktop` uses the fixed Vite origin `http://127.0.0.1:3001` and
separate ephemeral embedded-backend ports discovered through Tauri IPC.

## Optional build variables

- `VITE_DEPLOYMENT_ID`: deployment label displayed in Feedback.

App version, build revision and build date are supplied by Vite from the
package and checkout. The retired FastAPI OAuth and API-base settings do not
configure the current project interface.

Help, Information and References load only bundled content. There is no remote
documentation origin setting. Normal external links remain available.
