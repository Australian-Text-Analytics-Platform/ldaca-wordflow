//! Wordflow's help pages in the macOS Help menu's search field (Chao, 2026-10-12).
//!
//! macOS gives every app's Help menu a search field. Without a help book it
//! listed Apple's own help topics, which have nothing to do with Wordflow.
//! The window sends its help topics here (`set_help_topics`); a search
//! handler registered with `NSApplication` matches them as people type, and
//! choosing one emits `open-help-topic` so the window opens that page.

use std::sync::{Mutex, OnceLock};

use serde::Deserialize;
use tauri::{AppHandle, Emitter};

/// Event the window listens to; its payload is the chosen topic's id.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) const OPEN_HELP_TOPIC_EVENT: &str = "open-help-topic";
/// Event that opens the help home page (Help > Wordflow Help).
pub(crate) const OPEN_HELP_HOME_EVENT: &str = "open-help-home";

/// One help page section, as the window lists it.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub(crate) struct HelpTopic {
    pub(crate) id: String,
    pub(crate) title: String,
}

static TOPICS: Mutex<Vec<HelpTopic>> = Mutex::new(Vec::new());
static APP: OnceLock<AppHandle> = OnceLock::new();

/// Replace the topics the Help menu searches (sent by the window at start).
#[tauri::command]
pub(crate) fn set_help_topics(topics: Vec<HelpTopic>) {
    if let Ok(mut current) = TOPICS.lock() {
        *current = topics;
    }
}

/// Topics whose title contains every word typed, those starting with the
/// first word first, at most `limit`.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn matching_topics(topics: &[HelpTopic], query: &str, limit: usize) -> Vec<HelpTopic> {
    let words: Vec<String> = query
        .split_whitespace()
        .map(|word| word.to_lowercase())
        .collect();
    if words.is_empty() {
        return Vec::new();
    }
    let mut matches: Vec<(bool, &HelpTopic)> = topics
        .iter()
        .filter_map(|topic| {
            let title = topic.title.to_lowercase();
            words
                .iter()
                .all(|word| title.contains(word.as_str()))
                .then(|| (!title.starts_with(words[0].as_str()), topic))
        })
        .collect();
    matches.sort_by_key(|(later, _)| *later);
    matches
        .into_iter()
        .take(limit)
        .map(|(_, topic)| topic.clone())
        .collect()
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn title_for(id: &str) -> Option<String> {
    TOPICS
        .lock()
        .ok()?
        .iter()
        .find(|topic| topic.id == id)
        .map(|topic| topic.title.clone())
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn emit(event: &str, payload: String) {
    if let Some(app) = APP.get() {
        let _ = app.emit(event, payload);
    }
}

/// Ask the window to open the help home page.
pub(crate) fn open_help_home(app: &AppHandle) {
    let _ = app.emit(OPEN_HELP_HOME_EVENT, String::new());
}

#[cfg(target_os = "macos")]
mod native {
    use std::ptr::NonNull;

    use block2::DynBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, NSObject, NSObjectProtocol, ProtocolObject};
    use objc2::{define_class, msg_send, AnyThread};
    use objc2_app_kit::{NSApplication, NSUserInterfaceItemSearching};
    use objc2_foundation::{MainThreadMarker, NSArray, NSInteger, NSString};

    use super::{emit, matching_topics, title_for, OPEN_HELP_TOPIC_EVENT, TOPICS};

    define_class!(
        // SAFETY: NSObject has no subclassing requirements and the class has
        // no Drop. macOS may call the search on a background thread, so the
        // class is AnyThread and keeps its state in a Mutex.
        #[unsafe(super = NSObject)]
        #[thread_kind = AnyThread]
        #[name = "WordflowHelpMenuSearch"]
        struct HelpMenuSearch;

        // SAFETY: NSObjectProtocol has no safety requirements.
        unsafe impl NSObjectProtocol for HelpMenuSearch {}

        // SAFETY: the method signatures match NSUserInterfaceItemSearching.
        unsafe impl NSUserInterfaceItemSearching for HelpMenuSearch {
            #[unsafe(method(searchForItemsWithSearchString:resultLimit:matchedItemHandler:))]
            fn search(
                &self,
                search_string: &NSString,
                result_limit: NSInteger,
                handle_matched_items: &DynBlock<dyn Fn(NonNull<NSArray>)>,
            ) {
                let topics = TOPICS
                    .lock()
                    .map(|topics| topics.clone())
                    .unwrap_or_default();
                let limit = usize::try_from(result_limit).unwrap_or(0);
                let ids: Vec<Retained<NSString>> =
                    matching_topics(&topics, &search_string.to_string(), limit)
                        .iter()
                        .map(|topic| NSString::from_str(&topic.id))
                        .collect();
                let items: Retained<NSArray<NSString>> = NSArray::from_retained_slice(&ids);
                let items: &NSArray<NSString> = &items;
                handle_matched_items.call((NonNull::from(items).cast(),));
            }

            #[unsafe(method_id(localizedTitlesForItem:))]
            fn localized_titles(&self, item: &AnyObject) -> Retained<NSArray<NSString>> {
                let title = item
                    .downcast_ref::<NSString>()
                    .and_then(|id| title_for(&id.to_string()))
                    .unwrap_or_default();
                NSArray::from_retained_slice(&[NSString::from_str(&title)])
            }

            #[unsafe(method(performActionForItem:))]
            fn perform_action(&self, item: &AnyObject) {
                if let Some(id) = item.downcast_ref::<NSString>() {
                    emit(OPEN_HELP_TOPIC_EVENT, id.to_string());
                }
            }
        }
    );

    impl HelpMenuSearch {
        fn new() -> Retained<Self> {
            let this = Self::alloc().set_ivars(());
            // SAFETY: NSObject's init is always valid.
            unsafe { msg_send![super(this), init] }
        }
    }

    /// Register the handler with the app; must run on the main thread.
    pub(super) fn register(mtm: MainThreadMarker) {
        let handler = HelpMenuSearch::new();
        NSApplication::sharedApplication(mtm)
            .registerUserInterfaceItemSearchHandler(ProtocolObject::from_ref(&*handler));
        // The app keeps using the handler for its whole life.
        std::mem::forget(handler);
    }
}

/// Make the macOS Help menu search Wordflow's help. Call once from setup.
pub(crate) fn install(app: &AppHandle) {
    let _ = APP.set(app.clone());
    #[cfg(target_os = "macos")]
    if let Some(mtm) = objc2_foundation::MainThreadMarker::new() {
        native::register(mtm);
    }
}

#[cfg(test)]
mod tests {
    use super::{matching_topics, HelpTopic};

    fn topic(id: &str, title: &str) -> HelpTopic {
        HelpTopic {
            id: id.into(),
            title: title.into(),
        }
    }

    #[test]
    fn every_typed_word_must_match_and_title_starts_come_first() {
        let topics = vec![
            topic("a", "Context length (Quotation Extraction)"),
            topic("b", "Concordance overview (Concordance)"),
            topic("c", "Tasks (User Interface Overview)"),
        ];

        let ids: Vec<String> = matching_topics(&topics, "con", 10)
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert_eq!(ids, ["a", "b"]);
        assert_eq!(matching_topics(&topics, "quotation context", 10).len(), 1);
        assert!(matching_topics(&topics, "  ", 10).is_empty());
        assert_eq!(matching_topics(&topics, "o", 1).len(), 1);
    }
}
