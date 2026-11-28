import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { PartnerLogos } from '@/components/help/PartnerLogos';
import 'katex/dist/katex.min.css';
import { BUNDLED_DOCUMENT_FILES, type DocumentTarget } from '@/tutorials/documentationRegistry';
import {
  APP_VERSION,
  APP_BUILD_DATE,
  APP_BUILD,
  APP_COMMIT_URL,
  getDocsBaseUrl,
} from '@/config/env';
import { useZoom } from '@/hooks/useZoom';
import { DocImageViewer, type DocImage } from '@/components/DocImageViewer';
import { useDocumentAnchor } from '@/hooks/useDocumentAnchor';

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

/** Called by: resolveDocUrl when bundled docs need desktop/web base-path resolution. */
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
 * Called by: DocumentView when constructing its bundled fallback source.
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

/** Above 1 darkens light greys in screenshots; white and black stay put. */
const DOC_IMAGE_GAMMA = 1.4;

/** Height of the pinned header, so anchors scroll to just below it. */
const useElementHeight = (ref: React.RefObject<HTMLElement | null>): number => {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setHeight(element.getBoundingClientRect().height);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return height;
};

/**
 * Markdown document reader used by help dialogs and standalone documentation
 * routes. It owns loading, intra-doc navigation, anchor highlighting, and zoom
 * controls so help icons can open the same viewer for tutorials, information,
 * and references.
 * Why: all help/reference entry points need one markdown viewer that works for bundled, remote, modal, and standalone docs.
 * Flow: resolve the active document target, fetch markdown with build placeholders, sync anchors and zoom state, then render markdown navigation controls.
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

  // The picture being shown larger, and the button that opened it, where focus returns.
  const [enlargedImage, setEnlargedImage] = useState<{
    image: DocImage;
    opener: HTMLButtonElement;
  } | null>(null);
  // While an image is enlarged the zoom keys belong to its viewer, not the text behind it.
  const { zoom, zoomIn, zoomOut, zoomReset } = useZoom({
    keyboardShortcuts: enlargedImage === null,
  });
  const headerRef = useRef<HTMLElement | null>(null);
  const headerHeight = useElementHeight(headerRef);

  useDocumentAnchor({ activeAnchor, loading, error });

  useEffect(() => {
    let cancelled = false;
    /**
     * Called by: DocumentView's markdown-loading effect whenever the selected file changes.
     * Flow: derive the requested doc URL, fetch markdown without cache, replace build placeholders, then update content/error/loading if still mounted.
     */
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const requestedFile = currentTarget.file;
        const remoteBase = getDocsBaseUrl();
        const localRoot = resolveLocalDocUrl('');
        const sources: { url: string; root: string }[] = [];
        if (remoteBase) {
          sources.push({ url: resolveFromRoot(requestedFile, remoteBase), root: remoteBase });
        }
        if (!remoteBase || BUNDLED_DOCUMENT_FILES.has(requestedFile)) {
          sources.push({ url: resolveLocalDocUrl(requestedFile), root: localRoot });
        }

        let text: string | null = null;
        let sourceRoot = '';
        let lastError: Error = new Error("Couldn't load document");
        for (const source of sources) {
          try {
            const resp = await fetch(source.url, { cache: 'no-store' });
            if (!resp.ok) {
              lastError = new Error(`HTTP ${String(resp.status)}`);
              continue;
            }
            text = await resp.text();
            sourceRoot = source.root;
            break;
          } catch (sourceError: unknown) {
            lastError =
              sourceError instanceof Error ? sourceError : new Error("Couldn't load document");
          }
        }
        if (text === null) throw lastError;
        // Substitute build-time placeholders so docs like
        // `references/general.md` can show the current app version /
        // build date without manual edits per release. Inserted via
        // Vite's `define` (see vite.config.ts).
        // `<span data-build-commit></span>` links the exact commit, or
        // disappears when the build has none. It is an empty element rather
        // than a {{...}} placeholder because the published docs also reach
        // older 0.7 apps, which render an empty span as nothing.
        const buildCommit = APP_COMMIT_URL ? `, commit [${APP_BUILD}](${APP_COMMIT_URL})` : '';
        const rendered = text
          .replace(/<span data-build-commit><\/span>/g, buildCommit)
          .replace(/\{\{\s*VERSION\s*\}\}/g, APP_VERSION)
          .replace(/\{\{\s*BUILD_DATE\s*\}\}/g, APP_BUILD_DATE)
          .replace(/\{\{\s*BUILD\s*\}\}/g, APP_BUILD);
        if (!cancelled) {
          setContent(rendered);
          setDocumentSourceRoot(sourceRoot);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error && err.message ? err.message : "Couldn't load document";
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [currentTarget.file]);

  /**
   * Markdown render overrides used by `ReactMarkdown` for safe image sizing and in-modal doc links.
   * Why: bundled docs should keep internal links inside the viewer while external links retain normal browser behavior.
   * Flow: constrain image sizing and alt text, rewrite internal markdown anchors to viewer state, then leave external links opening safely.
   *
   * useMemo is needed here, not an optimisation: ReactMarkdown uses these
   * functions as element types, so new functions on a render make React throw
   * away and rebuild every image and link in the document. That happened on
   * each zoom step, and it would lose the picture that opened the image
   * viewer, which takes the focus back when the viewer closes. (React Compiler
   * skips this component: the loader above uses try/finally.)
   */
  const markdownComponents = useMemo<Components>(
    () => ({
      /**
       * Called by: ReactMarkdown when rendering markdown image nodes inside DocumentView.
       * A picture is a button that opens it in `DocImageViewer`, where it is not
       * held to the width of the text. An image with its own inline style is an
       * icon set in a line of text (the cite mark in the Data Loader guide) and
       * stays a plain image.
       */
      img: ({ node: _node, className, alt, src, style, ...props }) => {
        const resolvedAlt = typeof alt === 'string' ? alt : '';
        const resolvedSrc = resolveAssetUrl(src, documentSourceRoot);
        // The button below carries an enlargeable picture's margins instead.
        const enlargeable = !style && resolvedSrc !== undefined && resolvedSrc !== '';
        const image = (
          <img
            {...props}
            style={style}
            src={resolvedSrc}
            className={['max-w-full h-auto', enlargeable ? 'my-0' : '', className]
              .filter(Boolean)
              .join(' ')}
            alt={resolvedAlt}
          />
        );
        if (!enlargeable) return image;
        return (
          // my-[2em] is the prose default for a picture; on the button, the focus ring hugs the picture.
          <button
            type="button"
            className="mx-auto my-[2em] block w-fit max-w-full cursor-zoom-in rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            aria-label={resolvedAlt ? `Enlarge image: ${resolvedAlt}` : 'Enlarge image'}
            title="Enlarge image"
            onClick={(event) => {
              setEnlargedImage({
                image: { src: resolvedSrc, alt: resolvedAlt },
                opener: event.currentTarget,
              });
            }}
          >
            {image}
          </button>
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
    }),
    [currentTarget, documentSourceRoot, target],
  );

  return (
    <div
      className="min-h-screen bg-editor"
      style={{ '--doc-header-offset': `${String(headerHeight + 16)}px` } as React.CSSProperties}
    >
      {/* Gamma curve for screenshots (see .doc-prose img in index.css; why: issue 262). */}
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <defs>
          <filter id="doc-image-gamma" colorInterpolationFilters="sRGB">
            <feComponentTransfer>
              <feFuncR type="gamma" exponent={DOC_IMAGE_GAMMA} />
              <feFuncG type="gamma" exponent={DOC_IMAGE_GAMMA} />
              <feFuncB type="gamma" exponent={DOC_IMAGE_GAMMA} />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      {/* Pinned while the page scrolls: title, partner logos, then window controls (issue 262). */}
      <header
        ref={headerRef}
        className="sticky top-0 z-10 bg-surface border-b border-surface-border px-10 py-3"
      >
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] md:items-center md:gap-x-2">
          <h1 className="text-heading-2 font-semibold text-foreground">{config.title}</h1>
          <div className="flex justify-start md:justify-center">
            <PartnerLogos />
          </div>
          <div className="flex flex-wrap items-center gap-3 md:flex-nowrap md:justify-end">
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
          className="prose doc-prose prose-img:mx-auto mx-auto"
          // CSS zoom lays the text out again at the new size, so it stays
          // sharp and wraps inside the card. transform: scale() enlarged a
          // finished picture: blurry in the desktop app, and cut off at the
          // left. --doc-zoom lets index.css keep anchor offsets in screen px.
          style={{ zoom, '--doc-zoom': zoom } as React.CSSProperties}
        >
          {loading && <div className="text-center text-description">Loading…</div>}
          {error && <div className="text-error">{error}</div>}
          {!loading && !error && (
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
      {enlargedImage && (
        <DocImageViewer
          key={enlargedImage.image.src}
          image={enlargedImage.image}
          returnFocusTo={enlargedImage.opener}
          onClose={() => {
            setEnlargedImage(null);
          }}
        />
      )}
    </div>
  );
}

export default DocumentView;
