"""Trace four marks from the LDaCA logo into outlines, ldaca-marks.json.

make_wordflow_logo.py places them in the Wordflow logo. Each mark is the
logo's own drawing inside a circle around a point, scaled so the circle has a
radius of 4 icon units and centred on 0,0. Nothing is redrawn.

From the repository root:

    uv run --no-project --with pillow --with scikit-image python scripts/branding/trace_ldaca_marks.py
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from skimage.measure import approximate_polygon, find_contours

HERE = Path(__file__).resolve().parent
LOGO = HERE.parents[1] / "frontend" / "public" / "LDaCA_logo_Light.png"
RADIUS = 4.0

# mark: (centre x, centre y, radius), in pixels of LDaCA_logo_Light.png
MARKS = {
    "ring": (125, 266, 40),  # in the L
    "arcs": (115, 350, 58),  # in the L
    "track": (585, 370, 50),  # in the D
    "ring-on-stem": (1300, 415, 52),  # in the A
}


def main() -> None:
    image = np.asarray(Image.open(LOGO).convert("RGBA")).astype(float)
    # The logo's marks are the dark, opaque pixels inside the pale letters.
    dark = (image[..., 3] > 128) & (image[..., :3].mean(axis=2) < 140)
    traced = {}
    for name, (cx, cy, half) in MARKS.items():
        pad = 4
        crop = dark[
            cy - half - pad : cy + half + pad, cx - half - pad : cx + half + pad
        ].astype(float)
        yy, xx = np.mgrid[: crop.shape[0], : crop.shape[1]]
        crop[np.hypot(xx - half - pad, yy - half - pad) > half] = 0
        smooth = gaussian_filter(crop, 0.9)
        scale = RADIUS / half
        parts = []
        for contour in find_contours(smooth, 0.5):
            polygon = approximate_polygon(contour, 0.35)
            # Skip slivers of neighbouring marks cut off by the circle.
            if len(polygon) < 4 or np.ptp(contour, axis=0).max() < half * 0.5:
                continue
            points = [
                f"{(x - half - pad) * scale:.2f} {(y - half - pad) * scale:.2f}"
                for y, x in polygon[:-1]
            ]
            parts.append("M" + " L".join(points) + "Z")
        traced[name] = " ".join(parts)
        print(f"{name}: {len(parts)} outlines")
    (HERE / "ldaca-marks.json").write_text(
        json.dumps(traced, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
