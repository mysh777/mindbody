// Charts reference clip paths and gradients by id. In the clone those ids are duplicates, and the browser resolves
// them to the originals inside the hidden #root, so bars and lines disappear on paper. Give the clone its own ids.
function isolateSvgIds(root: HTMLElement) {
  const renamed = new Map<string, string>();
  root.querySelectorAll('svg [id]').forEach(el => {
    const next = `${el.id}-print`;
    renamed.set(el.id, next);
    el.id = next;
  });
  if (renamed.size === 0) return;
  const urlRef = /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g;
  root.querySelectorAll('svg *').forEach(el => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.includes('url(')) {
        el.setAttribute(attr.name, attr.value.replace(urlRef, (m, id) => (renamed.has(id) ? `url(#${renamed.get(id)})` : m)));
      } else if ((attr.name === 'href' || attr.name === 'xlink:href') && attr.value.startsWith('#') && renamed.has(attr.value.slice(1))) {
        el.setAttribute(attr.name, `#${renamed.get(attr.value.slice(1))}`);
      }
    }
  });
}

// Responsive charts carry their on-screen pixel width; on paper they must scale to the page instead of overflowing or collapsing.
// The responsive container also wraps each chart in a zero-size box, which collapses the chart to 0x0 on paper.
function makeChartsScalable(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.recharts-wrapper').forEach(wrapper => {
    const svg = wrapper.querySelector<SVGSVGElement>(':scope > svg.recharts-surface');
    const w = Number(svg?.getAttribute('width'));
    const h = Number(svg?.getAttribute('height'));
    if (!svg || !w || !h) return;
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.cssText = `display:block;width:100%;height:auto;aspect-ratio:${w} / ${h};max-height:6cm;`;

    for (let el: HTMLElement | null = wrapper; el && el !== root; el = el.parentElement) {
      el.style.width = '100%';
      el.style.height = 'auto';
      el.style.maxHeight = 'none';
      el.style.minWidth = '0';
      if (el.classList.contains('recharts-responsive-container')) break;
    }
    wrapper.style.position = 'relative';
    wrapper.querySelectorAll<HTMLElement>('.recharts-legend-wrapper').forEach(legend => {
      legend.style.position = 'static';
      legend.style.width = 'auto';
      legend.style.height = 'auto';
    });
  });
  root.querySelectorAll<HTMLElement>('.recharts-tooltip-wrapper').forEach(el => el.remove());
}

// ─── File-name builder ───

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function safeName(s: string): string {
  return stripDiacritics(s)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function compactRange(start: string, end: string): string {
  if (start === end) return start;
  if (start.slice(0, 7) === end.slice(0, 7)) return start.slice(0, 7);
  return `${start}_${end}`;
}

export interface PrintFileNameParts {
  report: string;
  period?: string;
  location?: string;
  detail?: string;
}

export function buildPrintFileName(parts: PrintFileNameParts): string {
  const segments = [
    'BREEZE',
    safeName(parts.report),
    parts.period ? safeName(parts.period) : todayISO(),
    parts.location ? safeName(parts.location) : 'All',
    parts.detail ? safeName(parts.detail) : '',
  ].filter(Boolean);
  const name = segments.join('_').slice(0, 80);
  return name;
}

// Helper for single-month periods (YYYY-MM)
export function monthPeriod(monthStr: string): string {
  return monthStr;
}

// Helper for date ranges
export function rangePeriod(start: string, end: string): string {
  return compactRange(start, end);
}

export function locationLabel(id: string, fallback?: string): string {
  if (!id || id === 'all') return 'All';
  return fallback || id;
}

export function todayPeriod(): string {
  return todayISO();
}

// ─── Print dispatcher ───

export interface PrintOptions {
  summary?: boolean;
  fileName?: string;
  orientation?: 'portrait' | 'landscape';
}

export function handlePrint(containerRef: React.RefObject<HTMLElement | null>, options: PrintOptions = {}) {
  const source = containerRef.current?.querySelector('.print-report');
  if (!source) {
    window.print();
    return;
  }

  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.remove('hidden', 'print-report');
  clone.classList.add('print-clone');
  if (options.summary) clone.classList.add('print-summary');
  if (options.orientation === 'portrait') clone.classList.add('print-portrait');
  clone.style.display = 'block';
  isolateSvgIds(clone);
  makeChartsScalable(clone);
  document.body.appendChild(clone);

  const prevTitle = document.title;
  if (options.fileName) {
    document.title = options.fileName;
  }

  const cleanup = () => {
    document.title = prevTitle;
    clone.remove();
  };

  try {
    window.print();
  } finally {
    // afterprint fires in most browsers; fallback timeout covers Safari/edge cases
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 500);
  }
}
