import { normalizeNodeColor } from '../../lib/nodeColor';
import theme from '../../../theme/vscode-2026.json';

export interface PreviewModel {
  filename: string;
  file_size?: string;
  modified?: string;
  description?: string;
  saved_sql_cells?: number;
  message?: string;
  nodes: {
    table_name: string;
    color?: string | null;
    kind?: string | null;
    column_count?: number | null;
    columns: { name: string; type: string }[];
  }[];
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    return (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ??
      character
    );
  });

function palette(mode: keyof typeof theme.themes): string {
  const colors = theme.themes[mode];
  return `--bg:${colors['editor.background']};--fg:${colors.foreground};--muted:${colors.descriptionForeground};--border:${colors['panel.border']};--hover:${colors['list.hoverBackground']};--focus:${colors.focusBorder};--selection:${colors['editor.selectionBackground']}`;
}

/** Runs in JavaScriptCore. The returned document needs no scripts or remote resources. */
export function renderPreview(model: PreviewModel): string {
  const fileDetails = [model.file_size, model.modified ? `Modified ${model.modified}` : null]
    .filter((value): value is string => !!value)
    .map(escape)
    .join(' · ');
  const summary = [
    `${String(model.nodes.length)} Data ${model.nodes.length === 1 ? 'Block' : 'Blocks'}`,
    ...(['View', 'Table'] as const).flatMap((kind) => {
      const count = model.nodes.filter((node) => node.kind === kind).length;
      return count ? [`${String(count)} ${kind}${count === 1 ? '' : 's'}`] : [];
    }),
    ...(() => {
      const count = model.nodes.filter((node) => !node.kind).length;
      return count ? [`${String(count)} unavailable`] : [];
    })(),
    ...(model.saved_sql_cells
      ? [
          `${String(model.saved_sql_cells)} saved SQL ${model.saved_sql_cells === 1 ? 'cell' : 'cells'}`,
        ]
      : []),
  ].join(' · ');
  const rows = model.nodes
    .map((node) => {
      const color = normalizeNodeColor(node.color);
      const name = escape(node.table_name);
      const content = `<span class="identity"${color ? ` style="--node-color:${color}"` : ''} aria-hidden="true"></span>
      <span class="name">${name}</span>
      <span class="kind">${escape(node.kind ?? 'Unavailable')}</span>
      <span class="count">${node.column_count == null ? '—' : `${String(node.column_count)} ${node.column_count === 1 ? 'column' : 'columns'}`}</span>`;
      if (!node.kind) {
        return `<article class="unavailable" aria-label="${name}. Object unavailable."><div class="row">${content}</div><p>This registered object is missing from the database.</p></article>`;
      }
      return `<details><summary class="row">${content}<svg class="chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg></summary>
      <table aria-label="Columns in ${name}"><thead><tr><th scope="col">Column</th><th scope="col">SQL type</th></tr></thead><tbody>${node.columns.map((column) => `<tr><th scope="row">${escape(column.name)}</th><td>${escape(column.type)}</td></tr>`).join('')}</tbody></table></details>`;
    })
    .join('');
  const body = model.message
    ? `<p class="notice" role="status">${escape(model.message)}</p>`
    : `<p class="summary">${escape(summary)}</p><section aria-labelledby="contents"><h2 id="contents">Data Blocks</h2>${
        model.nodes.length
          ? `<p class="hint">Expand a Data Block to inspect its columns. Data values are not loaded.</p><div class="blocks">${rows}</div>`
          : '<p class="notice">No visible Data Blocks.</p>'
      }</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
    <title>${escape(model.filename)}</title><style>
    :root{color-scheme:light dark;${palette('light-2026')}}
    @media(prefers-color-scheme:dark){:root{${palette('dark-2026')}}}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif}
    ::selection{background:var(--selection)}main{max-width:1000px;margin:auto;padding:32px}
    h1{margin:0;font-size:24px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}h2{margin:0;font-size:16px;font-weight:600}
    .description{max-width:70ch;margin:12px 0;white-space:pre-wrap;overflow-wrap:anywhere}.file-details{margin:12px 0 0;color:var(--muted)}
    .summary{margin:20px 0 0;padding:16px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums}
    section{margin-top:28px}.hint{margin:6px 0 16px;color:var(--muted)}.blocks{border-top:1px solid var(--border)}
    details,.unavailable{border-bottom:1px solid var(--border)}.row{display:grid;grid-template-columns:8px minmax(0,1fr) 72px 90px 16px;align-items:center;gap:12px;padding:15px 8px}
    summary{cursor:pointer;list-style:none}summary::-webkit-details-marker{display:none}summary::marker{content:''}summary:hover{background:var(--hover)}summary:focus-visible{outline:2px solid var(--focus);outline-offset:-2px}
    .identity{width:8px;height:8px;border-radius:50%;background:var(--node-color,var(--muted))}.name{font-weight:500;overflow-wrap:anywhere}.kind,.count{color:var(--muted)}.count{text-align:right;font-variant-numeric:tabular-nums}
    .chevron{fill:none;stroke:var(--muted);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}details[open] .chevron{transform:rotate(90deg)}
    table{width:calc(100% - 40px);margin:0 20px 20px;border-collapse:collapse;table-layout:fixed;font-size:13px}th,td{text-align:left;vertical-align:top;padding:8px 12px;overflow-wrap:anywhere;border-bottom:1px solid var(--border)}th{font-weight:400}thead th{color:var(--muted);font-weight:500}td{color:var(--muted)}
    .unavailable p{margin:0 28px 16px;color:var(--muted)}.notice{margin:24px 0;color:var(--muted)}
    @media(max-width:560px){main{padding:24px 16px}.row{grid-template-columns:8px minmax(0,1fr) auto 16px;gap:6px 10px}.name{grid-column:2/4}.kind{grid-column:2}.count{grid-column:3}.chevron{grid-column:4;grid-row:1/3}table{width:100%;margin:0 0 16px}th,td{padding:8px}}
    </style></head><body><main><header><h1>${escape(model.filename)}</h1>${model.description ? `<p class="description">${escape(model.description)}</p>` : ''}${fileDetails ? `<p class="file-details">${fileDetails}</p>` : ''}</header>${body}</main></body></html>`;
}
