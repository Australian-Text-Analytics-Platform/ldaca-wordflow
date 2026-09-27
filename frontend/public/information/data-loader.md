<!-- markdownlint-disable MD033 -->

<h2 id="info-data-loader-overview">About the Data Loader</h2>

The Data Loader is where you start. Use its Local files, Samples and LDaCA tabs to add data to the open project. You can also import sample datasets to try out the tools, or connect to the LDaCA repository to bring in existing collections.


## Desktop projects

On desktop, choose local files or drop them onto Data Loader or the exposed
graph. Review names and columns in the pane, then choose **Import files**.
The **Samples** tab lists available sample collections. Expand one to choose individual files, or use its checkbox to select or clear all its
files. A minus sign means only some files are selected. Choose **Import selected**
to add the selected files as Data Blocks.

**Import as views** is checked by default. These views read data online from a
fixed revision of the published samples, so future updates will not change them.
Internet access is needed to query them. Uncheck **Import as views** to store the
selected files as Tables inside the project for offline use.
Local files and **LDaCA** imports store their data inside the project.
Switching sources preserves unfinished choices. Import progress and cancellation
remain in Tasks, and new Data Blocks do not automatically open a preview.


### Imported data in desktop projects

Local files and LDaCA imports preserve their data in a hidden raw Table and show
an editable View in the graph. Column transformations change the View and can
use SQL-layer Undo. **Materialize** in the Data Block menu stores its current
results as a Table. Further column changes modify that Table directly and have
no Undo. The original imported data remains stored separately. Sample data imported as Views stays online until materialized; samples imported
as Tables already contain their data.
