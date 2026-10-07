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
    svg.style.cssText = `display:block;width:100%;height:auto;aspect-ratio:${w} / ${h};`;

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

export function handlePrint(containerRef: React.RefObject<HTMLElement | null>, options: { summary?: boolean } = {}) {
  const source = containerRef.current?.querySelector('.print-report');
  if (!source) {
    window.print();
    return;
  }

  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.remove('hidden', 'print-report');
  clone.classList.add('print-clone');
  if (options.summary) clone.classList.add('print-summary');
  clone.style.display = 'block';
  isolateSvgIds(clone);
  makeChartsScalable(clone);
  document.body.appendChild(clone);

  try {
    window.print();
  } finally {
    document.body.removeChild(clone);
  }
}
