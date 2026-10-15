//! Bundled content navigation. The document owns pending delivery until its
//! renderer is ready; the generated index is a projection of the canonical registry.
use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub(crate) struct HelpTarget {
    pub kind: String,
    pub key: String,
    pub file: String,
    pub anchor: String,
    pub label: Option<String>,
}
#[derive(Deserialize)]
struct HelpTopic {
    #[serde(flatten)]
    target: HelpTarget,
    #[cfg(any(target_os = "macos", test))]
    title: String,
}
#[derive(Default)]
pub(crate) struct Navigation {
    revision: u64,
    target: Option<HelpTarget>,
}
#[derive(Serialize)]
pub(crate) struct Intent {
    revision: u64,
    target: HelpTarget,
}
impl Navigation {
    pub fn request(&mut self, target: HelpTarget) {
        self.revision += 1;
        self.target = Some(target);
    }
    fn take(&mut self) -> Option<Intent> {
        self.target.take().map(|target| Intent {
            revision: self.revision,
            target,
        })
    }
}
fn topics() -> &'static [HelpTopic] {
    static TOPICS: std::sync::OnceLock<Vec<HelpTopic>> = std::sync::OnceLock::new();
    TOPICS.get_or_init(|| {
        serde_json::from_str(include_str!("../generated/help-index.json"))
            .expect("generated bundled Help index")
    })
}
pub(crate) fn home() -> HelpTarget {
    topics()[0].target.clone()
}
#[tauri::command]
pub(crate) fn take_pending_help(
    window: WebviewWindow,
) -> Result<Option<Intent>, wordflow_backend::Error> {
    crate::documents::document(&window)?
        .help
        .lock()
        .map_err(|_| wordflow_backend::Error::new("desktop_error", "Help navigation lock poisoned"))
        .map(|mut navigation| navigation.take())
}

#[cfg(any(target_os = "macos", test))]
fn matching_topics(query: &str, limit: usize) -> Vec<usize> {
    let query = query.to_lowercase();
    let words = query.split_whitespace().collect::<Vec<_>>();
    if words.is_empty() {
        return Vec::new();
    }
    let mut found = topics()
        .iter()
        .enumerate()
        .filter(|(_, topic)| {
            let title = topic.title.to_lowercase();
            words.iter().all(|word| title.contains(word))
        })
        .collect::<Vec<_>>();
    found.sort_by_key(|(_, topic)| {
        let title = topic.title.to_lowercase();
        (!title.starts_with(words[0]), title)
    });
    found
        .into_iter()
        .take(limit)
        .map(|(index, _)| index)
        .collect()
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use objc2::{
        define_class, msg_send,
        rc::Retained,
        runtime::{AnyObject, ProtocolObject},
        AnyThread, DefinedClass, MainThreadMarker,
    };
    use objc2_app_kit::{NSApplication, NSUserInterfaceItemSearching};
    use objc2_foundation::{NSArray, NSInteger, NSObject, NSObjectProtocol, NSString};
    use std::{cell::RefCell, ptr::NonNull};
    struct Ivars {
        app: tauri::AppHandle,
    }
    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "WordflowHelpSearch"]
        #[ivars = Ivars]
        struct Search;
        unsafe impl NSObjectProtocol for Search {}
        unsafe impl NSUserInterfaceItemSearching for Search {
            #[unsafe(method(searchForItemsWithSearchString:resultLimit:matchedItemHandler:))]
            fn search(
                &self,
                query: &NSString,
                limit: NSInteger,
                handler: &block2::DynBlock<dyn Fn(NonNull<NSArray>)>,
            ) {
                // AppKit may call on a background thread. Matching reads immutable
                // bundled data and allocates Foundation values; no UI is touched.
                let strings =
                    matching_topics(&query.to_string(), usize::try_from(limit).unwrap_or(0))
                        .into_iter()
                        .map(|index| NSString::from_str(&index.to_string()))
                        .collect::<Vec<_>>();
                let values = strings
                    .iter()
                    .map(|value| {
                        let value: &AnyObject = value;
                        value
                    })
                    .collect::<Vec<_>>();
                let array = NSArray::from_slice(&values);
                handler.call((NonNull::from(&*array),));
            }
            #[unsafe(method_id(localizedTitlesForItem:))]
            unsafe fn titles(&self, item: &AnyObject) -> Retained<NSArray<NSString>> {
                let title = item
                    .downcast_ref::<NSString>()
                    .and_then(|key| key.to_string().parse::<usize>().ok())
                    .and_then(|index| topics().get(index))
                    .map(|topic| topic.title.as_str())
                    .unwrap_or("Wordflow Help");
                NSArray::from_retained_slice(&[
                    NSString::from_str("Wordflow Help"),
                    NSString::from_str(title),
                ])
            }
            #[unsafe(method(performActionForItem:))]
            unsafe fn perform(&self, item: &AnyObject) {
                if let Some(topic) = item
                    .downcast_ref::<NSString>()
                    .and_then(|key| key.to_string().parse::<usize>().ok())
                    .and_then(|index| topics().get(index))
                {
                    crate::documents::show_help(&self.ivars().app, topic.target.clone());
                }
            }
        }
    );
    impl Search {
        fn new(app: tauri::AppHandle) -> Retained<Self> {
            let this = Self::alloc().set_ivars(Ivars { app });
            // SAFETY: NSObject init consumes this freshly allocated subclass;
            // immutable Rust ivars are installed before any protocol callback.
            unsafe { msg_send![super(this), init] }
        }
    }
    thread_local! { static SEARCH: RefCell<Option<Retained<Search>>> = const { RefCell::new(None) }; }
    pub(crate) fn install(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
        let main = MainThreadMarker::new()
            .ok_or_else(|| crate::boxed_error("Install Help search on the main thread"))?;
        let search = Search::new(app.clone());
        NSApplication::sharedApplication(main)
            .registerUserInterfaceItemSearchHandler(ProtocolObject::from_ref(&*search));
        SEARCH.with(|stored| *stored.borrow_mut() = Some(search));
        Ok(())
    }
}
#[cfg(target_os = "macos")]
pub(crate) use macos::install;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bundled_help_search_matches_all_words_and_respects_the_native_limit() {
        assert_eq!(home().file, "tutorials/index.md");
        assert!(matching_topics("   ", 10).is_empty());
        let matches = matching_topics("CONCORDANCE search", 10);
        assert!(!matches.is_empty());
        assert!(matches
            .iter()
            .all(|index| topics()[*index].target.file.ends_with("concordance.md")));
        assert_eq!(matching_topics("concordance", 1).len(), 1);
        assert!(matching_topics("concordance", 0).is_empty());
        assert!(matching_topics("not a bundled topic qzx", 10).is_empty());
    }
    #[test]
    fn pending_delivery_keeps_only_the_latest_request_and_orders_responses() {
        let mut navigation = Navigation::default();
        navigation.request(home());
        navigation.request(topics()[1].target.clone());
        let intent = navigation.take().unwrap();
        assert_eq!(intent.revision, 2);
        assert_eq!(intent.target, topics()[1].target);
        assert!(navigation.take().is_none());
        navigation.request(home());
        assert_eq!(navigation.take().unwrap().revision, 3);
    }
}
