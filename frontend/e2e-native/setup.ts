// Included by Vite only in the instrumented native test build.
import '@wdio/tauri-plugin';
import '../e2e-browser/errorBridge';

// Embedded driver 1.4 dispatches MouseEvents without a view. D3 drag needs the
// originating window to install its listeners. Repair only synthetic events;
// ordinary builds and genuine user input are unaffected.
const completeMouseEvent = (event: MouseEvent) => {
  if (!event.isTrusted && event.view === null) {
    Object.defineProperty(event, 'view', { value: window });
  }
};
for (const type of ['mousedown', 'mousemove', 'mouseup'] as const) {
  window.addEventListener(type, completeMouseEvent, true);
}
