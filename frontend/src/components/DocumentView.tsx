import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { PartnerLogos } from './help/PartnerLogos';
import 'katex/dist/katex.min.css';
import { BUNDLED_DOCUMENT_FILES, type DocumentTarget } from '@/tutorials/documentationRegistry';
import { APP_VERSION } from '@/config/env';
import { useZoom } from '@/hooks/useZoom';
import { useDocumentAnchor } from '@/hooks/useDocumentAnchor';
import { externalLink } from '@/lib/externalLink';

type DocumentType = 'tutorial' | 'information' | 'reference';

interface NavigationState {
  propTarget: DocumentTarget;
  currentTarget: DocumentTarget;
}

/** Document viewer presentation keyed by canonical help/info/reference kind. */
const DOC_CONFIG: Record<DocumentType, { title: string }> = {
  tutorial: { title: 'Help' },
  information: { title: 'Information' },
  reference: { title: 'References' },
};

/** Called by: DocumentView link handlers when resolving local markdown hrefs. */
const normalizePath = (input: string): string => {
  const segments = input.split('/');
  const stack: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return stack.join('/');
};

/** Called by: DocumentView markdown anchor rendering to identify links that should leave the modal. */
const isExternalLink = (href?: string | null): boolean => {
  if (!href) return false;
  return /^(https?:)?\/\//i.test(href) || href.startsWith('mailto:') || href.startsWith('tel:');
};

/** Resolves bundled documents against the desktop or server application URL. */
const resolveLocalDocUrl = (requestedFile: string): string => {
  if (typeof window === 'undefined') {
    return requestedFile;
  }

  const baseHref = document.querySelector('base')?.href;
  if (baseHref) {
    try {
      return new URL(requestedFile, baseHref).toString();
    } catch {
      // fall back to location-based resolution
    }
  }

  try {
    const base = window.location.href.split('#')[0];
    return new URL(requestedFile, base).toString();
  } catch {
    return requestedFile;
  }
};

/**
 * Resolves a requested doc file to the URL fetched by `DocumentView`.
 * Called by: DocumentView when constructing its bundled source.
 */
const resolveFromRoot = (requestedPath: string, root: string): string => {
  const rootWithSlash = root.endsWith('/') ? root : `${root}/`;
  return new URL(requestedPath.replace(/^\/+/, ''), rootWithSlash).toString();
};

const resolveAssetUrl = (
  requestedPath: string | undefined,
  sourceRoot: string,
): string | undefined => {
  if (!requestedPath || !sourceRoot || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(requestedPath)) {
    return requestedPath;
  }
  try {
    return resolveFromRoot(requestedPath, sourceRoot);
  } catch {
    return requestedPath;
  }
};

/**
 * Markdown document reader used by help dialogs and standalone documentation
 * routes. It owns loading, intra-doc navigation, anchor highlighting, and zoom
 * controls so help icons can open the same viewer for tutorials, information,
 * and references.
 * Why: all help/reference entry points need one markdown viewer that works for bundled, modal, and standalone docs.
 * Flow: fetch the registered bundled document, substitute its version, apply one anchor scroll and render navigation and zoom controls.
 */
