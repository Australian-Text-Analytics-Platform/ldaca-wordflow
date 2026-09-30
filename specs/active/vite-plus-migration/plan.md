# Implementation plan

1. Establish full clean-checkout frontend results and run the pinned migrator
   against the original installed lockfile.
2. Align the catalog, imports, configuration, generator and scripts; keep root
   tooling independent of frontend runtime hooks.
3. Update CI, onboarding and native runbooks, and switch the managed shell to vp.
4. Compare discovery and results, verify a frozen installation and exercise
   browser HMR, browser/server E2E, Tauri, native E2E and Quick Look.
5. Validate uninstrumented macOS packaging and the Windows packaging lane,
   review the diff and integrate deliberately.
