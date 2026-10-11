//! Host-owned directories and application preferences, independent of Tauri and analysis.
#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]

use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use utoipa::ToSchema;
pub mod http;

pub const PRODUCTION_ID: &str = "au.edu.ldaca.wordflow";
pub const DEV_ID: &str = "au.edu.ldaca.wordflow.dev";
pub const TEST_ID: &str = "au.edu.ldaca.wordflow.test";

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Invalid(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}
pub type Result<T> = std::result::Result<T, Error>;

/// Paths are values supplied by the host; resolving them never creates directories.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppDirectories {
    pub config: PathBuf,
    pub data: PathBuf,
    pub local_data: PathBuf,
    pub cache: PathBuf,
    pub logs: PathBuf,
    pub temporary: PathBuf,
}
impl AppDirectories {
    /// Matches Tauri's desktop resolver, including the application-scoped temp directory.
    pub fn native(identity: &str) -> Result<Self> {
        if !matches!(identity, PRODUCTION_ID | DEV_ID | TEST_ID)
            && ![PRODUCTION_ID, DEV_ID, TEST_ID]
                .iter()
                .any(|id| identity == format!("{id}.web") || identity == format!("{id}.server"))
        {
            return Err(Error::Invalid(
                "Unknown Wordflow application identity".into(),
            ));
        }
        let resolve = |base: Option<PathBuf>| {
            base.map(|p| p.join(identity))
                .ok_or_else(|| Error::Invalid("Cannot locate system application storage".into()))
        };
        #[cfg(target_os = "macos")]
        let logs = resolve(dirs::home_dir().map(|p| p.join("Library/Logs")))?;
        #[cfg(not(target_os = "macos"))]
        let logs = resolve(dirs::data_local_dir())?.join("logs");
        let paths = Self {
            config: resolve(dirs::config_dir())?,
            data: resolve(dirs::data_dir())?,
            local_data: resolve(dirs::data_local_dir())?,
            cache: resolve(dirs::cache_dir())?,
            logs,
            temporary: std::env::temp_dir().join(identity),
        };
        paths.validate()?;
        Ok(paths)
    }
    /// Maps all application-owned directory categories into an already selected user root.
    pub fn browser(root: &Path) -> Result<Self> {
        let paths = Self {
            config: root.join("config"),
            data: root.join("state"),
            local_data: root.join("local"),
            cache: root.join("cache"),
            logs: root.join("logs"),
            temporary: root.join("tmp"),
        };
        paths.validate()?;
        Ok(paths)
    }
    pub fn all(&self) -> [&Path; 6] {
        [
            &self.config,
            &self.data,
            &self.local_data,
            &self.cache,
            &self.logs,
            &self.temporary,
        ]
    }
    pub fn validate(&self) -> Result<()> {
        if self.all().iter().any(|p| !p.is_absolute()) {
            return Err(Error::Invalid(
                "Application directories must be absolute".into(),
            ));
        }
        Ok(())
    }
    pub fn create(&self) -> Result<()> {
        self.validate()?;
        for path in self.all() {
            private_directory(path)?;
        }
        Ok(())
    }
}

