import type {
  FileTreeDirectory,
  FileTreeFile,
  FileTreeNode,
} from '@/features/views/data-loader/types';

const README_FILENAME = 'README.md';
export const FILE_DRAG_MIME_TYPE = 'application/x-ldaca-file-path';

/**
 * Projects the complete User File tree into the Data Loader's presentation:
 * unsupported file leaves disappear while every directory remains visible.
 * Used by `useFiles` after the backend resource list is normalized.
 */
export function filterLoadableFileTree(nodes: FileTreeNode[]): FileTreeNode[] {
  const filtered: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      if (node.loadable === true) filtered.push(node);
      continue;
    }
    filtered.push({ ...node, children: filterLoadableFileTree(node.children) });
  }
  return filtered;
}

/**
 * Counts visible data files below a file-tree node. Data Loader excludes README
 * citation files from totals because they are shown as folder metadata instead.
 * Used by `DataLoaderFeature` to summarize the server file tree.
 */
export function countFilesInNode(node: FileTreeNode): number {
  if (node.type === 'file') {
    return node.name.toLowerCase() === README_FILENAME.toLowerCase() ? 0 : 1;
  }
  return node.children.reduce((sum, child) => sum + countFilesInNode(child), 0);
}

/**
 * Finds the README citation file attached to a directory. `FileTree` uses this
 * to expose citation viewing without rendering README.md as a normal data file.
 * Used by: FileTree component.
 */
export function getCitationFile(directory: FileTreeDirectory): FileTreeFile | null {
  const child = directory.children.find(
    (candidate): candidate is FileTreeFile =>
      candidate.type === 'file' && candidate.name.toLowerCase() === README_FILENAME.toLowerCase(),
  );
  return child ?? null;
}

/**
 * Returns children that should appear in the file browser, hiding citation
 * README files that are represented by the folder citation action.
 * Used by: FileTree component.
 */
export function getVisibleDirectoryChildren(directory: FileTreeDirectory): FileTreeNode[] {
  return directory.children.filter(
    (child) => child.type !== 'file' || child.name.toLowerCase() !== README_FILENAME.toLowerCase(),
  );
}

/**
 * Derives a file's parent directory path for drag-to-move checks and drop
 * target routing in `FileTree`.
 * Used by: FileTree component.
 */
export function getParentDirectoryPath(filePath: string): string {
  const lastSlashIndex = filePath.lastIndexOf('/');
  return lastSlashIndex === -1 ? '' : filePath.slice(0, lastSlashIndex);
}

/**
 * Loadable table formats that become one Data Block each in a folder's Tables
 * mode (issue 136). Mirrors the non-text, non-ZIP entries of the backend's
 * `LOADABLE_FILE_TYPES`.
 */
const TABLE_EXTENSIONS = new Set([
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.ndjson',
  '.parquet',
  '.avro',
  '.arrow',
  '.ipc',
  '.feather',
  '.xlsx',
  '.xls',
  '.xlsm',
  '.xlsb',
  '.ods',
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/** Returns every table file below a folder, in path order, including subfolders. */
export function tableFilesInDirectory(directory: FileTreeDirectory): FileTreeFile[] {
  const files: FileTreeFile[] = [];
  const visit = (nodes: FileTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === 'directory') visit(node.children);
      else if (TABLE_EXTENSIONS.has(extensionOf(node.name))) files.push(node);
    }
  };
  visit(directory.children);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

/** Finds one directory node by its path. */
export function findDirectory(nodes: FileTreeNode[], path: string): FileTreeDirectory | null {
  for (const node of nodes) {
    if (node.type !== 'directory') continue;
    if (node.path === path) return node;
    const nested = findDirectory(node.children, path);
    if (nested) return nested;
  }
  return null;
}

/** Whether `path` is `ancestor` itself or lies inside it. */
const isSameOrInside = (path: string, ancestor: string) =>
  path === ancestor || path.startsWith(`${ancestor}/`);

/** Drops selected paths already covered by a selected ancestor folder. */
export const selectionRoots = (paths: Iterable<string>): string[] => {
  const sorted = [...new Set(paths)].sort();
  const roots: string[] = [];
  for (const path of sorted) {
    if (!roots.some((root) => isSameOrInside(path, root))) roots.push(path);
  }
  return roots;
};

/** A drop is valid unless a folder would go into itself, and something must move. */
export const canMoveInto = (sourcePaths: string[], targetDirectoryPath: string): boolean => {
  if (sourcePaths.length === 0) return false;
  if (sourcePaths.some((path) => isSameOrInside(targetDirectoryPath, path))) return false;
  return sourcePaths.some((path) => getParentDirectoryPath(path) !== targetDirectoryPath);
};
