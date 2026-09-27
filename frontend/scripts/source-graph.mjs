import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
export const entries = ['src/index.tsx', 'src/updater/index.tsx', 'src/features/quicklook/render.ts'];
export function dependencies(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const imports = new Set();
  function visit(node) {
    const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0]
      : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
    if (specifier && ts.isStringLiteral(specifier)) {
      const resolved = ts.resolveModuleName(specifier.text, file, options, ts.sys).resolvedModule?.resolvedFileName;
      if (resolved?.startsWith(path.resolve(root, '../archive') + path.sep))
        throw new Error(`Production source imports archived code: ${file} -> ${specifier.text}`);
      if (resolved && resolved.startsWith(path.join(root, 'src') + path.sep)) imports.add(resolved);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...imports];
}
export function sourceGraph(start = entries) {
  const seen = new Set();
  const queue = start.map((entry) => path.resolve(root, entry));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...dependencies(file));
  }
  return seen;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const reachable = sourceGraph();
  const files = fs.readdirSync(path.join(root, 'src'), { recursive: true })
    .map(name => name.split(path.sep).join('/'))
    .filter((name) => /\.(ts|tsx)$/.test(name) && !/(\.test\.|\.spec\.|__tests__|^test\/|\.d\.ts$)/.test(name));
  const unused = files.filter((name) => !reachable.has(path.join(root, 'src', name)));
  console.log(JSON.stringify({ reachable: reachable.size, unused }, null, 2));
  if (process.argv.includes('--check') && unused.length) process.exitCode = 1;
}
