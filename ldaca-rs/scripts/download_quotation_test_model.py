"""Provision the pinned model for CI/tests; never imported by the expression."""
import hashlib
from pathlib import Path
import urllib.request

NAME = "english-ewt-ud-2.5-191206.udpipe"
SHA256 = "784bd0fa85e3d831fd02a55290d0acfd05c953159dc38cc33d52e1b28add9957"
URL = "https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/handle/11234/1-3131/" + NAME

if __name__ == "__main__":
    import sys
    destination = Path(sys.argv[1])
    with urllib.request.urlopen(URL, timeout=120) as response:
        data = response.read(32 * 1024 * 1024 + 1)
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError("Quotation test model checksum mismatch")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
