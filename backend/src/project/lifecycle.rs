//! File creation, format validation, checkpointed Save As and idle Rename.
use super::*;
impl Project {
    pub(super) fn create(path: &Path) -> Result<Self> {
        if path.exists() {
            return Err(Error::invalid("Create will not overwrite an existing path"));
        }
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let staging = tempfile::Builder::new()
            .prefix(".wordflow-create-")
            .tempdir_in(parent)?;
        let staged = staging.path().join("project.wfpj");
        let mut conn = Connection::open(&staged)?;
        let tx = conn.transaction()?;
        tx.execute_batch(include_str!("../schema.sql"))?;
        tx.execute(
            "INSERT INTO wordflow.project(schema_version) VALUES (1)",
            [],
        )?;
        tx.commit()?;
        conn.close().map_err(|(_, e)| Error::from(e))?;
        // Same-filesystem publication is atomic and cannot overwrite a racing creator.
        std::fs::hard_link(&staged, path)?;
        Self::open(path)
    }
    pub(super) fn open(path: &Path) -> Result<Self> {
        if !std::fs::metadata(path)?.is_file() {
            return Err(Error::invalid("Project path must be an existing file"));
        }
        let path = std::fs::canonicalize(path)?;
        let config = duckdb::Config::default().access_mode(duckdb::AccessMode::ReadOnly)?;
        let reader = Connection::open_with_flags(&path, config)?;
        validate_project(&reader)?;
        reader.close().map_err(|(_, e)| Error::from(e))?;
        let conn = Connection::open(&path)?;
        validate_project(&conn)?;
        conn.execute_batch("SET GLOBAL enable_view_dependencies=false")?;
        Ok(Self {
            database: Database::new(conn, CancellationToken::new())?,
            path,
            temporary: None,
        })
    }
    pub(super) fn untitled() -> Result<Self> {
        Self::untitled_in(&std::env::temp_dir())
    }
    pub(super) fn untitled_in(directory: &Path) -> Result<Self> {
        let temporary = tempfile::Builder::new()
            .prefix("wordflow-untitled-")
            .tempdir_in(directory)?;
        let mut project = Self::create(&temporary.path().join("untitled.wfpj"))?;
        project.temporary = Some(temporary);
        Ok(project)
    }
    pub(super) fn save_as(&mut self, path: &Path) -> Result<ProjectInfo> {
        self.save_to(path, false)
    }
    pub(super) fn rename_to(&mut self, path: &Path) -> Result<ProjectInfo> {
        self.save_to(path, true)
    }
    fn save_to(&mut self, path: &Path, rename: bool) -> Result<ProjectInfo> {
        let same_file = path.exists() && std::fs::canonicalize(path)? == self.path;
        if same_file && (!rename || path.file_name() == self.path.file_name()) {
            self.database.conn.execute_batch("CHECKPOINT")?;
            return Ok(self.info());
        }
        if rename && path.exists() && !same_file {
            return Err(Error::new(
                "file_exists",
                "Choose an unused project filename.",
            ));
        }
        let destination = if path.exists() && !rename {
            std::fs::canonicalize(path)?
        } else {
            path.to_path_buf()
        };
        let path = destination.as_path();
        let destination_lock = if rename {
            None
        } else {
            lock_destination(path)?
        };
        self.database.conn.execute_batch("CHECKPOINT")?;
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let staging = tempfile::Builder::new()
            .prefix(".wordflow-save-")
            .tempdir_in(parent)?;
        let staged = staging.path().join("project.wfpj");
        std::fs::copy(&self.path, &staged)?;
        let saved = Self::open(&staged)?;
        saved.database.conn.execute_batch("CHECKPOINT")?;
        drop(saved);
        std::fs::File::options()
            .write(true)
            .open(&staged)?
            .sync_all()?;
        // The runtime excludes all work during Rename. Keep the original connection
        // and file available for rollback until its replacement is fully opened.
        let original = staging.path().join("original.wfpj");
        if rename && same_file {
            std::fs::rename(&self.path, &original)?;
        }
        let mut installed = false;
        let install = (|| -> Result<Self> {
            if destination_lock.is_some() {
                tempfile::TempPath::try_from_path(&staged)?
                    .persist(path)
                    .map_err(|error| error.error)?;
            } else {
                // An unapproved file created since the chooser must not be replaced.
                std::fs::hard_link(&staged, path)?;
            }
            installed = true;
            let mut saved = Self::open(path)?;
            saved.database.model_assets = self.database.model_assets.clone();
            let temporary = temporary_directory(&self.database.conn)?;
            saved.database.conn.execute(
                "SET GLOBAL temp_directory = ?",
                params![temporary.to_string_lossy()],
            )?;
            let extensions: String = self.database.conn.query_row(
                "SELECT current_setting('extension_directory')",
                [],
                |row| row.get(0),
            )?;
            saved
                .database
                .conn
                .execute("SET GLOBAL extension_directory = ?", params![extensions])?;
            // Save As replaces the database, not the runtime's change subscriptions.
            saved.database.changes = self.database.changes.clone();
            Ok(saved)
        })();
        let saved = match install {
            Ok(saved) => saved,
            Err(error) => {
                if rename {
                    // Do not remove an unapproved destination that won publication.
                    if installed {
                        let _ = std::fs::remove_file(path);
                    }
                    if same_file && let Err(restore) = std::fs::hard_link(&original, &self.path) {
                        // A rollback failure must never let TempDir delete the original.
                        let backup = staging.keep().join("original.wfpj");
                        return Err(Error::new(
                            "rename_failed",
                            format!(
                                "{error}. Could not restore the original filename: {restore}. The original project is retained at {}",
                                backup.display()
                            ),
                        ));
                    }
                }
                return Err(error);
            }
        };
        if rename
            && !same_file
            && let Err(error) = std::fs::rename(&self.path, &original)
        {
            drop(saved);
            let _ = std::fs::remove_file(path);
            return Err(error.into());
        }
        *self = saved;
        Ok(self.info())
    }
    pub(super) fn info(&self) -> ProjectInfo {
        let (size, modified) = project_file_metadata(&self.path);
        ProjectInfo {
            size,
            modified,
            schema_version: 1,
            path: self.temporary.is_none().then(|| self.path.clone()),
            title: if self.temporary.is_some() {
                "Untitled".into()
            } else {
                self.path
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned()
            },
        }
    }
}

