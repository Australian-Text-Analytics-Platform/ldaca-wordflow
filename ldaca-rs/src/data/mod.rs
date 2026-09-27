//! Reusable ONI access and Arrow tabulation, independent of Python and Wordflow.
pub mod client;
pub mod documents;
pub mod error;
pub mod metadata;
pub mod profiles;
pub mod table;
pub mod tabulate;
pub use client::{Client, ClientOptions, SearchPage};
pub use error::{Error, Result};
pub use metadata::RoCrate;
pub use table::{Table, TableSet};
