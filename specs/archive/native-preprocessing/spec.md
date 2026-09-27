# Native preprocessing contracts

Preprocessing uses the current window's backend and table names. New results can
be Views or Tables. Sample, Join and Stack create results only. Filter, Find and
Create can update stored Tables or Views; handwritten SQL updates Views only.

Creation registers the object and logical parents atomically. Metadata is copied
only for explicitly mapped, unchanged columns. Previews use the same SELECT as
Apply, a lookahead page and no full count. Sampling previews are illustrative;
native parallel seeded sampling does not promise repeated identical output.

SQL uses `__wf_current` for the first selected input. Preview and creation bind
it with a CTE. View updates retain the existing sole outer FROM requirement.
Errors have one expandable Sonner owner. Drafts remain after failures and panel
navigation. Project/window lifecycle and editing guards are unchanged.
