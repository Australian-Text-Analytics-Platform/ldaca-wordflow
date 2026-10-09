//! One file/folder/ZIP plan, followed by one atomic project import.
use super::*;
use calamine::Reader;
use std::{collections::BTreeSet, fs::File, io::Read, path::Component};
mod readers;
#[cfg(test)]
mod tests;

const MAX_FILES: usize = 100_000;
pub(crate) const TEXT_EXTENSIONS: &[&str] = &["txt", "text", "md", "rst", "log"];

#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FileImportSelection {
    pub path: String,
    pub sheet: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FileImportRequest {
    #[schema(value_type = Vec<String>)]
    pub paths: Vec<PathBuf>,
    /// Relative paths in the inspection are anchored here for a server library.
    #[schema(value_type = Option<String>)]
    pub root: Option<PathBuf>,
    pub selected: Option<Vec<FileImportSelection>>,
}
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub struct ImportFile {
    pub path: String,
    pub format: String,
    pub sheets: Vec<String>,
}
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub struct SkippedImportFile {
    pub path: String,
    pub reason: String,
}
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub struct FileImportPlan {
    pub files: Vec<ImportFile>,
    pub text_name: String,
    pub collection: bool,
    pub skipped: Vec<SkippedImportFile>,
}
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct FileImportResult {
    pub table_names: Vec<String>,
    pub skipped: Vec<SkippedImportFile>,
}
pub(super) struct PreparedSource {
    pub name: String,
    pub statement: SqlStatement,
    pub arrow_schema: Option<duckdb::arrow::datatypes::SchemaRef>,
}
struct InputFile {
    path: PathBuf,
    relative: String,
    format: String,
    sheets: Vec<String>,
}
pub(super) struct Plan {
    temporary: tempfile::TempDir,
    files: Vec<InputFile>,
    pub inspection: FileImportPlan,
}
fn import_error(error: impl std::fmt::Display) -> Error {
    Error::new("import_error", error.to_string())
}
fn extension(path: &Path) -> String {
    path.extension()
        .and_then(|v| v.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}
fn hidden(path: &Path) -> bool {
    path.components().any(|p| matches!(p, Component::Normal(v) if v.to_str().is_none_or(|v| v.starts_with('.') || v == "__MACOSX")))
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
fn checked_path(path: &Path) -> Result<PathBuf> {
    let absolute = std::path::absolute(path)?;
    // macOS file pickers and temporary paths use these OS-owned aliases.
    #[cfg(target_os = "macos")]
    let absolute = ["/var", "/tmp"]
        .iter()
        .find_map(|prefix| {
            absolute.strip_prefix(prefix).ok().map(|suffix| {
                Path::new("/private")
                    .join(prefix.trim_start_matches('/'))
                    .join(suffix)
            })
        })
        .unwrap_or(absolute);
    // Check each component before canonicalisation so a selected path cannot hide a link.
    let mut current = PathBuf::new();
    for part in absolute.components() {
        current.push(part);
        if is_link(&std::fs::symlink_metadata(&current)?) {
            return Err(Error::invalid(format!(
                "Links are not imported: {}",
                path.display()
            )));
        }
    }
    Ok(std::fs::canonicalize(absolute)?)
}
fn relative(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}
fn supported(format: &str) -> bool {
    TEXT_EXTENSIONS.contains(&format)
        || matches!(
            format,
            "csv"
                | "tsv"
                | "json"
                | "jsonl"
                | "ndjson"
                | "parquet"
                | "avro"
                | "arrow"
                | "ipc"
                | "feather"
                | "xlsx"
                | "xls"
                | "xlsm"
                | "xlsb"
                | "ods"
        )
}
fn workbook(format: &str) -> bool {
    matches!(format, "xlsx" | "xls" | "xlsm" | "xlsb" | "ods")
}
fn stem(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|v| v.to_str())
        .unwrap_or("data")
        .into()
}

impl Plan {
    pub(super) fn collect(
        request: &FileImportRequest,
        temporary: &Path,
        cancellation: &CancellationToken,
    ) -> Result<Self> {
        if request.paths.is_empty() {
            return Err(Error::invalid("Choose at least one file or folder"));
        }
        let mut paths = request
            .paths
            .iter()
            .map(|p| checked_path(p))
            .collect::<Result<Vec<_>>>()?;
        paths.sort();
        paths.dedup();
        let parents = paths
            .iter()
            .filter(|p| p.is_dir())
            .cloned()
            .collect::<Vec<_>>();
        paths.retain(|path| {
            !parents
                .iter()
                .any(|parent| path != parent && path.starts_with(parent))
        });
        let supplied_root = request.root.as_ref().map(|p| checked_path(p)).transpose()?;
        if supplied_root
            .as_ref()
            .is_some_and(|root| paths.iter().any(|p| !p.starts_with(root)))
        {
            return Err(Error::invalid(
                "Selected files must be within the import root",
            ));
        }
        let folders = paths.iter().filter(|p| p.is_dir()).count();
        let text_name = if request.root.is_some() {
            if folders > 0 {
                "folder_selection".into()
            } else {
                "selected_files".into()
            }
        } else if paths.len() == 1 {
            if folders == 1 {
                paths[0]
                    .file_name()
                    .and_then(|v| v.to_str())
                    .unwrap_or("folder_selection")
                    .into()
            } else if extension(&paths[0]) == "zip" {
                stem(&relative(&paths[0]))
            } else {
                "selected_files".into()
            }
        } else if folders > 0 {
            "folder_selection".into()
        } else {
            "selected_files".into()
        };
        let root = supplied_root.unwrap_or_else(|| {
            let mut root = if paths.len() == 1 && folders == 1 {
                paths[0].clone()
            } else {
                paths[0].parent().unwrap_or(Path::new("/")).to_owned()
            };
            while paths.iter().any(|p| !p.starts_with(&root)) {
                root.pop();
            }
            root
        });
        let mut plan = Self {
            temporary: tempfile::tempdir_in(temporary)?,
            files: Vec::new(),
            inspection: FileImportPlan {
                files: Vec::new(),
                text_name,
                collection: folders > 0 || paths.iter().any(|p| extension(p) == "zip"),
                skipped: Vec::new(),
            },
        };
        let mut visited = 0;
        for path in &paths {
            if path.is_dir() {
                plan.walk(path, &root, &mut visited, cancellation)?;
            } else if extension(path) == "zip" {
                let prefix = if paths.len() == 1 {
                    String::new()
                } else {
                    format!(
                        "{}/",
                        stem(&relative(path.strip_prefix(&root).unwrap_or(path)))
                    )
                };
                plan.zip(path, &prefix, &mut visited, cancellation)?;
            } else {
                plan.add(
                    path.clone(),
                    relative(path.strip_prefix(&root).unwrap_or(path)),
                    &mut visited,
                    cancellation,
                )?;
            }
        }
        plan.files.sort_by(|a, b| a.relative.cmp(&b.relative));
        plan.inspection.files = plan
            .files
            .iter()
            .map(|f| ImportFile {
                path: f.relative.clone(),
                format: f.format.clone(),
                sheets: f.sheets.clone(),
            })
            .collect();
        if plan.files.is_empty() {
            return Err(Error::invalid("The selection contains no supported input"));
        }
        Ok(plan)
    }
    fn walk(
        &mut self,
        folder: &Path,
        root: &Path,
        visited: &mut usize,
        cancellation: &CancellationToken,
    ) -> Result<()> {
        for entry in std::fs::read_dir(folder)? {
            check_cancellation(cancellation)?;
            let entry = entry?;
            let rel = entry
                .path()
                .strip_prefix(root)
                .map(relative)
                .map_err(import_error)?;
            if hidden(Path::new(&rel)) {
                continue;
            }
            let metadata = std::fs::symlink_metadata(entry.path())?;
            if is_link(&metadata) {
                continue;
            }
            if metadata.is_dir() {
                self.walk(&entry.path(), root, visited, cancellation)?;
            } else if metadata.is_file() {
                self.add(entry.path(), rel, visited, cancellation)?;
            }
        }
        Ok(())
    }
    fn count(visited: &mut usize) -> Result<()> {
        *visited += 1;
        if *visited > MAX_FILES {
            Err(Error::invalid(
                "Import traversal is limited to 100,000 files",
            ))
        } else {
            Ok(())
        }
    }
    fn add(
        &mut self,
        path: PathBuf,
        relative: String,
        visited: &mut usize,
        cancellation: &CancellationToken,
    ) -> Result<()> {
        check_cancellation(cancellation)?;
        if hidden(Path::new(&relative)) {
            return Ok(());
        }
        Self::count(visited)?;
        let format = extension(&path);
        if !supported(&format) {
            self.inspection.skipped.push(SkippedImportFile {
                path: relative,
                reason: if format == "zip" {
                    "Nested ZIP archives are not imported".into()
                } else {
                    format!(
                        "Unsupported file format: {}",
                        if format.is_empty() {
                            "no extension"
                        } else {
                            &format
                        }
                    )
                },
            });
            return Ok(());
        }
        let sheets = if workbook(&format) {
            calamine::open_workbook_auto(&path)
                .map_err(|e| import_error(format!("{relative}: {e}")))?
                .sheet_names()
                .to_vec()
        } else {
            Vec::new()
        };
        self.files.push(InputFile {
            path,
            relative,
            format,
            sheets,
        });
        Ok(())
    }
    fn zip(
        &mut self,
        path: &Path,
        prefix: &str,
        visited: &mut usize,
        cancellation: &CancellationToken,
    ) -> Result<()> {
        let mut archive = zip::ZipArchive::new(File::open(path)?).map_err(import_error)?;
        for index in 0..archive.len() {
            check_cancellation(cancellation)?;
            let mut entry = archive.by_index(index).map_err(import_error)?;
            if entry.is_dir() || entry.is_symlink() {
                continue;
            }
            let Some(enclosed) = entry.enclosed_name() else {
                return Err(Error::invalid("ZIP contains a path outside the archive"));
            };
            if hidden(&enclosed) {
                continue;
            }
            let rel = format!("{prefix}{}", relative(&enclosed));
            let format = extension(&enclosed);
            if !supported(&format) {
                self.add(enclosed, rel, visited, cancellation)?;
                continue;
            }
            let extracted =
                self.temporary
                    .path()
                    .join(format!("zip-{index}-{}.{}", self.files.len(), format));
            let mut output = File::create(&extracted)?;
            // No byte cap: cancellation and the shared traversal bound govern this reader.
            let mut buffer = [0_u8; 64 * 1024];
            loop {
                check_cancellation(cancellation)?;
                let len = entry.read(&mut buffer)?;
                if len == 0 {
                    break;
                }
                std::io::Write::write_all(&mut output, &buffer[..len])?;
            }
            self.add(extracted, rel, visited, cancellation)?;
        }
        Ok(())
    }
    pub(super) fn prepare(
        &mut self,
        selected: Option<&[FileImportSelection]>,
        cancellation: &CancellationToken,
    ) -> Result<Vec<PreparedSource>> {
        if let Some(selected) = selected {
            for selection in selected {
                let Some(file) = self.files.iter().find(|f| f.relative == selection.path) else {
                    return Err(Error::invalid(
                        "An import selection is no longer available. Inspect the files again.",
                    ));
                };
                if selection
                    .sheet
                    .as_ref()
                    .is_some_and(|s| !file.sheets.contains(s))
                {
                    return Err(Error::invalid(
                        "A selected workbook sheet is no longer available",
                    ));
                }
            }
        }
        let chosen = |file: &InputFile, sheet: Option<&str>| {
            selected.is_none_or(|list| {
                list.iter()
                    .any(|s| s.path == file.relative && s.sheet.as_deref() == sheet)
            })
        };
        let mut sources = Vec::new();
        let mut texts = Vec::new();
        for file in &self.files {
            check_cancellation(cancellation)?;
            if workbook(&file.format) {
                let mut book = calamine::open_workbook_auto(&file.path).map_err(import_error)?;
                for sheet in &file.sheets {
                    if !chosen(file, Some(sheet)) {
                        continue;
                    }
                    let range = book.worksheet_range(sheet).map_err(import_error)?;
                    let output = self
                        .temporary
                        .path()
                        .join(format!("table-{}.parquet", sources.len()));
                    readers::spreadsheet(range, &output, cancellation).map_err(|e| {
                        import_error(format!("{} [{sheet}]: {}", file.relative, e.message))
                    })?;
                    sources.push(readers::parquet_source(
                        format!("{}_{sheet}", stem(&file.relative)),
                        &output,
                        Default::default(),
                    ));
                }
            } else if chosen(file, None) {
                if TEXT_EXTENSIONS.contains(&file.format.as_str()) {
                    texts.push(file);
                } else {
                    sources.push(readers::table(
                        file,
                        self.temporary.path(),
                        sources.len(),
                        cancellation,
                    )?);
                }
            }
        }
        if !texts.is_empty() {
            let output = self.temporary.path().join("texts.parquet");
            let count =
                readers::texts(&texts, &output, &mut self.inspection.skipped, cancellation)?;
            if count > 0 {
                sources.push(readers::parquet_source(
                    self.inspection.text_name.clone(),
                    &output,
                    Default::default(),
                ));
            }
        }
        if sources.is_empty() {
            return Err(Error::invalid(
                "The selection contains no supported input with readable data",
            ));
        }
        Ok(sources)
    }
}
