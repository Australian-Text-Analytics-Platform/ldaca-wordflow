"""Draw the detailed Wordflow logo, frontend/public/wordflow-logo.svg.

The logo is the favicon's mark (a W and F in one stroke) for 128 px and
larger, with words riding inside the stroke and marks from the LDaCA logo at
the W's bends and in the corpus dot. Every letter is placed along the stroke
as an outline, so the SVG needs no fonts.

The fonts are not in the repository. Put these five, all under the SIL Open
Font License, in one folder:

- JetBrainsMono-Bold.ttf  (github.com/JetBrains/JetBrainsMono, fonts/ttf)
- NotoSansSC.ttf          (github.com/google/fonts, ofl/notosanssc, the variable font)
- NotoSansJP.ttf          (github.com/google/fonts, ofl/notosansjp, the variable font)
- NotoSansKR.ttf          (github.com/google/fonts, ofl/notosanskr, the variable font)
- NotoSansTC.ttf          (github.com/google/fonts, ofl/notosanstc, the variable font)

Then, from the repository root:

    uv run --no-project --with fonttools python scripts/branding/make_wordflow_logo.py <fonts folder>

The LDaCA marks come from ldaca-marks.json, written by trace_ldaca_marks.py.
"""

import io
import itertools
import json
import math
import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1] / "frontend" / "public" / "wordflow-logo.svg"

# The mark, as in frontend/public/favicon.svg: the same two strokes, once as
# cubic segments for measuring and once as SVG path data.
MAIN = [
    ((8.8, 18.5), (10.5, 26), (12.8, 49), (17.8, 49)),
    ((17.8, 49), (22.8, 49), (23.8, 31.5), (26.8, 31.5)),
    ((26.8, 31.5), (29.8, 31.5), (31.8, 49), (35.8, 49)),
    ((35.8, 49), (39.8, 49), (40.2, 35), (41, 24)),
    ((41, 24), (41.5, 17), (43, 15), (47.5, 15)),
    ((47.5, 15), (48.67, 15), (49.83, 15), (51, 15)),
]
BRANCH = [
    ((39.98, 37.55), (40.4, 33), (42.2, 31), (46.5, 31)),
    ((46.5, 31), (47.67, 31), (48.83, 31), (50, 31)),
]
MAIN_D = (
    "M8.8 18.5 C10.5 26 12.8 49 17.8 49 S23.8 31.5 26.8 31.5 S31.8 49 35.8 49 "
    "S40.2 35 41 24 C41.5 17 43 15 47.5 15 L51 15"
)
BRANCH_D = "M39.98 37.55 C40.4 33 42.2 31 46.5 31 L50 31"
CORPUS_DOT = (8.8, 18.5)

LATIN = "latin"  # along the stroke
HAN = "han"  # along the stroke; used on the F's level arm, so upright
HAN_DOWN = "han-down"  # upright, top to bottom, on a downstroke
HANT_DOWN = "hant-down"  # the same, in Traditional Chinese
KANA_DOWN = "kana-down"
HANGUL_UPRIGHT = "hangul-upright"  # one syllable, upright wherever it sits
DOWN = (HAN_DOWN, HANT_DOWN, KANA_DOWN)
BLOCK = (*DOWN, HANGUL_UPRIGHT)  # glyphs that advance by their em square

