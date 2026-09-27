//! File creation, format validation, and checkpointed Save As.
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
        let temporary = tempfile::Builder::new()
            .prefix("wordflow-untitled-")
            .tempdir()?;
        let mut project = Self::create(&temporary.path().join("untitled.wfpj"))?;
        project.temporary = Some(temporary);
        Ok(project)
    }
    pub(super) fn save_as(&mut self, path: &Path) -> Result<ProjectInfo> {
        if path.exists() && std::fs::canonicalize(path)? == std::fs::canonicalize(&self.path)? {
            self.database.conn.execute_batch("CHECKPOINT")?;
            return Ok(self.info());
        }
        let destination = if path.exists() {
            std::fs::canonicalize(path)?
        } else {
            path.to_path_buf()
        };
        let path = destination.as_path();
        let destination_lock = lock_destination(path)?;
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
        if destination_lock.is_some() {
            tempfile::TempPath::try_from_path(&staged)?
                .persist(path)
                .map_err(|error| error.error)?;
        } else {
            // An unapproved file created since the chooser must not be replaced.
            std::fs::hard_link(&staged, path)?;
        }
        let mut saved = Self::open(path)?;
        // Save As replaces the database, not the runtime's change subscriptions.
        saved.database.changes = self.database.changes.clone();
        *self = saved;
        Ok(self.info())
    }
    pub(super) fn info(&self) -> ProjectInfo {
        ProjectInfo {
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
