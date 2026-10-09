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
    pub is_directory: bool,
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
        if is_link(&std::fs::symlink_metadata(self.directory(library))?) {
            return Err(Error::invalid("Library directory is a link"));
        }
        if name.is_empty() && matches!(library, Library::Data) {
            return Ok(self.directory(library));
        }
        if matches!(library, Library::Projects) {
            validate_name(name)?;
            if !name.to_ascii_lowercase().ends_with(".wfpj") {
                return Err(Error::invalid("Projects must have a .wfpj extension"));
            }
        } else {
            for component in name.split('/') {
                validate_name(component)?;
            }
        }
        let mut path = self.directory(library);
        let parts = name.split('/').collect::<Vec<_>>();
        for (index, part) in parts.iter().enumerate() {
            path.push(part);
            match std::fs::symlink_metadata(&path) {
                Ok(meta) if is_link(&meta) || (!meta.is_file() && !meta.is_dir()) => {
                    return Err(Error::invalid("Choose an ordinary library file or folder"));
                }
                Ok(meta) if index + 1 < parts.len() && !meta.is_dir() => {
                    return Err(Error::invalid("The parent must be a folder"));
                }
                Ok(meta) if matches!(library, Library::Projects) && !meta.is_file() => {
                    return Err(Error::invalid("Choose an ordinary project file"));
                }
                Err(error)
                    if error.kind() == std::io::ErrorKind::NotFound && index + 1 == parts.len() => {
                }
                Err(error) => return Err(error.into()),
                _ => {}
            }
        }
        Ok(path)
    }
    fn metadata(&self, library: Library, name: String) -> Result<LibraryFile> {
        let meta = std::fs::metadata(self.path(library, &name)?)?;
        Ok(LibraryFile {
            name,
            size: if meta.is_dir() { 0 } else { meta.len() },
            is_directory: meta.is_dir(),
            modified: meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|t| t.as_secs()),
        })
    }
    pub fn list(&self, library: Library) -> Result<Vec<LibraryFile>> {
        self.path(
            library,
            if matches!(library, Library::Data) {
                ""
            } else {
                "validation.wfpj"
            },
        )?;
        let mut files = Vec::new();
        self.list_folder(library, "", &mut files)?;
        files.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(files)
    }
    fn list_folder(
        &self,
        library: Library,
        parent: &str,
        files: &mut Vec<LibraryFile>,
    ) -> Result<()> {
        for entry in std::fs::read_dir(self.directory(library).join(parent))? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if name.starts_with('.') || name == "__MACOSX" {
                continue;
            }
            let name = if parent.is_empty() {
                name
            } else {
                format!("{parent}/{name}")
            };
            let Ok(path) = self.path(library, &name) else {
                continue;
            };
            let meta = std::fs::symlink_metadata(path)?;
            if is_link(&meta) {
                continue;
            }
            if files.len() >= 100_000 {
                return Err(Error::invalid(
                    "File traversal is limited to 100,000 entries",
                ));
            }
            let file = self.metadata(library, name.clone())?;
            let directory = file.is_directory;
            files.push(file);
            if directory {
                self.list_folder(library, &name, files)?;
            }
        }
        Ok(())
    }
    pub fn folder(&self, name: &str) -> Result<LibraryFile> {
        if name.is_empty() {
            return Err(Error::invalid("Enter a folder name"));
        }
        std::fs::create_dir(self.path(Library::Data, name)?)?;
        self.metadata(Library::Data, name.into())
    }
    pub fn selections(&self, library: Library, names: &[String]) -> Result<Vec<(String, PathBuf)>> {
        if names.is_empty() {
            return Err(Error::invalid("Choose at least one file or folder"));
        }
        let mut chosen = Vec::new();
        for name in names {
            if name.is_empty() {
                return Err(Error::invalid("The library root cannot be changed"));
            }
            let path = self.path(library, name)?;
            std::fs::metadata(&path)?;
            chosen.push((name.clone(), path));
        }
        chosen.sort_by(|a, b| a.0.cmp(&b.0));
        chosen.dedup_by(|a, b| a.0 == b.0);
        let parents = chosen
            .iter()
            .filter(|(_, p)| p.is_dir())
            .map(|(_, p)| p.clone())
            .collect::<Vec<_>>();
        chosen.retain(|(_, path)| {
            !parents
                .iter()
                .any(|parent| path != parent && path.starts_with(parent))
        });
        Ok(chosen)
    }
    pub fn move_files(&self, names: &[String], destination: &str) -> Result<()> {
        let selected = self.selections(Library::Data, names)?;
        let folder = self.path(Library::Data, destination)?;
        if !folder.is_dir() {
            return Err(Error::invalid("Choose an existing destination folder"));
        }
        let mut targets = std::collections::BTreeSet::new();
        let mut moves = Vec::new();
        for (_, source) in selected {
            if folder.starts_with(&source) {
                return Err(Error::invalid("A folder cannot be moved inside itself"));
            }
            let target = folder.join(
                source
                    .file_name()
                    .ok_or_else(|| Error::invalid("Choose a file or folder"))?,
            );
            if target == source {
                continue;
            }
            if target.exists() || !targets.insert(target.clone()) {
                return Err(Error::new(
                    "file_exists",
                    "The destination contains a file or folder with the same name",
                ));
            }
            moves.push((source, target));
        }
        let mut completed: Vec<(PathBuf, PathBuf)> = Vec::new();
        for (source, target) in moves {
            if let Err(error) = std::fs::rename(&source, &target) {
                for (source, target) in completed.into_iter().rev() {
                    std::fs::rename(target, source)?;
                }
                return Err(error.into());
            }
            completed.push((source, target));
        }
        Ok(())
    }
    pub fn delete_files(&self, library: Library, names: &[String]) -> Result<()> {
        let selected = self.selections(library, names)?;
        let trash = tempfile::Builder::new()
            .prefix(".wordflow-delete-")
            .tempdir_in(self.directory(library))?;
        let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
        for (index, (_, source)) in selected.into_iter().enumerate() {
            let target = trash.path().join(index.to_string());
            if let Err(error) = std::fs::rename(&source, &target) {
                for (source, target) in moved.into_iter().rev() {
                    std::fs::rename(target, source)?;
                }
                return Err(error.into());
            }
            moved.push((source, target));
        }
        trash.close()?;
        Ok(())
    }
    pub fn zip(&self, names: &[String]) -> Result<tempfile::NamedTempFile> {
        let selected = self.selections(Library::Data, names)?;
        let all = self.list(Library::Data)?;
        let mut output = tempfile::NamedTempFile::new_in(self.directory(Library::Data))?;
        {
            let mut zip = zip::ZipWriter::new(output.as_file_mut());
            for file in all {
                let path = self.path(Library::Data, &file.name)?;
                if !selected.iter().any(|(_, p)| path.starts_with(p)) {
                    continue;
                }
                if file.is_directory {
                    zip.add_directory(
                        format!("{}/", file.name),
                        zip::write::SimpleFileOptions::default(),
                    )
                    .map_err(|e| Error::invalid(e.to_string()))?;
                } else {
                    zip.start_file(file.name, zip::write::SimpleFileOptions::default())
                        .map_err(|e| Error::invalid(e.to_string()))?;
                    std::io::copy(&mut std::fs::File::open(path)?, &mut zip)?;
                }
            }
            zip.finish().map_err(|e| Error::invalid(e.to_string()))?;
        }
        Ok(output)
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
                original
                    .parent()
                    .unwrap_or(Path::new(""))
                    .join(format!("{stem}_{number}{extension}"))
                    .to_string_lossy()
                    .into_owned()
            };
            let path = self.path(library, &candidate)?;
            match std::fs::hard_link(staged.path(), &path) {
                Ok(()) => {
                    let meta = std::fs::metadata(path)?;
                    return Ok(LibraryFile {
                        name: candidate,
                        size: meta.len(),
                        is_directory: false,
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
fn is_link(metadata: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_type().is_symlink() || metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
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

#[derive(Default)]
pub(crate) struct Mutations {
    pub uploads: std::collections::BTreeMap<uuid::Uuid, PathBuf>,
}
impl Mutations {
    pub fn preflight(&self, files: &Files, names: &[String]) -> Result<()> {
        let paths = files
            .selections(Library::Data, names)?
            .into_iter()
            .map(|(_, p)| std::fs::canonicalize(p).map_err(Error::from))
            .collect::<Result<Vec<_>>>()?;
        if paths
            .iter()
            .any(|path| self.uploads.values().any(|folder| folder.starts_with(path)))
        {
            return Err(Error::new(
                "upload_active",
                "An upload is using a selected folder. Wait for completion or cancellation cleanup.",
            ));
        }
        Ok(())
    }
}
