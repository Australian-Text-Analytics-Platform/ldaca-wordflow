"""Environment-backed ASGI bootstrap for production server imports."""

from .infrastructure.system_certificates import use_system_certificates
from .main import create_app
from .settings import load_settings

# uvicorn imports this module directly (dev script, server imports), not the CLI.
use_system_certificates()
app = create_app(load_settings(), serve_frontend=False)


__all__ = ["app"]
