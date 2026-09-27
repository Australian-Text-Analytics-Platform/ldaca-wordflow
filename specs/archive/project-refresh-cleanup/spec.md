# Project refresh and analysis cleanup

Implement the approved hybrid refresh design before restoring Concordance:
known mutations invalidate affected objects and SQL dependants; arbitrary console
Execute invalidates broadly. Read/Preview and exports publish no changes. Keep
one commit-notification owner and one frontend refresh observer.

Move Frequency stopword filtering into backend read transactions, with same-read
table/text export bundles. Keep browsing controls window-local, preserve durable
colours/list selection, defer hidden language sampling, align paired list ranks,
skip unchanged SQL-cell positions and separate generic analysis ownership from
Frequency calculations. Preserve format 7 and current task/editor protection.

No C++ hooks, change history, new package dependencies, migration or additional analyses.
