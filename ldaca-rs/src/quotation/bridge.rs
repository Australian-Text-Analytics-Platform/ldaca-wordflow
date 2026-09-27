//! The only foreign boundary: owned UDPipe models and parsed sentence data.
#[cxx::bridge(namespace = "wordflow_quotation")]
pub(crate) mod ffi {
    struct Word {
        id: u32,
        head: u32,
        form: String,
        pos: String,
        relation: String,
    }

    struct Token {
        first: u32,
        last: u32,
        start: u64,
        end: u64,
    }

    struct Sentence {
        words: Vec<Word>,
        tokens: Vec<Token>,
    }

    unsafe extern "C++" {
        include!("src/quotation/bridge.h");
        type Model;
        fn load_model(bytes: &[u8]) -> Result<UniquePtr<Model>>;
        fn parse(self: Pin<&mut Model>, text: &str) -> Result<Vec<Sentence>>;
    }
}

// SAFETY: Model exclusively owns its UDPipe instance. Parsing requires mutable
// access and all tokenizer/sentence state is call-local; moving an idle owner
// between threads does not share it. It intentionally does not implement Sync.
unsafe impl Send for ffi::Model {}