function DocumentView({
  docType,
  onClose,
  target,
}: {
  docType: DocumentType;
  onClose?: () => void;
  target: DocumentTarget;
}) {
  const config = DOC_CONFIG[docType];
  const [content, setContent] = useState<string>('');
  const [loadedFile, setLoadedFile] = useState('');
  const documentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [documentSourceRoot, setDocumentSourceRoot] = useState<string>('');
  const [navigationState, setNavigationState] = useState<NavigationState>(() => ({
    propTarget: target,
    currentTarget: target,
  }));
  const currentTarget =
    navigationState.propTarget !== target ? target : navigationState.currentTarget;
  const activeAnchor = currentTarget.anchor;

  const { zoom, zoomIn, zoomOut, zoomReset } = useZoom({ keyboardShortcuts: true });

  const waiting = loading || loadedFile !== currentTarget.file;
  useDocumentAnchor({
    activeAnchor,
    loading: waiting,
    error,
    documentKey: currentTarget.file,
    documentRef,
    headerRef,
  });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    /**
     * Called by: DocumentView's markdown-loading effect whenever the selected file changes.
     * Fetch the registered bundled URL, substitute its version and update only the current document.
     */
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const requestedFile = currentTarget.file;
        if (!BUNDLED_DOCUMENT_FILES.has(requestedFile))
          throw new Error('Bundled document is unavailable');
        const response = await fetch(resolveLocalDocUrl(requestedFile), { signal });
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
        const text = await response.text();
        const rendered = text.replace(/\{\{\s*VERSION\s*\}\}/g, APP_VERSION);
        if (!signal.aborted) {
          setContent(rendered);
          setDocumentSourceRoot(resolveLocalDocUrl(''));
          setLoadedFile(currentTarget.file);
        }
      } catch (err: unknown) {
        if (!signal.aborted) {
          const message =
            err instanceof Error && err.message ? err.message : 'Failed to load document';
          setError(message);
          setLoadedFile(currentTarget.file);
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => {
      controller.abort();
    };
  }, [currentTarget.file]);

  /**
   * Markdown render overrides used by `ReactMarkdown` for safe image sizing and in-modal doc links.
   * Why: bundled docs should keep internal links inside the viewer while external links retain normal browser behavior.
   * Flow: constrain image sizing and alt text, rewrite internal markdown anchors to viewer state, then leave external links opening safely.
   */
  const markdownComponents: Components = {
    /** Called by: ReactMarkdown when rendering markdown image nodes inside DocumentView. */
    img: ({ node: _node, className, alt, src, ...props }) => {
      const mergedClassName = ['max-w-full h-auto', className].filter(Boolean).join(' ');
      const resolvedAlt = typeof alt === 'string' ? alt : '';
      return (
        <img
          {...props}
          src={resolveAssetUrl(src, documentSourceRoot)}
          className={mergedClassName.trim()}
          alt={resolvedAlt}
        />
      );
    },
    /**
     * Rewrites markdown anchors so document consumers stay inside the modal navigation flow.
     * Flow: resolve relative markdown hrefs against the current file, route internal `.md` links through navigation state, and pass external links through.
     */
    a: ({ node: _node, children, href, target: linkTarget, rel, ...props }) => {
      const baseFile = currentTarget.file;
      /**
       * Called by: the markdown anchor onClick prop to route internal links through DocumentView state.
       * Flow: parse the clicked href path/hash, resolve the next markdown file, prevent default navigation, then store the next file/anchor target.
       */
      const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!href || isExternalLink(href)) return;
        const [rawPath, rawHash] = href.split('#');
        const nextAnchor = rawHash ? rawHash.trim() : '';
        let nextFile = baseFile;
        if (rawPath?.trim()) {
          const trimmed = rawPath.trim();
          if (trimmed.startsWith('/')) {
            nextFile = normalizePath(trimmed.replace(/^\/+/, ''));
          } else {
            const baseDir = baseFile.includes('/')
              ? baseFile.slice(0, baseFile.lastIndexOf('/') + 1)
              : '';
            nextFile = normalizePath(`${baseDir}${trimmed}`);
          }
        }
        if (!nextFile.endsWith('.md')) return;
        event.preventDefault();
        setNavigationState({
          propTarget: target,
          currentTarget: {
            kind: currentTarget.kind,
            key: `link:${nextFile}#${nextAnchor}`,
            file: nextFile,
            anchor: nextAnchor,
          },
        });
      };

      if (isExternalLink(href)) {
        return (
          <a
            {...props}
            href={href}
            onClick={externalLink}
            target={linkTarget ?? '_blank'}
            rel={rel ?? 'noopener noreferrer'}
          >
            {children}
          </a>
        );
      }

      const renderedHref =
        href?.endsWith('.md') || href?.includes('.md#')
          ? href
          : resolveAssetUrl(href, documentSourceRoot);
      return (
        <a {...props} href={renderedHref} onClick={handleClick}>
          {children}
        </a>
      );
    },
  };

  return (
    <div ref={documentRef} className="@container/document min-h-screen bg-editor">
      <header
        ref={headerRef}
        className="sticky top-0 z-20 border-b border-surface-border bg-surface px-4 py-3 pr-12"
      >
        <div className="flex flex-col gap-3 @min-[560px]/document:flex-row @min-[560px]/document:items-center @min-[560px]/document:justify-between">
          <div className="flex min-w-0 flex-col items-start gap-2">
            <h1 className="text-heading-2 font-semibold text-foreground">{config.title}</h1>
            <PartnerLogos />
          </div>
          <div className="flex flex-wrap items-center gap-3 @min-[560px]/document:justify-end">
            <button
              type="button"
              className="text-body text-link hover:text-link whitespace-nowrap"
              onClick={() => {
                if (onClose) {
                  onClose();
                } else {
                  window.location.assign('/');
                }
              }}
            >
              {onClose ? 'Close' : 'Back to app'}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={zoomOut}
                className="px-2 py-1 rounded-sm border border-input-border text-foreground hover:bg-panel/60"
                aria-label="Zoom out"
                title="Zoom out (Ctrl/Cmd -)"
              >
                −
              </button>
              <button
                type="button"
                onClick={zoomReset}
                className="px-2 py-1 rounded-sm border border-input-border text-foreground hover:bg-panel/60 min-w-16"
                aria-label="Reset zoom"
                title="Reset zoom (Ctrl/Cmd 0)"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={zoomIn}
                className="px-2 py-1 rounded-sm border border-input-border text-foreground hover:bg-panel/60"
                aria-label="Zoom in"
                title="Zoom in (Ctrl/Cmd +)"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto bg-surface rounded-lg border border-surface-border mt-6 mb-10 p-6">
        <div
          className="prose prose-vscode prose-img:mx-auto mx-auto"
          style={{
            transform: `scale(${String(zoom)})`,
            transformOrigin: 'top center',
          }}
        >
          {waiting && <div className="text-center text-description">Loading…</div>}
          {error && <div className="text-error">{error}</div>}
          {!waiting && !error && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeRaw, rehypeKatex]}
              components={markdownComponents}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>
      </main>
    </div>
  );
}

export default DocumentView;
