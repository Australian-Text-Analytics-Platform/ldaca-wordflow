# LDaCA Wordflow

Wordflow is open-source, point-and-click text analytics from the
[Language Data Commons of Australia](https://www.ldaca.edu.au/). Load your text,
then explore it with Frequency, Concordance, Trends, Topics, Quotation and
Annotation (including AI-assisted coding you check against your own). Each result
becomes a Data Block in the Project graph, so the steps of an analysis stay visible.
Tokenisers for Chinese, Japanese and Korean sit alongside English and other languages.

Landing page: <https://australian-text-analytics-platform.github.io/LDaCa_Text_Analytics_Tools/>

## Use Wordflow

Current stable release: **Wordflow 0.7.14**, released 14 October 2026
([release notes](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/tag/v0.7.14)).
Wordflow 0.8 is in beta (see [Wordflow 0.8 development](#wordflow-08-development-beta) below).

| Way in | Who it suits | How |
| --- | --- | --- |
| **Online** | Anyone who wants to keep their Projects and come back to them from any computer | Open <https://wordflow.ldaca.edu.au> and sign in through CILogon with your university or another account CILogon supports. Runs on the ARDC Nectar Research Cloud. |
| **ARDC BinderHub** | Australian and New Zealand researchers trying Wordflow or teaching with it | [Launch Wordflow 0.7.14 on Binder](https://binderhub.rc.nectar.org.au/v2/gh/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools/main?labpath=index.ipynb). Sign in with your institution (AAF or Tuakiri); nothing to install. The session ends when you close it, so download any Project you want to keep. |
| **Desktop app** | Sensitive or large data, offline work | [Windows](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.14/ldaca-wordflow_0.7.14_windows-x86_64.msi) · [macOS (Apple Silicon)](https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/download/v0.7.14/ldaca-wordflow_0.7.14_darwin-aarch64.dmg). Your data stays on your computer. The macOS app is Developer ID signed and notarized; on Windows you may see a security prompt (choose "More info", then "Run anyway"). |
| **Python** | Full control, your own computer or server | `uvx --refresh ldaca-wordflow@0.7.14` (needs [uv](https://docs.astral.sh/uv/)) |

A Project downloaded from one of these opens in any other.

The Binder launch is published from
[LDaCa_Text_Analytics_Tools](https://github.com/Australian-Text-Analytics-Platform/LDaCa_Text_Analytics_Tools),
which installs the pinned release from PyPI.

## Release history

Each Binder link below is pinned to one release, so a link in a tutorial or a paper
always opens the same version.

| Released (Sydney time) | Version | ARDC BinderHub | Windows | macOS | Python |
| --- | --- | --- | --- | --- | --- |
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

## Wordflow 0.8 development (beta)

Wordflow is a text-analysis application built with Rust, DuckDB, React and Tauri.
Each desktop project window owns an embedded Axum backend and a `.wfpj` DuckDB
file.

### Packages

- `backend/`: native project lifecycle, SQL, graph metadata and imports.
- `ldaca-rs/`: reusable text algorithms, model inference and ONI/RO-Crate data access.
- `frontend/`: React interface and Tauri desktop host.
- [polars-text](https://github.com/Australian-Text-Analytics-Platform/polars-text): independent Polars/Python adapter over `ldaca-rs`.
- `ldaca-analytics-sample-data/`: remote sample data.
- `ldaca-wordflow-docs/`: published user-documentation mirror.
- [archive/](archive/README.md): retired Python backend and associated infrastructure,
  preserved for reference rather than execution.

### Development

Install [Vite+ 1.0.0](https://viteplus.dev/guide/env) with Node and package-manager
management enabled. The repository pins Node 24.21.0 and pnpm 12.8.1; see the
[setup procedure](docs/runbooks/development.md#toolchain-setup).

```sh
vp install --frozen-lockfile
vp run dev                 # Rust backend and browser preview
vp run dev:desktop         # Tauri desktop application
vp run build:desktop:mac   # Regular macOS application bundle
```

Rust/Cargo is required. The active application does not need a Python environment
or a Data Root. The browser preview uses the native project interface; the old
FastAPI server workflow is archived. The optional `polars-text` adapter is
developed in its own repository and resolves `ldaca-rs` from a locked Git dependency.

See the [engineering index](docs/index.md),
[development instructions](docs/runbooks/development.md), and
[desktop runtime instructions](docs/runbooks/desktop-runtime.md).
