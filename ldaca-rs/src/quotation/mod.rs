//! English quotations with character spans into the original text.
mod bridge;
mod document;
mod normalize;
mod rules;
use document::Document;
use normalize::Normalized;
pub use rules::Quote;
use sha2::{Digest, Sha256};
use std::path::Path;

pub const MODEL_FILENAME: &str = "english-ewt-ud-2.5-191206.udpipe";
pub const MODEL_URL: &str = "https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/handle/11234/1-3131/english-ewt-ud-2.5-191206.udpipe";
pub const MODEL_SHA256: &str = "784bd0fa85e3d831fd02a55290d0acfd05c953159dc38cc33d52e1b28add9957";
pub fn is_pinned_model(bytes: &[u8]) -> bool {
    format!("{:x}", Sha256::digest(bytes)) == MODEL_SHA256
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("quotation model I/O: {0}")]
    Io(#[from] std::io::Error),
    #[error("quotation parser: {0}")]
    Parser(#[from] cxx::Exception),
    #[error("quotation parser returned invalid dependency or source ranges")]
    InvalidParse,
}
/// An owned UDPipe model. Use one extractor per execution thread.
pub struct QuotationExtractor {
    model: cxx::UniquePtr<bridge::ffi::Model>,
}
impl QuotationExtractor {
    pub fn load(path: &Path) -> Result<Self, Error> {
        Self::from_bytes(&std::fs::read(path)?)
    }
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, Error> {
        Ok(Self {
            model: bridge::ffi::load_model(bytes)?,
        })
    }
    pub fn extract(&mut self, source: &str) -> Result<Vec<Quote>, Error> {
        if source.trim().is_empty() {
            return Ok(Vec::new());
        }
        let normalized = Normalized::new(source);
        let parsed = self.model.pin_mut().parse(&normalized.text)?;
        let doc = Document::new(&normalized.text, parsed)?;
        Ok(rules::extract(&doc, &normalized, source))
    }
}
#[cfg(test)]
mod tests {
    use super::bridge::ffi;

    #[test]
    fn corrupt_model_is_an_error() {
        assert!(ffi::load_model(b"corrupt").is_err());
        assert!(!super::is_pinned_model(b"corrupt"));
    }

    #[test]
    #[ignore = "requires WORDFLOW_TEST_UDPIPE_MODEL; run in the provisioned model job"]
    fn native_load_parse_drop_and_independent_threads() {
        let path = std::env::var("WORDFLOW_TEST_UDPIPE_MODEL")
            .expect("provision WORDFLOW_TEST_UDPIPE_MODEL before running model tests");
        let bytes = std::fs::read(path).unwrap();
        assert!(super::is_pinned_model(&bytes));
        let mut extractor = super::QuotationExtractor::from_bytes(&bytes).unwrap();
        std::thread::spawn(move || {
            assert!(!extractor
                .extract("Alice said, \"The project will finish tomorrow morning.\"")
                .unwrap()
                .is_empty());
        })
        .join()
        .unwrap();
        std::thread::scope(|scope| {
            for _ in 0..4 {
                let bytes = &bytes;
                scope.spawn(move || {
                    for _ in 0..3 {
                        let mut model = ffi::load_model(bytes).unwrap();
                        let sentences = model
                            .pin_mut()
                            .parse(
                                "Noise\0 Alice said, \"The project will finish tomorrow morning.\"",
                            )
                            .unwrap();
                        assert!(sentences
                            .iter()
                            .flat_map(|s| &s.words)
                            .any(|w| w.form == "morning"));
                    }
                });
            }
        });
    }
}