# (stroke, distance along it where the word starts, script, word). Words sit
# on the straight runs; the W's bends are too tight for letters. The flow
# opens with "words" and closes with "flow"; "koala" came into English from
# Dharug, the language of the Sydney area; 글 is Korean for writing or text.
# 語料 (corpus) is in Traditional Chinese and 分析 (analysis) on the branch is
# Simplified; 分析 is written the same in both.
WORDS = [
    ("main", 6.8, LATIN, "words"),
    ("main", 19.6, HANT_DOWN, "語料"),
    ("main", 38.0, LATIN, "λόγος"),
    ("main", 58.3, KANA_DOWN, "ことば"),
    ("main", 78.6, LATIN, "text"),
    ("main", 89.6, LATIN, "koala"),
    ("main", 102.1, HANGUL_UPRIGHT, "글"),
    ("main", 107.0, LATIN, "flow"),
    ("branch", 7.6, HAN, "分析"),
]
FONT_FILE = {
    LATIN: "JetBrainsMono-Bold.ttf",
    HAN: "NotoSansSC.ttf",
    HAN_DOWN: "NotoSansSC.ttf",
    HANT_DOWN: "NotoSansTC.ttf",
    KANA_DOWN: "NotoSansJP.ttf",
    HANGUL_UPRIGHT: "NotoSansKR.ttf",
}
SIZE = {
    LATIN: 3.5,
    HAN: 2.75,
    HAN_DOWN: 3.0,
    HANT_DOWN: 3.0,
    KANA_DOWN: 3.0,
    HANGUL_UPRIGHT: 3.0,
}  # em, in icon units
GAP = {
    LATIN: 0.0,
    HAN: 0.15,
    HAN_DOWN: 0.2,
    HANT_DOWN: 0.2,
    KANA_DOWN: 0.2,
    HANGUL_UPRIGHT: 0.2,
}  # after each glyph

# Marks from the LDaCA logo among the words: (distance along the main stroke,
# mark, radius in icon units). They sit at the W's bends and keep the logo's
# own orientation. The corpus dot holds the ring from the L.
FLOW_MARKS = [(32.0, "arcs", 2.5), (53.2, "track", 2.4), (73.4, "ring-on-stem", 2.5)]
CORPUS_MARK = "ring"
MARK_RADIUS = 4.0  # the radius the marks in ldaca-marks.json are drawn at


def bold(path: Path, text: str) -> TTFont:
    """The few glyphs needed from a font, at weight 700."""
    font = TTFont(path)
    options = subset.Options()
    options.layout_features = []
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    if "fvar" in font:
        font = instancer.instantiateVariableFont(font, {"wght": 700})
    buffer = io.BytesIO()
    font.save(buffer)
    buffer.seek(0)
    return TTFont(buffer)


def sample(segments, steps=400):
    """Points along a stroke with their distance from its start."""
    points = []
    for p0, p1, p2, p3 in segments:
        for i in range(steps + 1):
            t = i / steps
            u = 1 - t
            points.append(
                tuple(
                    u**3 * p0[k]
                    + 3 * u * u * t * p1[k]
                    + 3 * u * t * t * p2[k]
                    + t**3 * p3[k]
                    for k in range(2)
                )
            )
    distances = [0.0]
    for a, b in itertools.pairwise(points):
        distances.append(distances[-1] + math.dist(a, b))
    return points, distances


def point_at(sampled, s):
    points, distances = sampled
    s = max(0.0, min(s, distances[-1]))
    for i in range(1, len(distances)):
        if distances[i] >= s:
            span = distances[i] - distances[i - 1]
            f = 0 if span == 0 else (s - distances[i - 1]) / span
            return (
                points[i - 1][0] + f * (points[i][0] - points[i - 1][0]),
                points[i - 1][1] + f * (points[i][1] - points[i - 1][1]),
            )
    return points[-1]


def direction_at(sampled, s):
    """The stroke's direction in radians, over a short window so a glyph
    follows the curve and not one sampling step."""
    a = point_at(sampled, s - 0.6)
    b = point_at(sampled, s + 0.6)
    return math.atan2(b[1] - a[1], b[0] - a[0])


def number(value):
    return f"{value:.2f}".rstrip("0").rstrip(".")