/// Hold DuckDB-compatible exclusion on an existing destination until replacement finishes.
/// The native document registry separately excludes owners within this process (POSIX locks
/// belong to a process, so another descriptor in that process cannot detect its own lock).
pub fn lock_destination(path: &Path) -> Result<Option<std::fs::File>> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true).write(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Match DuckDB WRITE_LOCK: permit rename, but exclude other readers/writers.
        options.share_mode(4); // FILE_SHARE_DELETE
    }
    let file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        #[cfg(windows)]
        Err(error) if matches!(error.raw_os_error(), Some(32 | 33)) => {
            return Err(Error::new(
                "project_busy",
                "This destination is in use. Close the project in the other application before replacing it.",
            ));
        }
        Err(error) => return Err(error.into()),
    };
    #[cfg(unix)]
    {
        use std::os::fd::AsRawFd;
        // DuckDB uses POSIX record locks, not flock (the latter backs std::fs::File::try_lock).
        // SAFETY: flock is a plain C struct; the initialized pointer and descriptor remain valid
        // for the synchronous fcntl call. Closing this File releases the acquired lock.
        let result = unsafe {
            let mut lock: libc::flock = std::mem::zeroed();
            lock.l_type = libc::F_WRLCK as _;
            lock.l_whence = libc::SEEK_SET as _;
            libc::fcntl(file.as_raw_fd(), libc::F_SETLK, &lock)
        };
        if result == -1 {
            let error = std::io::Error::last_os_error();
            if !matches!(error.raw_os_error(), Some(libc::EACCES | libc::EAGAIN)) {
                return Err(error.into());
            }
            return Err(Error::new(
                "project_busy",
                format!(
                    "Cannot replace this destination. Close the project in the other application first. {error}"
                ),
            ));
        }
    }
    Ok(Some(file))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{BufRead, Write},
        process::{Command, Stdio},
        time::{Duration, Instant},
    };
    #[test]
    fn rename_preserves_case_only_filename_changes_and_reopens() {
        let directory = tempfile::tempdir().unwrap();
        let original = directory.path().join("Study.wfpj");
        let renamed = directory.path().join("study.wfpj");
        let mut project = Project::create(&original).unwrap();
        project
            .database
            .conn
            .execute_batch("CREATE TABLE data.docs AS SELECT 42 AS id")
            .unwrap();
        assert_eq!(project.rename_to(&renamed).unwrap().title, "study");
        drop(project);
        assert_eq!(
            std::fs::read_dir(directory.path())
                .unwrap()
                .filter_map(|entry| {
                    let entry = entry.unwrap();
                    entry
                        .file_type()
                        .unwrap()
                        .is_file()
                        .then(|| entry.file_name())
                })
                .collect::<Vec<_>>(),
            [std::ffi::OsString::from("study.wfpj")]
        );
        let reopened = Project::open(&renamed).unwrap();
        assert_eq!(
            reopened
                .database
                .conn
                .query_row("SELECT id FROM data.docs", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            42
        );
    }

    #[test]
    fn destination_owner_child() {
        let Ok(path) = std::env::var("WORDFLOW_TEST_DESTINATION") else {
            return;
        };
        let config = duckdb::Config::default()
            .access_mode(if std::env::var("WORDFLOW_TEST_READER").is_ok() {
                duckdb::AccessMode::ReadOnly
            } else {
                duckdb::AccessMode::ReadWrite
            })
            .unwrap();
        let _connection = Connection::open_with_flags(path, config).unwrap();
        println!("destination locked");
        std::io::stdout().flush().unwrap();
        let mut line = String::new();
        std::io::stdin().read_line(&mut line).unwrap();
    }

    #[test]
    fn save_as_rejects_external_readers_and_writers_without_replacing_either_project() {
        for read_only in [false, true] {
            let dir = tempfile::tempdir().unwrap();
            let destination = dir.path().join("destination.wfpj");
            drop(Project::create(&destination).unwrap());
            let mut source = Project::untitled().unwrap();
            source
                .database
                .conn
                .execute_batch("CREATE TABLE t AS SELECT 42 n; CHECKPOINT")
                .unwrap();
            let original = std::fs::read(&destination).unwrap();
            let mut command = Command::new(std::env::current_exe().unwrap());
            command
                .args([
                    "--exact",
                    "project::lifecycle::tests::destination_owner_child",
                    "--nocapture",
                ])
                .env("WORDFLOW_TEST_DESTINATION", &destination)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped());
            if read_only {
                command.env("WORDFLOW_TEST_READER", "1");
            }
            let mut child = command.spawn().unwrap();
            let mut stdout = std::io::BufReader::new(child.stdout.take().unwrap());
            let started = Instant::now();
            loop {
                let mut line = String::new();
                assert!(stdout.read_line(&mut line).unwrap() > 0);
                if line.contains("destination locked") {
                    break;
                }
                assert!(started.elapsed() < Duration::from_secs(10));
            }
            let outcome = source.save_as(&destination);
            child.stdin.take().unwrap().write_all(b"release\n").unwrap();
            assert!(child.wait().unwrap().success());
            assert_eq!(outcome.unwrap_err().code, "project_busy");
            assert!(source.info().path.is_none());
            assert_eq!(std::fs::read(&destination).unwrap(), original);
            assert_eq!(
                source
                    .database
                    .conn
                    .query_row("SELECT n FROM t", [], |r| r.get::<_, i32>(0))
                    .unwrap(),
                42
            );
            source.save_as(&destination).unwrap();
            assert_eq!(
                source.info().path,
                Some(std::fs::canonicalize(&destination).unwrap())
            );
        }
    }
}

