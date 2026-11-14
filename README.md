# LDaCA Wordflow

Wordflow is open-source, point-and-click text analytics from the
[Language Data Commons of Australia](https://www.ldaca.edu.au/). Load your text,
then explore it with Frequency, Concordance, Trends, Topics, Quotation and
Annotation (including AI-assisted coding you check against your own). Each result
becomes a Data Block in the Project graph, so the steps of an analysis stay visible.
Tokenisers for Chinese, Japanese and Korean sit alongside English and other languages.

Landing page: <https://australian-text-analytics-platform.github.io/LDaCa_Text_Analytics_Tools/>

## Use Wordflow

Current stable release: **Wordflow 0.7.20**, released 12 November 2026
([release notes](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/tag/v0.7.20)).
Wordflow 0.8 is in development on the [`v0.8` branch](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/tree/v0.8).

| Option | Who it suits | How |
| --- | --- | --- |
| **Online** | Anyone who wants to keep their Projects and come back to them from any computer | Open <https://wordflow.ldaca.edu.au> and sign in through CILogon with your university or another account CILogon supports. Runs on the ARDC Nectar Research Cloud. |
| **ARDC BinderHub** | Australian and New Zealand researchers trying Wordflow or teaching with it | [Launch Wordflow 0.7.20 on Binder](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/main?labpath=index.ipynb). Sign in with your institution (AAF or Tuakiri); nothing to install. The session ends when you close it, so download any Project you want to keep. |
| **Desktop app** | Sensitive or large data, offline work | [Windows](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.20/ldaca-wordflow_0.7.20_windows-x86_64.msi) · [macOS (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.20/ldaca-wordflow_0.7.20_darwin-aarch64.dmg). Your data stays on your computer. The macOS app is Developer ID signed and notarized; on Windows you may see a security prompt (choose "More info", then "Run anyway"). |
| **Python** | Full control, your own computer or server | `uvx --refresh ldaca-wordflow@0.7.20` (needs [uv](https://docs.astral.sh/uv/)) |

A Project downloaded from one of these opens in any other.

The Binder launch is published from
[LDaCa_Text_Analytics_Tools](https://github.com/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools),
which installs the pinned release from PyPI.

## Release history

Each Binder link below is pinned to one release, so a link in a tutorial or a paper
always opens the same version.

| Released (Sydney time) | Version | ARDC BinderHub | Windows | macOS | Python |
| --- | --- | --- | --- | --- | --- |
| 2026-11-12 | `0.7.20` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/4d79246?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.20/ldaca-wordflow_0.7.20_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.20/ldaca-wordflow_0.7.20_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.20` |
| 2026-10-25 | `0.7.19` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/4b40d1e?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.19/ldaca-wordflow_0.7.19_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.19/ldaca-wordflow_0.7.19_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.19` |
| 2026-10-24 | `0.7.18` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/07439d7?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.18/ldaca-wordflow_0.7.18_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.18/ldaca-wordflow_0.7.18_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.18` |
| 2026-10-24 | `0.7.17` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/b3a9795?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.17/ldaca-wordflow_0.7.17_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.17/ldaca-wordflow_0.7.17_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.17` |
| 2026-10-23 | `0.7.16` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/fe67380?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.16/ldaca-wordflow_0.7.16_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.16/ldaca-wordflow_0.7.16_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.16` |
| 2026-10-21 | `0.7.15` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/c9aee0c?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.15/ldaca-wordflow_0.7.15_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.15/ldaca-wordflow_0.7.15_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.15` |
| 2026-10-14 | `0.7.14` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/1c387ba?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.14/ldaca-wordflow_0.7.14_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.14/ldaca-wordflow_0.7.14_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.14` |
| 2026-10-12 | `0.7.13` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/398d54b?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.13/ldaca-wordflow_0.7.13_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.13/ldaca-wordflow_0.7.13_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.13` |
| 2026-10-12 | `0.7.12` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/e1e8087?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.12/ldaca-wordflow_0.7.12_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.12/ldaca-wordflow_0.7.12_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.12` |
| 2026-10-08 | `0.7.11` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/6d244bb?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.11/ldaca-wordflow_0.7.11_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.11/ldaca-wordflow_0.7.11_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.11` |
| 2026-10-05 | `0.7.10` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/fd6017a?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.10/ldaca-wordflow_0.7.10_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.10/ldaca-wordflow_0.7.10_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.10` |
| 2026-09-30 | `0.7.9` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/9868f27?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.9/ldaca-wordflow_0.7.9_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.9/ldaca-wordflow_0.7.9_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.9` |
| 2026-09-28 | `0.7.8` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/e798ef4?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.8/ldaca-wordflow_0.7.8_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.8/ldaca-wordflow_0.7.8_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.8` |
| 2026-09-03 | `0.7.7` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/7364496?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.7/ldaca-wordflow_0.7.7_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.7/ldaca-wordflow_0.7.7_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.7` |
| 2026-08-28 | `0.7.6` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/20fff5f?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.6/ldaca-wordflow_0.7.6_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.6/ldaca-wordflow_0.7.6_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.6` |
| 2026-08-28 | `0.7.5` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/f3a7edd?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.5/ldaca-wordflow_0.7.5_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.5/ldaca-wordflow_0.7.5_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.5` |
| 2026-08-19 | `0.7.2` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/019a84a?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.2/ldaca-wordflow_0.7.2_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.2/ldaca-wordflow_0.7.2_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.2` |
| 2026-07-29 | `0.7.1` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/cb44413?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.1/ldaca-wordflow_0.7.1_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.1/ldaca-wordflow_0.7.1_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.1` |
| 2026-07-27 | `0.7.0` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/d603d55?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.0/ldaca-wordflow_0.7.0_windows-x86_64.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.0/ldaca-wordflow_0.7.0_darwin-aarch64.dmg) | `uvx --refresh ldaca-wordflow@0.7.0` |
| 2026-06-01 | `0.5.6` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/1efb6c2?labpath=index.ipynb) | [Full](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.6/ldaca-wordflow-bundle-x64-0.5.6.msi) / [Lite](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.6/ldaca-wordflow-slim-x64-0.5.6.msi) | [Full](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.6/ldaca-wordflow-bundle-apple-silicon-0.5.6.dmg) / [Lite](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.6/ldaca-wordflow-slim-apple-silicon-0.5.6.dmg) | `uvx --refresh ldaca-wordflow@0.5.6` |
| 2026-05-27 | `0.5.5` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/c2cb50e?labpath=index.ipynb) | [Full](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.5/ldaca-wordflow-bundle-x64-0.5.5.msi) / [Lite](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.5/ldaca-wordflow-slim-x64-0.5.5.msi) | [Full](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.5/ldaca-wordflow-bundle-apple-silicon-0.5.5.dmg) / [Lite](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.5/ldaca-wordflow-slim-apple-silicon-0.5.5.dmg) | `uvx --refresh ldaca-wordflow@0.5.5` |
| 2026-05-25 | `0.5.4` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/af696f9?labpath=index.ipynb) | [Full](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.4/ldaca-wordflow-bundle-x64-0.5.4.msi) / [Lite](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.4/ldaca-wordflow-slim-x64-0.5.4.msi) | [Full](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.4/ldaca-wordflow-bundle-apple-silicon-0.5.4.dmg) / [Lite](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.4/ldaca-wordflow-slim-apple-silicon-0.5.4.dmg) | `uvx --refresh ldaca-wordflow@0.5.4` |
| 2026-05-25 | `0.5.3` ‡ | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/ad73a87?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.3/LDaCA.Wordflow_0.5.3_x64_en-US.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.3/ldaca-desktop-apple-silicon-0.5.3.dmg) | `uvx --refresh ldaca-wordflow@0.5.3` |
| 2026-05-21 | `0.5.1` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/98c8082?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.1/LDaCA.Wordflow_0.5.1_x64_en-US.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.1/ldaca-desktop-apple-silicon-0.5.1.dmg) | `uvx --refresh ldaca-wordflow@0.5.1` |
| 2026-05-17 | `0.5.0` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/0fa075e?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.0/LDaCA.Wordflow_0.5.0_x64_en-US.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.5.0/ldaca-desktop-apple-silicon-0.5.0.dmg) | `uvx --refresh ldaca-wordflow@0.5.0` |
| 2026-05-15 | `0.4.4` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/b8d0cdc?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.4.4/LDaCA.Wordflow_0.4.4_x64_en-US.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.4.4/ldaca-desktop-apple-silicon-0.4.4.dmg) | `uvx --refresh ldaca-wordflow@0.4.4` |
| 2026-05-15 | `0.4.3` † | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/5b2f422?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.4.3/LDaCA.Wordflow_0.4.2_x64_en-US.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.4.3/ldaca-desktop-apple-silicon-0.4.2.dmg) | `uvx --refresh ldaca-wordflow@0.4.3` |
| 2026-05-15 | `0.4.2` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/107cce6?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.4.2/LDaCA.Wordflow_0.4.2_x64_en-US.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.4.2/ldaca-desktop-apple-silicon-0.4.2.dmg) | `uvx --refresh ldaca-wordflow@0.4.2` |
| 2026-05-15 | `0.4.1` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/b463efa?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.4.1/LDaCA.Text.Analytics_0.4.1_x64_en-US.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.4.1/ldaca-desktop-apple-silicon-0.4.1.dmg) | `uvx --refresh ldaca-web-app@0.4.1` |
| 2026-05-12 | `0.3.2` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/54b6daf0141f077c0de94c0213acae33cf3d397a?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.3.2/LDaCA.Text.Analytics_0.3.2_x64_en-US.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.3.2/ldaca-desktop-apple-silicon-0.3.2.dmg) | `uvx --refresh ldaca-web-app@0.3.2` |
| 2026-05-06 | `0.2.9` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/6c68cb11622ee245a2c2063947baa73939bae2c7?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.2.9/LDaCA.Text.Analytics_0.2.9_x64_en-US.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.2.9/ldaca-desktop-apple-silicon-0.2.9.dmg) | `uvx --refresh ldaca-web-app@0.2.9` |
| 2026-05-03 | `0.2.2` | [Open notebook](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/8427a10ec8607cf3087d341b871cb64d4ab64dd2?labpath=index.ipynb) | [MSI](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.2.2/LDaCA.Text.Analytics_0.2.2_x64_en-US.msi) | [DMG (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.2.2/ldaca-desktop-apple-silicon.dmg) | `uvx --refresh ldaca-web-app@0.2.2` |

Historical release rows above `v0.4.2` keep the `ldaca-web-app` install command since those versions only exist under the old PyPI name. GitHub release-asset links auto-redirect from the old `ldaca_web_app` repo slug to `ldaca-wordflow`.

† `v0.4.3` ships byte-identical code to `v0.4.4` on the `pip install` path, but a missed version source meant its desktop assets were stamped `0.4.2` (the filename, and the "About" / "Installed apps" entry on the installed binary, both read `0.4.2`). `v0.4.4` re-cuts the same code with the version string corrected across all five build inputs. Pip users of `0.4.3` see a cosmetic version mismatch only; desktop users should re-download `v0.4.4`.

‡ `v0.5.3` re-stamps `v0.5.2`. The `v0.5.2` PyPI wheel was cut from a release-branch cherry-pick that silently dropped three commits from `dev` (the workspace-rename fix and the two file-tree feature additions), so the published wheel was a near-no-op. `v0.5.2` has been yanked on PyPI and never had desktop builds released (the root tag was retracted before the desktop workflow ran). Use `v0.5.3`.

## Citation

If you use LDaCA Wordflow in your research, please cite it:

> Guo, S., Sun, C., Bednarek, M., Haan, S., Lynch, M. & Rehman, A. (2026), _LDaCA Wordflow_ [Computer software]. https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/. DOI: [10.5281/zenodo.20408328](https://doi.org/10.5281/zenodo.20408328)

The DOI above is the **concept DOI**: it always resolves to the latest version on Zenodo. Each release also has its own version-specific DOI on its Zenodo record.

## Branches

- `main`: the latest release (now 0.7.20). It changes only through a pull
  request from `v0.7` after each release.
- `v0.7`: development of the 0.7.x releases. Fix and feature branches start here.
- `v0.8`: Wordflow 0.8, in development until it is released.

## Developing Wordflow 0.7

This repository contains the LDaCA Wordflow web and desktop application plus
the shared Python and Rust packages it depends on: a FastAPI backend, a React
frontend, and a Tauri desktop shell.

### Repository Overview

- `frontend/`: React 19 + Vite frontend, shared UI, and Tauri desktop shell in `src-tauri/`
- `backend/`: FastAPI backend (PyPI: `ldaca-wordflow`, import:
  `ldaca_wordflow`) and Workspace, Analysis, and User File APIs
- `polars-text/`: Rust/PyO3 Polars plugin package for concordance, quotation, tokenization, and related text analysis
- `polars-source-utils/`: Rust/PyO3 utilities for inspecting and relocating serialized Polars plans
- `ldaca-analytics-sample-data/`: canonical sample catalogue and downloadable datasets

### Architecture Summary

#### Backend

The backend lives under `backend/src/ldaca_wordflow/` and is organized around:

- `api/`: FastAPI routers, mounted under `/api`
- `domain/workspace/`: Workspace aggregate and its Nodes, Tabs, and Analyses
- `services/`: use cases and runtime-owned state boundaries
- `analysis/`: framework-neutral analysis algorithms
- `workers/`: picklable process-worker entrypoints and implementations
- `infrastructure/`: database, storage, provider, and process adapters
- `shared/`: dependency-light errors, JSON types, names, and serialization
- `settings.py`: `pydantic-settings` configuration
- `runtime.py`: lifespan construction and shutdown ownership
- `main.py`: side-effect-free FastAPI application factory

Workspace-related APIs are composed under `api/workspaces/`; routers remain
thin and delegate to services.

#### Data Model

The workspace domain is integrated into the backend package.

- `Workspace` stores a graph of `Node` objects keyed by UUID.
- `Node.data` must always be a Polars `LazyFrame`.
- Node operations such as filtering or selection produce child Nodes and
  preserve typed provenance.
- Tabs and their Analyses are part of the Workspace snapshot.

This repository is lazy-first. Avoid eager `collect()` calls except at I/O boundaries such as artifact writing or final API serialization.

#### Background Processing

Heavy Analyses such as topic modeling run out of process:

`API router -> AnalysisService -> AnalysisScheduler -> AnalysisProcessExecutor -> worker -> Analysis-owned Artifacts`

Worker functions live under `backend/src/ldaca_wordflow/workers/` and are
decorated with the canonical `@process_entrypoint` boundary. User File Imports
have a separate resource-specific lifecycle and scheduler; both resource types
publish progress through the shared event stream.

#### Frontend Commands

The frontend uses:

- React 19
- Vite
- TanStack Query
- TanStack Router
- TanStack Table
- Zustand
- Shadcn/Radix with Tailwind CSS v4

Feature code is organized under `frontend/src/features/`. TanStack Query owns
server state and Zustand owns transient client state.

#### Desktop Shell

The desktop app uses Tauri v2. The Rust shell launches the packaged backend as
a child process, exposes its random-port URL to the webview, and provides the
native directory picker. The Python backend owns Data Root configuration and
Runtime switching.

### Development Setup

#### Prerequisites

- Python `>=3.14`
- `uv`
- Node.js and pnpm
- Rust and Cargo when working on `polars-text` or Tauri packaging

#### Install Dependencies

From the repo root:

```sh
uv sync
pnpm install
```

Do not set `PYTHONPATH` manually for normal development. `uv` handles editable installs and resolution.

### Common Commands

#### Web Development

```sh
pnpm dev
```

This starts the FastAPI backend with reload enabled and the Vite frontend in one
supervised terminal. To run either process independently:

```sh
pnpm dev:backend
pnpm dev:frontend
```

#### Frontend Commands

```sh
pnpm -C frontend build
pnpm -C frontend test -- --run
```

#### Backend Checks

```sh
cd backend
uv run ruff check .
uv run ty check
uv run pytest -q
```

#### Supporting Packages

```sh
cd polars-text && uv run pytest -q
cd polars-text && uvx ty check
```

### Testing And Verification

Run checks from the affected package directory, not from the repo root, unless the command explicitly targets a package with `pnpm -C`.

For backend changes, the expected verification is:

```sh
cd backend
uv run ruff check .
uv run ty check
uv run pytest -q
```

Use the nearest package `AGENTS.md` for supporting-package gates.

For typical frontend changes, use:

```sh
pnpm -C frontend build
pnpm -C frontend test -- --run
```

### Key Conventions

- All backend routes are mounted under `/api`.
- Use the established session or current-user security dependency in protected
  backend routers; do not bypass authentication checks.
- Keep FastAPI routers thin and move application behavior into the owning
  service, domain, or analysis layer.
- Decorate process-worker entrypoints with `@process_entrypoint`, and import
  heavy computation dependencies inside the worker function.
- Do not hardcode `localhost` in frontend API code; use the backend URL
  detection utilities in `frontend/src/lib/backend/env.ts`.
- Do not add manual React memoization by default. This repo uses React Compiler.

### Documentation

- Engineering documentation: [`docs/index.md`](docs/index.md)
- Domain glossary: [`CONTEXT.md`](CONTEXT.md)
- Change-spec lifecycle: [`specs/README.md`](specs/README.md)
- Frontend user and UI documentation: [`frontend/docs/index.md`](frontend/docs/index.md)
- Agent workflow and repository guidance: [`AGENTS.md`](AGENTS.md)