/// Application-managed directories must not redirect into another identity's storage.
pub fn private_directory(path: &Path) -> Result<()> {
    if let Ok(metadata) = fs::symlink_metadata(path)
        && (metadata.file_type().is_symlink() || !metadata.is_dir())
    {
        return Err(Error::Invalid(
            "Application storage must be a directory, not a symlink".into(),
        ));
    }
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LayoutPreferences {
    pub sidebar_width: f64,
    pub aside_panel_ratio: f64,
    pub project_graph_ratio: f64,
}
impl Default for LayoutPreferences {
    fn default() -> Self {
        Self {
            sidebar_width: 208.0,
            aside_panel_ratio: 0.3,
            project_graph_ratio: 0.5,
        }
    }
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
pub enum Theme {
    #[serde(rename = "light-2026")]
    Light,
    #[serde(rename = "dark-2026")]
    Dark,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub schema_version: u32,
    pub theme: Theme,
    pub layout: LayoutPreferences,
    pub recent_data_files: Vec<String>,
    #[serde(default)]
    pub hidden_tools: Vec<String>,
    #[serde(default)]
    pub guidance: GuidancePreferences,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GuidancePreferences {
    pub enabled: bool,
    pub acknowledgments: BTreeMap<String, u32>,
}
impl Default for GuidancePreferences {
    fn default() -> Self {
        Self {
            enabled: true,
            acknowledgments: BTreeMap::new(),
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct HintAcknowledgment {
    pub id: String,
    pub version: u32,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GuidancePatch {
    pub enabled: Option<bool>,
    pub acknowledge: Option<HintAcknowledgment>,
    pub reset_acknowledgments: Option<bool>,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            schema_version: 2,
            theme: Theme::Light,
            layout: LayoutPreferences::default(),
            recent_data_files: Vec::new(),
            hidden_tools: Vec::new(),
            guidance: GuidancePreferences::default(),
        }
    }
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LayoutPatch {
    pub sidebar_width: Option<f64>,
    pub aside_panel_ratio: Option<f64>,
    pub project_graph_ratio: Option<f64>,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreferencesPatch {
    pub theme: Option<Theme>,
    pub layout: Option<LayoutPatch>,
    pub recent_data_files: Option<Vec<String>>,
    pub hidden_tools: Option<Vec<String>>,
    pub guidance: Option<GuidancePatch>,
}
impl Preferences {
    pub fn validate(&self) -> Result<()> {
        if ![1, 2].contains(&self.schema_version) {
            return Err(Error::Invalid("Unsupported preferences schema".into()));
        }
        const TOOLS: &[&str] = &[
            "filter",
            "token-frequency",
            "concordance",
            "plots",
            "topic-modeling",
            "quotation",
            "annotation",
            "export",
        ];
        if self
            .hidden_tools
            .iter()
            .any(|id| !TOOLS.contains(&id.as_str()))
        {
            return Err(Error::Invalid("Invalid hidden tool".into()));
        }
        if self.guidance.acknowledgments.len() > 1000
            || self.guidance.acknowledgments.iter().any(|(id, version)| {
                id.is_empty()
                    || id.len() > 100
                    || !id
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
                    || *version == 0
            })
        {
            return Err(Error::Invalid("Invalid guidance acknowledgment".into()));
        }
        for (name, value, low, high) in [
            ("sidebarWidth", self.layout.sidebar_width, 160.0, 400.0),
            ("asidePanelRatio", self.layout.aside_panel_ratio, 0.15, 0.8),
            (
                "projectGraphRatio",
                self.layout.project_graph_ratio,
                0.2,
                0.8,
            ),
        ] {
            if !value.is_finite() || !(low..=high).contains(&value) {
                return Err(Error::Invalid(format!("Invalid {name}")));
            }
        }
        if self.recent_data_files.len() > 10
            || self
                .recent_data_files
                .iter()
                .any(|p| p.is_empty() || p.contains('\0'))
        {
            return Err(Error::Invalid("Invalid recent import history".into()));
        }
        Ok(())
    }
    pub fn patched(&self, patch: PreferencesPatch) -> Result<Self> {
        let mut next = self.clone();
        next.schema_version = 2;
        if let Some(theme) = patch.theme {
            next.theme = theme;
        }
        if let Some(layout) = patch.layout {
            if let Some(v) = layout.sidebar_width {
                next.layout.sidebar_width = v;
            }
            if let Some(v) = layout.aside_panel_ratio {
                next.layout.aside_panel_ratio = v;
            }
            if let Some(v) = layout.project_graph_ratio {
                next.layout.project_graph_ratio = v;
            }
        }
        if let Some(files) = patch.recent_data_files {
            next.recent_data_files = files;
        }
        if let Some(tools) = patch.hidden_tools {
            next.hidden_tools = tools;
            next.hidden_tools.sort();
            next.hidden_tools.dedup();
        }
        if let Some(guidance) = patch.guidance {
            if let Some(enabled) = guidance.enabled {
                next.guidance.enabled = enabled;
            }
            if guidance.reset_acknowledgments == Some(true) {
                next.guidance.acknowledgments.clear();
            }
            if let Some(ack) = guidance.acknowledge {
                let version = next.guidance.acknowledgments.entry(ack.id).or_default();
                *version = (*version).max(ack.version);
            }
        }
        next.validate()?;
        Ok(next)
    }
}

/// A single writer per host. Invalid existing files are never overwritten by patching.
pub struct PreferencesFile {
    path: PathBuf,
    writer: Mutex<()>,
}
impl PreferencesFile {
    pub fn new(config: &Path) -> Self {
        Self {
            path: config.join("preferences.json"),
            writer: Mutex::new(()),
        }
    }
    pub fn read(&self) -> Result<Preferences> {
        read_preferences(&self.path)
    }
    pub fn patch(&self, patch: PreferencesPatch) -> Result<Preferences> {
        let _guard = self
            .writer
            .lock()
            .map_err(|_| Error::Invalid("Preferences writer failed".into()))?;
        let next = self.read()?.patched(patch)?;
        write_json(&self.path, &next)?;
        Ok(next)
    }
    pub fn reset(&self) -> Result<Preferences> {
        let _guard = self
            .writer
            .lock()
            .map_err(|_| Error::Invalid("Preferences writer failed".into()))?;
        let next = Preferences::default();
        write_json(&self.path, &next)?;
        Ok(next)
    }
}
pub fn read_preferences(path: &Path) -> Result<Preferences> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Preferences::default()),
        Err(e) => return Err(e.into()),
    };
    let prefs: Preferences = serde_json::from_slice(&bytes)?;
    prefs.validate()?;
    Ok(prefs)
}
pub fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| Error::Invalid("Missing storage parent".into()))?;
    private_directory(parent)?;
    let mut staged = tempfile::NamedTempFile::new_in(parent)?;
    staged.write_all(&serde_json::to_vec_pretty(value)?)?;
    staged.as_file().sync_all()?;
    staged.persist(path).map_err(|e| e.error)?;
    #[cfg(unix)]
    fs::File::open(parent)?.sync_all()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn version_one_upgrades_only_after_a_successful_patch() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("preferences.json");
        let old = r#"{"schemaVersion":1,"theme":"dark-2026","layout":{"sidebarWidth":250,"asidePanelRatio":0.3,"projectGraphRatio":0.5},"recentDataFiles":["/tmp/sample"]}"#;
        fs::write(&path, old).unwrap();
        let store = PreferencesFile::new(dir.path());
        assert!(store.read().unwrap().guidance.enabled);
        assert_eq!(fs::read_to_string(&path).unwrap(), old);
        let updated = store
            .patch(PreferencesPatch {
                hidden_tools: Some(vec!["export".into()]),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(updated.schema_version, 2);
        assert_eq!(updated.theme, Theme::Dark);
        assert_eq!(updated.recent_data_files, ["/tmp/sample"]);
        assert!(
            store
                .patch(PreferencesPatch {
                    hidden_tools: Some(vec!["data-loader".into()]),
                    ..Default::default()
                })
                .is_err()
        );
        assert_eq!(store.read().unwrap(), updated);
    }
    #[test]
    fn guidance_merges_versions_and_reset_preserves_enabled_and_other_fields() {
        let dir = tempfile::tempdir().unwrap();
        let store = PreferencesFile::new(dir.path());
        for version in [3, 1, 2] {
            store
                .patch(PreferencesPatch {
                    guidance: Some(GuidancePatch {
                        enabled: Some(false),
                        acknowledge: Some(HintAcknowledgment {
                            id: "annotation.setup".into(),
                            version,
                        }),
                        ..Default::default()
                    }),
                    ..Default::default()
                })
                .unwrap();
        }
        assert_eq!(
            store.read().unwrap().guidance.acknowledgments["annotation.setup"],
            3
        );
        let reset = store
            .patch(PreferencesPatch {
                guidance: Some(GuidancePatch {
                    reset_acknowledgments: Some(true),
                    ..Default::default()
                }),
                ..Default::default()
            })
            .unwrap();
        assert!(!reset.guidance.enabled);
        assert!(reset.guidance.acknowledgments.is_empty());
    }
    #[test]
    fn browser_maps_every_category_into_its_user_root() {
        let dir = tempfile::tempdir().unwrap();
        let a = AppDirectories::browser(&dir.path().join("alice")).unwrap();
        let b = AppDirectories::browser(&dir.path().join("bob")).unwrap();
        assert!(
            a.all()
                .iter()
                .all(|p| p.starts_with(dir.path().join("alice")))
        );
        assert!(a.all().iter().all(|p| !b.all().contains(p)));
    }
    #[test]
    fn independent_patches_preserve_other_fields_across_restarts() {
        let dir = tempfile::tempdir().unwrap();
        let store = PreferencesFile::new(dir.path());
        store
            .patch(PreferencesPatch {
                theme: Some(Theme::Dark),
                ..Default::default()
            })
            .unwrap();
        store
            .patch(PreferencesPatch {
                layout: Some(LayoutPatch {
                    sidebar_width: Some(300.0),
                    ..Default::default()
                }),
                ..Default::default()
            })
            .unwrap();
        let loaded = PreferencesFile::new(dir.path()).read().unwrap();
        assert_eq!(
            (loaded.theme, loaded.layout.sidebar_width),
            (Theme::Dark, 300.0)
        );
    }
    #[test]
    fn invalid_or_future_files_require_explicit_reset() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("preferences.json");
        fs::write(&path, b"broken").unwrap();
        let store = PreferencesFile::new(dir.path());
        assert!(store.patch(PreferencesPatch::default()).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"broken");
        assert_eq!(store.reset().unwrap(), Preferences::default());
    }
    #[test]
    fn invalid_layout_is_rejected_without_changing_disk() {
        let dir = tempfile::tempdir().unwrap();
        let store = PreferencesFile::new(dir.path());
        assert!(
            store
                .patch(PreferencesPatch {
                    layout: Some(LayoutPatch {
                        aside_panel_ratio: Some(3.0),
                        ..Default::default()
                    }),
                    ..Default::default()
                })
                .is_err()
        );
        assert!(!dir.path().join("preferences.json").exists());
    }
}
