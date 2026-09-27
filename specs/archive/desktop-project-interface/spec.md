# Desktop project interface

Keep the original three-column VS Code interface. Desktop owns one `.wfpj`
document and exposes Data Loader, recent local sources, direct LDaCA imports,
React Flow graph selection and data preview. Other feature controls remain
visible but disabled. Do not add a replacement SQL or analysis UI.

File selection and native graph drops open the existing Add to Project dialog.
Table/View belongs in the expanded graph card. Untitled starts empty, OS file
opens select a document, and unsaved replacement/Quit supports Save/Discard/Cancel.
The Python server retains managed project and file workflows with Project as
its frontend terminology. Server API identifiers remain unchanged.
