"""Command-line interface for LDaCA Wordflow.

Usage:
    uvx ldaca-wordflow                  # Launch full app (backend + frontend)
    uvx ldaca-wordflow --backend        # Launch backend only
    uvx ldaca-wordflow --port 9000      # Custom port
    uvx ldaca-wordflow --root-path /app # External reverse-proxy prefix

The package entry point parses operator choices, loads one immutable settings
snapshot, configures process logging/watchdog behavior, and starts the server.
"""

from __future__ import annotations

import argparse
import logging


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse the installed `ldaca-wordflow` command arguments."""

    parser = argparse.ArgumentParser(
        prog="ldaca-wordflow",
        description="LDaCA Text Analytics Web Application",
    )
    parser.add_argument(
        "--backend",
        action="store_true",
        help="Launch only the backend server",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Port to serve on (default: 8001)",
    )
    parser.add_argument(
        "--host",
        type=str,
        default=None,
        help="Host to bind to (default: 127.0.0.1 in single-user mode)",
    )
    parser.add_argument(
        "--root-path",
        type=str,
        default=None,
        help="ASGI root path supplied by an external reverse proxy",
    )
    parser.add_argument(
        "--multi-user",
        action="store_true",
        help=(
            "Enable multi-user mode with OAuth/OIDC login. "
            "Requires GOOGLE_CLIENT_ID, or the complete CILogon client/secret/redirect "
            "configuration, in the environment."
        ),
    )
    parser.add_argument(
        "--startup-file",
        type=str,
        default=None,
        help=argparse.SUPPRESS,
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    """Load process configuration and dispatch the selected server profile."""
    args = _parse_args(argv)

    from ._logging import setup_logging
    from .infrastructure.process_watchdog import start_parent_watchdog
    from .infrastructure.system_certificates import use_system_certificates
    from .settings import load_settings

    use_system_certificates()

    cli_settings = (
        load_settings(multi_user=True) if args.multi_user else load_settings()
    )
    setup_logging(
        level=cli_settings.log_level,
    )
    start_parent_watchdog()

    if cli_settings.data_root is not None:
        from .data_root_config import describe_data_root_failure, probe_data_root

        # An operator-set data folder that can't be used stops the server
        # before it listens, with one line instead of a traceback (issue 425).
        try:
            probe_data_root(cli_settings.data_root)
        except Exception as exc:
            logging.getLogger(__name__).error(
                "%s", describe_data_root_failure(cli_settings.data_root, exc)
            )
            raise SystemExit(1) from None

    from .runtime_caches import route_unwritable_caches

    # Before any model library reads its cache variable (issue 425).
    route_unwritable_caches(cli_settings.data_root)

    serve_frontend = not args.backend

    from .server_launcher import run_server

    run_server(
        serve_frontend=serve_frontend,
        port=args.port,
        host=args.host,
        root_path=args.root_path,
        settings=cli_settings,
        startup_file=args.startup_file,
    )


if __name__ == "__main__":
    # Multiprocessing guard for PyInstaller frozen executables: on Windows the
    # module is re-imported in worker processes; freeze_support() returns only
    # in the main process, so the call below is a no-op for children.
    import multiprocessing as mp

    mp.freeze_support()
    if mp.current_process().name == "MainProcess":
        main()