/// Status reads the working files without changing the database or its WAL.
fn project_file_metadata(path: &Path) -> (Option<u64>, Option<u64>) {
    let mut wal = path.as_os_str().to_os_string();
    wal.push(".wal");
    let files = [std::fs::metadata(path).ok(), std::fs::metadata(wal).ok()];
    let size = files
        .iter()
        .flatten()
        .map(std::fs::Metadata::len)
        .reduce(|a, b| a + b);
    let modified = files
        .iter()
        .flatten()
        .filter_map(|file| {
            file.modified()
                .ok()?
                .duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|time| time.as_secs())
        })
        .max();
    (size, modified)
}

#[cfg(test)]
mod metadata_tests {
    use super::*;

    #[test]
    fn working_file_metadata_includes_wal_and_handles_missing_files() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("untitled.wfpj");
        assert_eq!(project_file_metadata(&path), (None, None));
        std::fs::write(&path, b"database").unwrap();
        let (size, modified) = project_file_metadata(&path);
        assert_eq!(size, Some(8));
        assert!(modified.is_some());
        std::fs::write(directory.path().join("untitled.wfpj.wal"), b"pending").unwrap();
        assert_eq!(project_file_metadata(&path).0, Some(15));
        assert!(project_file_metadata(&path).1 >= modified);
    }
}