def word_outlines(fonts, strokes):
    outlines = []
    for stroke, start, kind, word in WORDS:
        font = fonts[kind]
        upm = font["head"].unitsPerEm
        scale = SIZE[kind] / upm
        cmap = font.getBestCmap()
        glyphs = font.getGlyphSet()
        # The line the glyphs are centred on: half the x-height for Latin and
        # Greek, the middle of the em box for Chinese and Japanese.
        middle = font["OS/2"].sxHeight / 2 + upm * 0.03 if kind == LATIN else upm * 0.38
        s = start
        for char in word:
            name = cmap[ord(char)]
            width = font["hmtx"][name][0]
            advance = SIZE[kind] if kind in BLOCK else width * scale
            x, y = point_at(strokes[stroke], s + advance / 2)
            angle = direction_at(strokes[stroke], s + advance / 2)
            if kind in DOWN:
                angle -= math.pi / 2
            elif kind == HANGUL_UPRIGHT:
                angle = 0.0
            cos, sin = math.cos(angle), math.sin(angle)
            # Glyph units (y up) to icon units (y down): centred, turned, moved.
            a, b = scale * cos, scale * sin
            c, d = scale * sin, -scale * cos
            e = x + a * (-width / 2) + c * (-middle)
            f = y + b * (-width / 2) + d * (-middle)
            pen = SVGPathPen(glyphs, ntos=number)
            glyphs[name].draw(TransformPen(pen, (a, b, c, d, e, f)))
            outlines.append(pen.getCommands())
            s += advance + GAP[kind]
        print(f"{word}: {start:.1f} to {s:.1f} on {stroke}")
    return " ".join(outlines)


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    fonts_dir = Path(sys.argv[1])
    fonts = {
        kind: bold(fonts_dir / file, "".join(w for _, _, k, w in WORDS if k == kind))
        for kind, file in FONT_FILE.items()
    }
    strokes = {"main": sample(MAIN), "branch": sample(BRANCH)}
    traced = json.loads((HERE / "ldaca-marks.json").read_text(encoding="utf-8"))

    marks = [
        f'    <path transform="translate({CORPUS_DOT[0]} {CORPUS_DOT[1]})" d="{traced[CORPUS_MARK]}"/>'
    ]
    for s, name, radius in FLOW_MARKS:
        x, y = point_at(strokes["main"], s)
        marks.append(
            f'    <path transform="translate({number(x)} {number(y)}) '
            f'scale({radius / MARK_RADIUS:.3f})" d="{traced[name]}"/>'
        )
    words = " ".join(w for _, _, _, w in WORDS)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <title>Wordflow</title>
  <!--
    Wordflow, the detailed mark for 128 px and larger (favicon.svg is the plain
    one for small sizes): a W and F in one stroke, from the corpus dot through
    the W into the F's two derived dots, as Data Blocks do in the Project Graph.
    Words ride inside the stroke ({words}).
    The ring in the corpus dot and the marks at the W's bends are traced from
    the LDaCA logo; the words and marks are in its Charcoal, #414141. The
    letters are outlines of JetBrains Mono and Noto Sans SC, TC, JP and KR
    (SIL Open Font License), so no font is needed.
    Drawn by scripts/branding/make_wordflow_logo.py; edit that, not this file.
  -->
  <defs>
    <linearGradient id="tile" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="64" y2="0">
      <stop offset="0" stop-color="#D2522F"/>
      <stop offset="1" stop-color="#8E2A16"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#tile)"/>
  <g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <path d="{MAIN_D}"/>
    <path d="{BRANCH_D}"/>
  </g>
  <g fill="#fff">
    <circle cx="8.8" cy="18.5" r="4.8"/>
    <circle cx="55.2" cy="15" r="4.8"/>
    <circle cx="54.2" cy="31" r="4.8"/>
  </g>
  <path fill="#414141" d="{word_outlines(fonts, strokes)}"/>
  <g fill="#414141" fill-rule="evenodd">
{chr(10).join(marks)}
  </g>
</svg>
"""
    OUT.write_text(svg, encoding="utf-8")
    print(f"wrote {OUT} ({len(svg) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
