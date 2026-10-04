/** One topic as the Topic Modelling interactive HTML download shows it (issue 279). */
interface TopicBubbleHtmlTopic {
  id: number;
  /** Representative words in the app's order, with their counts. */
  words: { word: string; count: number }[];
  /** The size chips the app's hover card shows (issue 280). */
  sizes: {
    kind: 'groups' | 'corpora';
    chips: { text: string; color: string; textColor: string; title?: string }[];
    total: number | null | undefined;
  } | null;
}

export interface TopicBubbleHtmlPayload {
  topics: TopicBubbleHtmlTopic[];
  /** The topic search text when the file was made. */
  query: string;
  width: number;
  height: number;
}

/**
 * Wires up the downloaded bubble chart: the filter box fades topics whose
 * words do not match (the app's own matcher, embedded), a hover card shows a
 * topic's words sized by count and its sizes, and the chart pans (drag) and
 * zooms (wheel). Self-contained on purpose: the download embeds this
 * function's source and calls it with the payload and the app's topic
 * matcher (`matchTopicWords` over `matchChecklistOption`), so it must not use
 * anything outside its body.
 */
export function runTopicBubbleHtml(
  payload: TopicBubbleHtmlPayload,
  match: (words: string[], query: string) => boolean,
): void {
  const FADED = '0.18';
  const MIN_FONT = 11;
  const MAX_FONT = 22;
  const svg = document.querySelector<SVGSVGElement>('#chart svg');
  const input = document.querySelector<HTMLInputElement>('#filter');
  const status = document.querySelector<HTMLElement>('#filter-status');
  const card = document.querySelector<HTMLElement>('#card');
  if (!svg || !input || !status || !card) return;
  const topics = new Map(payload.topics.map((topic) => [String(topic.id), topic]));
  const groups = Array.from(svg.querySelectorAll<SVGGElement>('[data-topic-id]'));

  const applyFilter = () => {
    const query = input.value;
    let matched = 0;
    for (const group of groups) {
      const topic = topics.get(group.dataset.topicId ?? '');
      const isMatch = match(topic ? topic.words.map((entry) => entry.word) : [], query);
      if (isMatch) matched += 1;
      if (isMatch) group.removeAttribute('opacity');
      else group.setAttribute('opacity', FADED);
    }
    status.textContent = query.trim()
      ? `${String(matched)} of ${String(groups.length)} topics match`
      : `${String(groups.length)} topics`;
  };
  input.value = payload.query;
  input.addEventListener('input', applyFilter);
  applyFilter();

  const showCard = (group: SVGGElement, event: MouseEvent) => {
    const topic = topics.get(group.dataset.topicId ?? '');
    if (!topic) return;
    // Font size follows the square root of the count, as in the app's cloud.
    const roots = topic.words.map((entry) => Math.sqrt(Math.max(0, entry.count)));
    const low = Math.min(...roots);
    const high = Math.max(...roots);
    card.replaceChildren();
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = `Topic ${String(topic.id)}`;
    const words = document.createElement('div');
    words.className = 'card-words';
    topic.words.forEach((entry, index) => {
      const span = document.createElement('span');
      const share = high > low ? ((roots[index] ?? low) - low) / (high - low) : 1;
      span.style.fontSize = `${String(Math.round(MIN_FONT + share * (MAX_FONT - MIN_FONT)))}px`;
      span.textContent = entry.word;
      span.title = `${entry.word}: ${String(entry.count)}`;
      words.append(span);
    });
    // The same chips as the app's card: one per colour-by value, or one per
    // Data Block joined by "+", then "= total".
    const sizes = document.createElement('div');
    sizes.className = 'card-sizes';
    topic.sizes?.chips.forEach((chip, index) => {
      if (index > 0 && topic.sizes?.kind === 'corpora') {
        const plus = document.createElement('span');
        plus.className = 'card-sum';
        plus.textContent = '+';
        sizes.append(plus);
      }
      const span = document.createElement('span');
      span.className = 'card-chip';
      span.style.background = chip.color;
      span.style.color = chip.textColor;
      span.textContent = chip.text;
      if (chip.title) span.title = chip.title;
      sizes.append(span);
    });
    if (topic.sizes) {
      const sum = document.createElement('span');
      sum.className = 'card-sum';
      sum.textContent = `= ${String(topic.sizes.total ?? '')}`;
      sizes.append(sum);
    }
    card.append(title, words, sizes);
    card.hidden = false;
    const margin = 14;
    const left = Math.min(event.clientX + margin, window.innerWidth - card.offsetWidth - margin);
    const top = Math.min(event.clientY + margin, window.innerHeight - card.offsetHeight - margin);
    card.style.left = `${String(Math.max(margin, left))}px`;
    card.style.top = `${String(Math.max(margin, top))}px`;
  };
  for (const group of groups) {
    group.style.cursor = 'pointer';
    group.addEventListener('mousemove', (event) => {
      showCard(group, event);
    });
    group.addEventListener('mouseleave', () => {
      card.hidden = true;
    });
  }

  // Pan and zoom by changing the viewBox.
  const view = { x: 0, y: 0, width: payload.width, height: payload.height };
  const applyView = () => {
    svg.setAttribute(
      'viewBox',
      `${String(view.x)} ${String(view.y)} ${String(view.width)} ${String(view.height)}`,
    );
  };
  svg.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const box = svg.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 0.9 : 1 / 0.9;
      const px = view.x + ((event.clientX - box.left) / box.width) * view.width;
      const py = view.y + ((event.clientY - box.top) / box.height) * view.height;
      view.width *= factor;
      view.height *= factor;
      view.x = px - ((event.clientX - box.left) / box.width) * view.width;
      view.y = py - ((event.clientY - box.top) / box.height) * view.height;
      applyView();
    },
    { passive: false },
  );
  let drag: { x: number; y: number } | null = null;
  svg.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, y: event.clientY };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const box = svg.getBoundingClientRect();
    view.x -= ((event.clientX - drag.x) / box.width) * view.width;
    view.y -= ((event.clientY - drag.y) / box.height) * view.height;
    drag = { x: event.clientX, y: event.clientY };
    applyView();
  });
  svg.addEventListener('pointerup', () => {
    drag = null;
  });
  document.querySelector('#reset')?.addEventListener('click', () => {
    view.x = 0;
    view.y = 0;
    view.width = payload.width;
    view.height = payload.height;
    applyView();
  });
}
