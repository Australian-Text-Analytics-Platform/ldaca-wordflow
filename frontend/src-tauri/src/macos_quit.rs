//! Route AppKit termination (menu, Cmd-Q and Dock) through document protection.
//! Tao's delegate currently only observes applicationWillTerminate, which is too late.
use crate::documents;
use objc2::{
    class, ffi, msg_send,
    runtime::{AnyObject, Imp, Sel},
    sel,
};
use std::sync::OnceLock;

static APPLICATION: OnceLock<tauri::AppHandle> = OnceLock::new();

extern "C" fn should_terminate(_: &AnyObject, _: Sel, _: &AnyObject) -> usize {
    let Some(app) = APPLICATION.get() else {
        return 1;
    };
    if documents::intercept_exit(app, 0) {
        0 // NSTerminateCancel. The document coordinator exits the runtime after asynchronous cleanup.
    } else {
        1 // NSTerminateNow, once shutdown has completed.
    }
}

pub(crate) fn install(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    APPLICATION
        .set(app.clone())
        .map_err(|_| crate::boxed_error("Quit bridge already installed"))?;
    // SAFETY: setup runs on AppKit's main thread. NSApplication and its Tao delegate
    // are alive for the process lifetime. The method encoding is NSUInteger(id, SEL, id),
    // matching applicationShouldTerminate: on both supported 64-bit macOS architectures.
    unsafe {
        let application: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        let delegate: *mut AnyObject = msg_send![application, delegate];
        let delegate = delegate
            .as_ref()
            .ok_or_else(|| crate::boxed_error("Missing AppKit delegate"))?;
        let implementation: Imp = std::mem::transmute::<
            extern "C" fn(&AnyObject, Sel, &AnyObject) -> usize,
            Imp,
        >(should_terminate);
        if !ffi::class_addMethod(
            (delegate.class() as *const objc2::runtime::AnyClass).cast_mut(),
            sel!(applicationShouldTerminate:),
            implementation,
            c"Q@:@".as_ptr(),
        )
        .as_bool()
        {
            return Err(crate::boxed_error(
                "AppKit termination delegate already owns the Quit hook",
            ));
        }
    }
    Ok(())
}
