use sha2::{Digest, Sha256};
pub(crate) fn hash_text(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}
