"""Reproduce the unmodified UDPipe library sources from the pinned release."""
import hashlib
import io
from pathlib import Path
import urllib.request
import zipfile

URL = "https://github.com/ufal/udpipe/releases/download/v1.4.0/udpipe-1.4.0-bin.zip"
SHA256 = "457f541e204737d354c749b473060a28b2debf625f23075543d9eba78be016c1"


def main() -> None:
    payload = urllib.request.urlopen(URL, timeout=120).read()
    if hashlib.sha256(payload).hexdigest() != SHA256:
        raise ValueError("UDPipe release checksum mismatch")
    destination = Path(__file__).resolve().parents[1] / "vendor" / "udpipe"
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        for source, target in (
            ("src_lib_only/udpipe.cpp", "udpipe.cpp"),
            ("src_lib_only/udpipe.h", "udpipe.h"),
            ("LICENSE", "LICENSE"),
        ):
            (destination / target).write_bytes(archive.read("udpipe-1.4.0-bin/" + source))




if __name__ == "__main__":
    main()
