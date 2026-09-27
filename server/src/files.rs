use crate::Result;
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use wordflow_backend::Error;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Library {
    Data,
    Projects,
}
impl Library {
    pub fn directory(self) -> &'static str {
        match self {
            Self::Data => "data",
            Self::Projects => "projects",
        }
    }
}
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct LibraryFile {
    pub name: String,
    pub size: u64,
    pub modified: Option<u64>,
}
#[derive(Clone)]
pub struct Files {
    root: PathBuf,
}
impl Files {
    pub fn new(root: &Path) -> Result<Self> {
        std::fs::create_dir_all(root)?;
        let root = std::fs::canonicalize(root)?;
        for name in ["data", "projects"] {
            let path = root.join(name);
            std::fs::create_dir_all(&path)?;
            if std::fs::symlink_metadata(&path)?.file_type().is_symlink() {
                return Err(Error::invalid(
                    "Library directories must not be symbolic links",
                ));
            }
        }
        Ok(Self { root })
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn directory(&self, library: Library) -> PathBuf {
        self.root.join(library.directory())
    }
    pub fn path(&self, library: Library, name: &str) -> Result<PathBuf> {
        validate_name(name)?;
        if matches!(library, Library::Projects) && !name.to_ascii_lowercase().ends_with(".wfpj") {
            return Err(Error::invalid("Projects must have a .wfpj extension"));
        }
        let dir = self.directory(library);
        if std::fs::symlink_metadata(&dir)?.file_type().is_symlink() {
            return Err(Error::invalid("Library directory is a symbolic link"));
        }
        let path = dir.join(name);
        match std::fs::symlink_metadata(&path) {
            Ok(meta) if !meta.is_file() || meta.file_type().is_symlink() => {
                return Err(Error::invalid("Choose an ordinary library file"));
            }
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.into()),
            _ => {}
        }
        Ok(path)
    }
    pub fn list(&self, library: Library) -> Result<Vec<LibraryFile>> {
        let mut files = Vec::new();
        for entry in std::fs::read_dir(self.directory(library))? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if name.starts_with('.') || self.path(library, &name).is_err() {
                continue;
            }
            let meta = entry.metadata()?;
            files.push(LibraryFile {
                name,
                size: meta.len(),
                modified: meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|t| t.as_secs()),
            });
        }
        files.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(files)
    }
    pub fn publish(
        &self,
        library: Library,
        name: &str,
        staged: tempfile::NamedTempFile,
    ) -> Result<LibraryFile> {
        self.path(library, name)?;
        let original = Path::new(name);
        let stem = original
            .file_stem()
            .and_then(|v| v.to_str())
            .unwrap_or(name);
        let extension = original
            .extension()
            .and_then(|v| v.to_str())
            .map(|s| format!(".{s}"))
            .unwrap_or_default();
        let mut number = 1_u64;
        loop {
            let candidate = if number == 1 {
                name.to_owned()
            } else {
                format!("{stem}_{number}{extension}")
            };
            let path = self.path(library, &candidate)?;
            match std::fs::hard_link(staged.path(), &path) {
                Ok(()) => {
                    let meta = std::fs::metadata(path)?;
                    return Ok(LibraryFile {
                        name: candidate,
                        size: meta.len(),
                        modified: meta
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                            .map(|t| t.as_secs()),
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => number += 1,
                Err(e) => return Err(e.into()),
            }
        }
    }
}
fn validate_name(name: &str) -> Result<()> {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    if name.is_empty()
        || name.starts_with('.')
        || name.ends_with(['.', ' '])
        || name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
        || name.chars().any(char::is_control)
        || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
    {
        return Err(Error::invalid(
            "Choose a filename without directory components or reserved characters",
        ));
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn libraries_reject_traversal_and_preserve_duplicate_uploads() {
        let dir = tempfile::tempdir().unwrap();
        let files = Files::new(dir.path()).unwrap();
        for name in ["../secret", "a/b", "C:\\data", "NUL", ".hidden", "x\n"] {
            assert!(files.path(Library::Data, name).is_err());
        }
        let one = tempfile::NamedTempFile::new_in(files.directory(Library::Data)).unwrap();
        std::fs::write(one.path(), "first").unwrap();
        assert_eq!(
            files
                .publish(Library::Data, "文本 file.csv", one)
                .unwrap()
                .name,
            "文本 file.csv"
        );
        let two = tempfile::NamedTempFile::new_in(files.directory(Library::Data)).unwrap();
        assert_eq!(
            files
                .publish(Library::Data, "文本 file.csv", two)
                .unwrap()
                .name,
            "文本 file_2.csv"
        );
        assert_eq!(
            std::fs::read_to_string(files.path(Library::Data, "文本 file.csv").unwrap()).unwrap(),
            "first"
        );
    }
    #[cfg(unix)]
    #[test]
    fn library_symlinks_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::NamedTempFile::new().unwrap();
        let files = Files::new(dir.path()).unwrap();
        std::os::unix::fs::symlink(
            outside.path(),
            files.directory(Library::Data).join("escape.csv"),
        )
        .unwrap();
        assert!(files.path(Library::Data, "escape.csv").is_err());
        assert!(files.list(Library::Data).unwrap().is_empty());
    }
}
