import katex from 'katex';
import { spokenMathToLatex } from '@/utils/spokenMathToLatex';

const OPERATOR_MAP: Record<string, string> = {
  '−': '-',
  '–': '-',
  '—': '\\text{---}',
  '×': '\\times ',
  '÷': '\\div ',
  '⋅': '\\cdot ',
  '·': '\\cdot ',
  '≤': '\\le ',
  '≥': '\\ge ',
  '≠': '\\ne ',
  '≡': '\\equiv ',
  '±': '\\pm ',
  '∓': '\\mp ',
  '∞': '\\infty ',
  '≈': '\\approx ',
  '≅': '\\cong ',
  '∼': '\\sim ',
  '∝': '\\propto ',
  '°': '^\\circ ',
  '′': "'",
  '″': "''",
  'π': '\\pi ',
  'θ': '\\theta ',
  'α': '\\alpha ',
  'β': '\\beta ',
  'γ': '\\gamma ',
  'Δ': '\\Delta ',
  'λ': '\\lambda ',
  'μ': '\\mu ',
  'σ': '\\sigma ',
  'ω': '\\omega ',
  '∠': '\\angle ',
  '∡': '\\measuredangle ',
  '⊥': '\\perp ',
  '∥': '\\parallel ',
  '△': '\\triangle ',
  '□': '\\square ',
  '∘': '\\circ ',
  '•': '\\bullet ',
  '√': '\\surd ',
  '→': '\\rightarrow ',
  '←': '\\leftarrow ',
  '↔': '\\leftrightarrow ',
  '⇒': '\\Rightarrow ',
  '⇐': '\\Leftarrow ',
  '⇔': '\\Leftrightarrow ',
  '︵': '\\frown ',
  '⌒': '\\frown ',
  '⌢': '\\frown ',
  '$': '\\text{\\$}',
  '%': '\\%',
  '&': '\\text{\\&}',
  '#': '\\#',
  '_': '\\_',
  '{': '\\{',
  '}': '\\}',
};

function stripInvisibleMathChars(str: string): string {
  return str
    .replace(/[\u200B-\u200D\u2060-\u2064\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ');
}

function escapeTextForLatex(text: string): string {
  let out = stripInvisibleMathChars(text);
  for (const [char, replacement] of Object.entries(OPERATOR_MAP)) {
    out = out.split(char).join(replacement);
  }
  return out;
}

function mapFenceDelimiter(delim: string): string {
  const trimmed = stripInvisibleMathChars(delim).trim();
  if (!trimmed) return '.';
  if (trimmed === '{') return '\\{';
  if (trimmed === '}') return '\\}';
  if (trimmed === '|' || trimmed === '∣') return '|';
  if (trimmed === '‖' || trimmed === '||') return '\\Vert ';
  if (trimmed === '⌊') return '\\lfloor ';
  if (trimmed === '⌋') return '\\rfloor ';
  if (trimmed === '⌈') return '\\lceil ';
  if (trimmed === '⌉') return '\\rceil ';
  if (trimmed === '⟨' || trimmed === '〈') return '\\langle ';
  if (trimmed === '⟩' || trimmed === '〉') return '\\rangle ';
  return trimmed;
}

function convertChildrenWithRadicalCheck(children: Node[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < children.length) {
    const node = children[i];
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase().replace(/^m:/, '');
      const txt = stripInvisibleMathChars(el.textContent || '').trim();
      if ((tag === 'mo' || tag === 'mi') && txt === '√') {
        // Look ahead for the next element sibling to wrap in \sqrt{...}
        let nextIdx = i + 1;
        while (
          nextIdx < children.length &&
          children[nextIdx].nodeType === Node.TEXT_NODE &&
          !(children[nextIdx].textContent || '').trim()
        ) {
          nextIdx++;
        }
        if (nextIdx < children.length) {
          const radContent = mathmlNodeToLatex(children[nextIdx]);
          parts.push(`\\sqrt{${radContent}}`);
          i = nextIdx + 1;
          continue;
        }
      }
    }
    parts.push(mathmlNodeToLatex(node));
    i++;
  }
  return parts.join('');
}

function mathmlNodeToLatex(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeTextForLatex((node.textContent || '').trim());
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as Element;
  const tag = el.tagName.toLowerCase().replace(/^m:/, '');
  const children = Array.from(el.childNodes);
  const childLatex = () => convertChildrenWithRadicalCheck(children);

  switch (tag) {
    case 'math':
    case 'mrow':
    case 'mstyle':
    case 'mpadded':
    case 'mphantom':
      return childLatex();

    case 'semantics': {
      const texAnnotation = el.querySelector(
        'annotation[encoding*="tex"], annotation[encoding*="TeX"], annotation[encoding*="LaTeX"]'
      );
      if (texAnnotation && texAnnotation.textContent?.trim()) {
        return texAnnotation.textContent.trim();
      }
      const firstElem = el.firstElementChild;
      return firstElem ? mathmlNodeToLatex(firstElem) : childLatex();
    }

    case 'annotation':
    case 'annotation-xml':
      return '';

    case 'mi': {
      const txt = stripInvisibleMathChars(el.textContent || '').trim();
      if (!txt) return '';
      if (OPERATOR_MAP[txt]) return OPERATOR_MAP[txt];
      if (txt.length > 1) {
        if (
          [
            'sin',
            'cos',
            'tan',
            'sec',
            'csc',
            'cot',
            'arcsin',
            'arccos',
            'arctan',
            'log',
            'ln',
            'lim',
            'max',
            'min',
          ].includes(txt)
        ) {
          return `\\${txt} `;
        }
        return `\\text{${escapeTextForLatex(txt)}}`;
      }
      return escapeTextForLatex(txt);
    }

    case 'mn': {
      const txt = stripInvisibleMathChars(el.textContent || '').trim();
      return escapeTextForLatex(txt);
    }

    case 'mo': {
      const txt = stripInvisibleMathChars(el.textContent || '').trim();
      if (!txt) return '';
      if (OPERATOR_MAP[txt]) return OPERATOR_MAP[txt];
      if (
        txt === '(' ||
        txt === ')' ||
        txt === '[' ||
        txt === ']' ||
        txt === '+' ||
        txt === '-' ||
        txt === '=' ||
        txt === '<' ||
        txt === '>' ||
        txt === ',' ||
        txt === ':' ||
        txt === ';' ||
        txt === '!' ||
        txt === '|' ||
        txt === '/'
      ) {
        return txt;
      }
      return escapeTextForLatex(txt);
    }

    case 'mtext': {
      const txt = stripInvisibleMathChars(el.textContent || '');
      if (!txt.trim()) return '\\; ';
      return `\\text{${escapeTextForLatex(txt)}}`;
    }

    case 'mspace':
      return `\\; ${childLatex()}`;

    case 'mfrac': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 2) {
        const num = mathmlNodeToLatex(elemChildren[0]);
        const den = mathmlNodeToLatex(elemChildren[1]);
        return `\\frac{${num}}{${den}}`;
      }
      return childLatex();
    }

    case 'msqrt':
      return `\\sqrt{${childLatex()}}`;

    case 'mroot': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 2) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const index = mathmlNodeToLatex(elemChildren[1]);
        return `\\sqrt[${index}]{${base}}`;
      }
      return `\\sqrt{${childLatex()}}`;
    }

    case 'menclose': {
      const notation = (el.getAttribute('notation') || 'longdiv').toLowerCase();
      const inner = childLatex();
      if (notation.includes('radical')) {
        return `\\sqrt{${inner}}`;
      }
      if (notation.includes('top') || notation.includes('actuarial')) {
        return `\\overline{${inner}}`;
      }
      if (notation.includes('bottom')) {
        return `\\underline{${inner}}`;
      }
      if (
        notation.includes('box') ||
        notation.includes('roundedbox') ||
        notation.includes('circle')
      ) {
        return `\\boxed{${inner}}`;
      }
      if (notation.includes('strike')) {
        return `\\cancel{${inner}}`;
      }
      return inner;
    }

    case 'msup': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 2) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const sup = mathmlNodeToLatex(elemChildren[1]);
        return `{${base}}^{${sup}}`;
      }
      return childLatex();
    }

    case 'msub': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 2) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const sub = mathmlNodeToLatex(elemChildren[1]);
        return `{${base}}_{${sub}}`;
      }
      return childLatex();
    }

    case 'msubsup': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 3) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const sub = mathmlNodeToLatex(elemChildren[1]);
        const sup = mathmlNodeToLatex(elemChildren[2]);
        return `{${base}}_{${sub}}^{${sup}}`;
      }
      return childLatex();
    }

    case 'mover': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 2) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const overTxt = stripInvisibleMathChars(
          elemChildren[1].textContent || ''
        ).trim();
        if (
          overTxt === '¯' ||
          overTxt === '‾' ||
          overTxt === '_' ||
          overTxt === '−' ||
          overTxt === '–' ||
          overTxt === '—' ||
          overTxt === '―' ||
          overTxt === '\u0304' ||
          overTxt === '\u0305'
        ) {
          return `\\overline{${base}}`;
        }
        if (overTxt === '→' || overTxt === '⟶' || overTxt === '⇀') {
          return `\\overrightarrow{${base}}`;
        }
        if (overTxt === '↔' || overTxt === '⟷') {
          return `\\overleftrightarrow{${base}}`;
        }
        if (overTxt === '^' || overTxt === 'ˆ' || overTxt === '∧') {
          return `\\widehat{${base}}`;
        }
        if (overTxt === '~' || overTxt === '∼' || overTxt === '˜') {
          return `\\widetilde{${base}}`;
        }
        if (overTxt === '︵' || overTxt === '⌒' || overTxt === '⌢') {
          return `\\overset{\\frown}{${base}}`;
        }
        const over = mathmlNodeToLatex(elemChildren[1]);
        return `\\overset{${over}}{${base}}`;
      }
      return childLatex();
    }

    case 'munder': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 2) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const under = mathmlNodeToLatex(elemChildren[1]);
        return `\\underset{${under}}{${base}}`;
      }
      return childLatex();
    }

    case 'munderover': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 3) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const under = mathmlNodeToLatex(elemChildren[1]);
        const over = mathmlNodeToLatex(elemChildren[2]);
        return `{${base}}_{${under}}^{${over}}`;
      }
      return childLatex();
    }

    case 'mfenced': {
      const openAttr = el.getAttribute('open') ?? '(';
      const closeAttr = el.getAttribute('close') ?? ')';
      const sepAttrRaw = el.getAttribute('separators');
      const seps =
        sepAttrRaw === null
          ? [',']
          : sepAttrRaw.replace(/\s+/g, '').split('');
      const elemChildren = Array.from(el.children);
      const renderedChildren = elemChildren.map(mathmlNodeToLatex);

      let inner = '';
      for (let idx = 0; idx < renderedChildren.length; idx++) {
        if (idx > 0 && seps.length > 0) {
          const sepChar = seps[Math.min(idx - 1, seps.length - 1)];
          inner += `${escapeTextForLatex(sepChar)} `;
        } else if (idx > 0) {
          inner += ' ';
        }
        inner += renderedChildren[idx];
      }

      const left = mapFenceDelimiter(openAttr);
      const right = mapFenceDelimiter(closeAttr);
      return `\\left${left}${inner}\\right${right}`;
    }

    case 'mtable': {
      const rows = Array.from(el.children)
        .map(mathmlNodeToLatex)
        .join(' \\\\ ');
      return `\\begin{matrix}${rows}\\end{matrix}`;
    }

    case 'mtr': {
      return Array.from(el.children)
        .map(mathmlNodeToLatex)
        .join(' & ');
    }

    case 'mtd':
      return childLatex();

    default:
      return childLatex();
  }
}

let svgInstanceCounter = 0;

function namespaceSvgIds(svgEl: SVGElement): void {
  const prefix = `sat_svg_${++svgInstanceCounter}_`;
  const idMap = new Map<string, string>();

  const elementsWithId = svgEl.querySelectorAll('[id]');
  elementsWithId.forEach((el) => {
    const oldId = el.getAttribute('id');
    if (oldId) {
      const newId = `${prefix}${oldId}`;
      idMap.set(oldId, newId);
      el.setAttribute('id', newId);
    }
  });

  if (idMap.size === 0) return;

  const allNodes = svgEl.querySelectorAll('*');
  allNodes.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const val = attr.value;
      if (!val) continue;

      if (
        (attr.name === 'href' ||
          attr.name === 'xlink:href' ||
          attr.localName === 'href') &&
        val.startsWith('#')
      ) {
        const refId = val.slice(1);
        const mapped = idMap.get(refId);
        if (mapped) {
          el.setAttribute(attr.name, `#${mapped}`);
        }
      } else if (val.includes('url(#')) {
        const replaced = val.replace(/url\(#([^)]+)\)/g, (full, refId) => {
          const mapped = idMap.get(refId);
          return mapped ? `url(#${mapped})` : full;
        });
        if (replaced !== val) {
          el.setAttribute(attr.name, replaced);
        }
      }
    }
  });
}

export function renderRichHtmlWithKatex(rawHtml?: string): string {
  if (!rawHtml) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return rawHtml;
  }

  // Strip Word clipboard comments that fragment inline math text nodes
  // Expand any self-closing MathML tags before HTML5 DOMParser runs
  let preProcessed = rawHtml
    .replace(/<!--\s*(?:Start|End)Fragment\s*-->/gi, '')
    .replace(
      /<(mspace|none|mprescripts|mi|mn|mo|mtext|ms)\b([^>]*?)\/>/gi,
      '<$1$2></$1>'
    );

  // Convert explicit LaTeX \[...\] and \(...\) if present
  if (preProcessed.includes('\\(') || preProcessed.includes('\\[')) {
    preProcessed = preProcessed.replace(/\\\[([\s\S]*?)\\\]/g, (match, tex) => {
      try {
        return katex.renderToString(tex, {
          throwOnError: false,
          displayMode: true,
          strict: false,
          trust: true,
          errorColor: 'inherit',
        });
      } catch {
        return match;
      }
    });
    preProcessed = preProcessed.replace(/\\\(([\s\S]*?)\\\)/g, (match, tex) => {
      try {
        return katex.renderToString(tex, {
          throwOnError: false,
          displayMode: false,
          strict: false,
          trust: true,
          errorColor: 'inherit',
        });
      } catch {
        return match;
      }
    });
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');

    // 1. Convert all <math> elements in the DOM into KaTeX HTML
    const mathNodes = Array.from(doc.querySelectorAll('math'));
    for (const mathEl of mathNodes) {
      const displayAttr = mathEl.getAttribute('display');
      const isDisplay = displayAttr === 'block';
      const latex = mathmlNodeToLatex(mathEl).trim();
      if (!latex) continue;

      const rendered = katex.renderToString(latex, {
        throwOnError: false,
        displayMode: isDisplay,
        strict: false,
        trust: true,
        errorColor: 'inherit',
      });

      const wrapper = doc.createElement('span');
      wrapper.innerHTML = rendered;
      mathEl.replaceWith(...Array.from(wrapper.childNodes));
    }

    // 2. Unwrap malformed <sup> wrappers around full math containers (e.g. item 025616-DC)
    for (const supEl of Array.from(doc.querySelectorAll('sup'))) {
      if (supEl.closest('.katex')) continue;
      const nonEmptyChildren = Array.from(supEl.childNodes).filter(
        (n) => n.nodeType !== Node.TEXT_NODE || (n.textContent || '').trim() !== ''
      );
      if (
        nonEmptyChildren.length === 1 &&
        nonEmptyChildren[0].nodeType === Node.ELEMENT_NODE
      ) {
        const onlyEl = nonEmptyChildren[0] as Element;
        if (
          onlyEl.classList.contains('math-container') ||
          onlyEl.tagName.toLowerCase() === 'img'
        ) {
          supEl.replaceWith(...Array.from(supEl.childNodes));
        }
      }
    }

    // 3. Replace empty Greek symbol spans like <span class="theta"></span>
    const emptyGreekMap: Record<string, string> = {
      theta: '\\theta ',
      pi: '\\pi ',
      alpha: '\\alpha ',
      beta: '\\beta ',
      gamma: '\\gamma ',
      delta: '\\Delta ',
      lambda: '\\lambda ',
      mu: '\\mu ',
      sigma: '\\sigma ',
      omega: '\\omega ',
    };
    for (const spanEl of Array.from(doc.querySelectorAll('span[class]'))) {
      if (spanEl.closest('.katex') || spanEl.childNodes.length > 0) continue;
      for (const cls of Array.from(spanEl.classList)) {
        const tex = emptyGreekMap[cls.toLowerCase()];
        if (tex) {
          const frag = createMathFrag(doc, tex, spanEl.outerHTML, false);
          spanEl.replaceWith(frag);
          break;
        }
      }
    }

    // 4. Classify <img> elements: convert spoken inline math PNGs to vector KaTeX (keeping PNG fallback only if unparseable)
    const imgNodes = Array.from(doc.querySelectorAll('img'));
    for (const imgEl of imgNodes) {
      const isInlineMath =
        imgEl.classList.contains('math-img') ||
        imgEl.getAttribute('role') === 'math' ||
        imgEl.getAttribute('align') === 'middle' ||
        Boolean(imgEl.closest('.math-container, .math'));

      if (!isInlineMath) {
        imgEl.classList.add('sat-diagram-img');
        imgEl.removeAttribute('width');
        imgEl.removeAttribute('height');
        continue;
      }

      const latex = spokenMathToLatex(imgEl.getAttribute('alt'));
      if (latex && isValidKatex(latex)) {
        const isMultiline = latex.includes('\\begin{');
        const frag = createMathFrag(doc, latex, imgEl.outerHTML, isMultiline);
        const container = imgEl.closest('span.math-container');
        if (
          container &&
          Array.from(container.childNodes).every(
            (n) => n === imgEl || (n.nodeType === Node.TEXT_NODE && !(n.textContent || '').trim())
          )
        ) {
          container.replaceWith(frag);
        } else {
          imgEl.replaceWith(frag);
        }
      } else {
        imgEl.classList.add('math-img');
      }
    }

    // Unwrap redundant .math_expression spans when they wrap a single inline math fragment
    for (const exprSpan of Array.from(doc.querySelectorAll('span.math_expression, span.math-container'))) {
      if (exprSpan.closest('.katex')) continue;
      const nonEmpty = Array.from(exprSpan.childNodes).filter(
        (n) => n.nodeType !== Node.TEXT_NODE || (n.textContent || '').trim() !== ''
      );
      if (
        nonEmpty.length === 1 &&
        nonEmpty[0].nodeType === Node.ELEMENT_NODE &&
        (nonEmpty[0] as Element).hasAttribute('data-sat-tex')
      ) {
        exprSpan.replaceWith(nonEmpty[0]);
      }
    }

    // 5. Convert HTML italic math variables (<span class="italic">, <em class="inline_variable">, math <em>/<i>)
    promoteHtmlMathElements(doc);

    // 6. Merge contiguous inline math fragments & <sup>/<sub> & operators into unified KaTeX expressions
    mergeContiguousMathInDoc(doc);

    // 7. Compile all unified .sat-math-frag spans via KaTeX
    for (const frag of Array.from(doc.querySelectorAll('span[data-sat-tex]'))) {
      const tex = (frag.getAttribute('data-sat-tex') || '').trim();
      const fallbackHtml = frag.getAttribute('data-sat-fallback') || '';
      if (!tex) {
        frag.remove();
        continue;
      }
      try {
        const rendered = katex.renderToString(tex, {
          throwOnError: true,
          displayMode: false,
          strict: false,
          trust: true,
          errorColor: 'inherit',
        });
        const holder = doc.createElement('span');
        holder.innerHTML = rendered;
        frag.replaceWith(...Array.from(holder.childNodes));
      } catch {
        const holder = doc.createElement('span');
        holder.innerHTML = fallbackHtml;
        frag.replaceWith(...Array.from(holder.childNodes));
      }
    }

    // 8. Normalize College Board tables (unwrap nested <figure class="table"> & layout wrappers)
    normalizeTablesInDoc(doc);

    // 9. Normalize standalone diagram <svg> elements (excluding KaTeX internal SVGs)
    const svgNodes = Array.from(doc.querySelectorAll('svg'));
    for (const svgEl of svgNodes) {
      if (svgEl.closest('.katex')) continue;

      svgEl.classList.add('sat-diagram-svg');
      namespaceSvgIds(svgEl);

      const widthAttr = svgEl.getAttribute('width') || '';
      const heightAttr = svgEl.getAttribute('height') || '';
      const numW = parseFloat(widthAttr);
      const numH = parseFloat(heightAttr);

      let viewBox = svgEl.getAttribute('viewBox');
      if (!viewBox && Number.isFinite(numW) && Number.isFinite(numH) && numW > 0 && numH > 0) {
        viewBox = `0 0 ${numW} ${numH}`;
        svgEl.setAttribute('viewBox', viewBox);
      }

      if (viewBox) {
        const parts = viewBox
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
          const vbW = parts[2];
          const vbH = parts[3];
          const maxDim = Math.max(vbW, vbH);
          // Scale up small SAT diagrams so axes, labels, and points are crisp and easy to read
          const scale = Math.max(1.25, Math.min(2.1, 360 / maxDim));
          const targetWidthPx = Math.round(vbW * scale);
          svgEl.removeAttribute('width');
          svgEl.removeAttribute('height');
          svgEl.style.width = `${targetWidthPx}px`;
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
        }
      }
    }

    return doc.body.innerHTML;
  } catch {
    return preProcessed;
  }
}

function isValidKatex(tex: string): boolean {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: false, trust: true });
    return true;
  } catch {
    return false;
  }
}

function createMathFrag(
  doc: Document,
  tex: string,
  fallbackHtml: string,
  locked: boolean
): HTMLSpanElement {
  const span = doc.createElement('span');
  span.setAttribute('data-sat-tex', tex);
  span.setAttribute('data-sat-fallback', fallbackHtml);
  if (locked) span.setAttribute('data-sat-locked', '1');
  return span;
}

function toKatexSnippet(rawText: string): string {
  return rawText
    .replace(/\u00A0/g, ' ')
    .replace(/[−–]/g, '-')
    .replace(/×/g, ' \\times ')
    .replace(/÷/g, ' \\div ')
    .replace(/[·⋅]/g, ' \\cdot ')
    .replace(/≤/g, ' \\le ')
    .replace(/≥/g, ' \\ge ')
    .replace(/≠/g, ' \\ne ')
    .replace(/≈/g, ' \\approx ')
    .replace(/±/g, ' \\pm ')
    .replace(/π/g, '\\pi ')
    .replace(/θ/g, '\\theta ')
    .replace(/°/g, '^{\\circ}')
    .replace(/\$/g, '\\$')
    .replace(/%/g, '\\%')
    .replace(/(\d),(\d{3})(?!\d)/g, '$1{,}$2');
}

function extractInlineElementTex(el: Element): string | null {
  let out = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += toKatexSnippet(child.textContent || '');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const ce = child as Element;
      const tag = ce.tagName.toLowerCase();
      if (ce.hasAttribute('data-sat-tex')) {
        out += ce.getAttribute('data-sat-tex') || '';
      } else if (tag === 'sup' || tag === 'sub') {
        const inner = extractInlineElementTex(ce);
        if (inner == null) return null;
        const trimmed = inner.trim();
        if (!trimmed || /^(?:st|nd|rd|th)$/i.test(trimmed)) return null;
        out += tag === 'sup' ? `^{${trimmed}}` : `_{${trimmed}}`;
      } else if (tag === 'span' && ce.childNodes.length === 0) {
        continue;
      } else {
        return null;
      }
    }
  }
  return out;
}

function isMathItalicElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (el.closest('.katex, pre, code')) return false;
  if (tag === 'span') {
    if (el.classList.contains('italic')) return true;
    if (
      el.classList.contains('formatted_text') &&
      el.className.includes('font_style:italic')
    ) {
      // Only treat formatted_text italic spans as math variables when matching math rules below
    } else {
      return false;
    }
  } else if (tag !== 'em' && tag !== 'i') {
    return false;
  }
  if (el.classList.contains('inline_variable')) return true;

  const rawText = (el.textContent || '').replace(/\u00A0/g, ' ').trim();
  if (!rawText || /^[.,;:!?'"\-–—()\[\]]+$/.test(rawText)) return false;

  if (el.querySelector('sup, sub')) return true;
  if (/[=<>+\-×÷·⋅°≤≥≠≈]/.test(rawText)) return true;

  // All-caps geometric points like "QOR", "ABC"
  if (/^[A-Z]{2,5}$/.test(rawText)) return true;

  // Single lowercase math variable (skip standalone "a" unless adjacent to math delimiter)
  if (/^[b-hj-z]$/.test(rawText)) return true;
  if (rawText === 'a' || rawText === 'i' || /^[A-Z]$/.test(rawText)) {
    const prevCh = (el.previousSibling?.textContent || '').slice(-1);
    const nextCh = (el.nextSibling?.textContent || '').charAt(0);
    if (
      /[0-9=<>+\-×÷(,]/.test(prevCh) ||
      /[0-9=<>+\-×÷),]/.test(nextCh) ||
      nextCh === '^' ||
      nextCh === '_'
    ) {
      return true;
    }
  }
  return false;
}

function getDirectTableRows(tableEl: Element): Element[] {
  const rows: Element[] = [];
  for (const child of Array.from(tableEl.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'tr') {
      rows.push(child);
    } else if (tag === 'tbody' || tag === 'thead' || tag === 'tfoot') {
      for (const inner of Array.from(child.children)) {
        if (inner.tagName.toLowerCase() === 'tr') {
          rows.push(inner);
        }
      }
    }
  }
  return rows;
}

function normalizeTablesInDoc(doc: Document): void {
  // Iteratively unwrap single-cell outer layout <table> elements that only wrap another <table>
  let unwrappedLayout = true;
  while (unwrappedLayout) {
    unwrappedLayout = false;
    for (const tableEl of Array.from(doc.querySelectorAll('table'))) {
      if (!tableEl.isConnected) continue;
      const rows = getDirectTableRows(tableEl);
      if (rows.length !== 1) continue;
      const cells = Array.from(rows[0].children).filter((el) => {
        const t = el.tagName.toLowerCase();
        return t === 'td' || t === 'th';
      });
      if (cells.length !== 1) continue;
      const meaningful = Array.from(cells[0].childNodes).filter(
        (n) => n.nodeType !== Node.TEXT_NODE || (n.textContent || '').trim() !== ''
      );
      if (
        meaningful.length === 1 &&
        meaningful[0].nodeType === Node.ELEMENT_NODE &&
        (meaningful[0] as Element).tagName.toLowerCase() === 'table'
      ) {
        tableEl.replaceWith(meaningful[0]);
        unwrappedLayout = true;
      }
    }
  }

  // Collapse nested or redundant <figure class="table"> wrappers produced by CKEditor
  let unwrappedFig = true;
  while (unwrappedFig) {
    unwrappedFig = false;
    for (const figEl of Array.from(doc.querySelectorAll('figure.table'))) {
      if (!figEl.isConnected) continue;
      const hasOnlyTableOrFigure = Array.from(figEl.childNodes).every((n) => {
        if (n.nodeType === Node.TEXT_NODE) return (n.textContent || '').trim() === '';
        if (n.nodeType === Node.ELEMENT_NODE) {
          const el = n as Element;
          const tag = el.tagName.toLowerCase();
          return (
            tag === 'table' ||
            (tag === 'figure' && el.classList.contains('table'))
          );
        }
        return false;
      });
      if (hasOnlyTableOrFigure) {
        figEl.replaceWith(...Array.from(figEl.childNodes));
        unwrappedFig = true;
      }
    }
  }

  // Wrap every top-level non-borderless data table in a single .sat-table-wrap frame
  for (const tableEl of Array.from(doc.querySelectorAll('table'))) {
    if (!tableEl.isConnected) continue;
    if (tableEl.classList.contains('table_Borderless')) continue;
    // Skip tables nested inside another table or already wrapped
    if (tableEl.parentElement?.closest('table, .sat-table-wrap')) continue;

    // Reset cramped inline fixed widths (e.g. "width: 50px;" / "width: 100px;") & legacy attributes
    if (tableEl instanceof HTMLElement) {
      tableEl.style.removeProperty('width');
    }
    tableEl.removeAttribute('width');
    tableEl.removeAttribute('border');
    tableEl.removeAttribute('align');
    tableEl.classList.add('sat-table-wrapped');

    const wrap = doc.createElement('div');
    wrap.className = 'sat-table-wrap';
    tableEl.replaceWith(wrap);
    wrap.appendChild(tableEl);
  }
}

function promoteHtmlMathElements(doc: Document): void {
  const selector =
    'span.italic, span.formatted_text[class*="font_style:italic"], em, i';
  const candidates = Array.from(doc.querySelectorAll(selector)).filter((el) => {
    // Skip elements nested inside an outer candidate or sup/sub (outer handles children)
    const p = el.parentElement;
    return !p?.closest(`${selector}, sup, sub`);
  });

  for (const el of candidates) {
    if (!isMathItalicElement(el)) continue;

    const rawExtracted = extractInlineElementTex(el);
    if (rawExtracted == null) continue;

    let work = rawExtracted.replace(/\s+/g, ' ');
    let leadText = '';
    let trailText = '';

    // Handle rare editorial typo "<span class='italic'>x. S</span>ubtracting"
    const typoMatch = work.match(/^([A-Za-z0-9\\{}^_()\s]+?)(\.\s+[A-Z])$/);
    if (typoMatch) {
      work = typoMatch[1];
      trailText = typoMatch[2];
    }

    // Separate leading space so KaTeX wraps cleanly around punctuation
    const leadMatch = work.match(/^(\s+)(.*)$/);
    if (leadMatch) {
      leadText = leadMatch[1];
      work = leadMatch[2];
    }

    // Peel trailing punctuation unless already extracted (preserve "=" or math ops on the right)
    if (!trailText) {
      const punctMatch = work.match(/^(.*?)(\s*[.,;?!]+\s*|\s*-\s*)$/);
      if (punctMatch && punctMatch[1].trim()) {
        work = punctMatch[1];
        trailText = punctMatch[2];
      } else {
        const spaceEnd = work.match(/^(.*?)(\s+)$/);
        if (spaceEnd && !/[=<>+\-]$/.test(spaceEnd[1])) {
          work = spaceEnd[1];
          trailText = spaceEnd[2];
        }
      }
    }

    const finalTex = work.trim();
    if (!finalTex || /^[.,;:!?]+$/.test(finalTex) || finalTex.length > 48) {
      continue;
    }
    // Never turn ordinary English phrases inside italic spans into math
    const wordTokens = finalTex.match(/[A-Za-z]{3,}/g) || [];
    const safeWords = new Set(['times', 'cdot', 'circ', 'approx', 'sin', 'cos', 'tan', 'log', 'ABC', 'DEF', 'ACE', 'BCD', 'ABCD', 'PQR', 'QOR']);
    if (wordTokens.some((w) => !safeWords.has(w) && /^[a-z]+$/.test(w))) {
      continue;
    }

    if (!isValidKatex(finalTex)) continue;

    const replacementNodes: Node[] = [];
    if (leadText) replacementNodes.push(doc.createTextNode(leadText));
    replacementNodes.push(createMathFrag(doc, finalTex, el.outerHTML, false));
    if (trailText) replacementNodes.push(doc.createTextNode(trailText));

    el.replaceWith(...replacementNodes);
  }
}

function isOrdinalSupText(text: string): boolean {
  return /^(?:st|nd|rd|th|[®™©*†‡§])$/i.test(text.trim());
}

function getSupSubInnerTex(el: Element): { tex: string; fallback: string } | null {
  if (el.querySelector('img, svg, table, div, p')) return null;
  const raw = extractInlineElementTex(el);
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 28 || isOrdinalSupText(trimmed)) return null;
  return { tex: trimmed, fallback: el.outerHTML };
}

function peelTrailingMathPrefix(text: string): { rest: string; mathPrefix: string } {
  // Capture trailing math expression before a fragment or <sup> (e.g. "2.5 × 10", "50,000(1.03)", "(2 + ", "(")
  const norm = text.replace(/\u00A0/g, ' ');
  const m = norm.match(
    /^(.*?(?:^|[\s:;(\[{=+\-–−×÷·⋅<>≤≥,]))((?:[-–−+]?\s*)?(?:[(\[]+\s*)*(?:[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?\s*°?)(?:\s*(?:[+\-–−=<>≤≥≠≈±×÷·⋅/]|\([^)]*\))\s*(?:[(\[]*\s*[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?\s*°?|\([^)]*\))?)*\s*)$/
  );
  if (!m) {
    // Also check a trailing open bracket/paren or unary minus like "(", "-(" right before a math frag
    const parenM = norm.match(/^(.*?)([-–−+\s]*[(\[]+\s*)$/);
    if (parenM) {
      const rawParen = parenM[2];
      // Do not consume standalone space before paren if there's an operator vs English word; leave space in rest
      const trimmedLead = rawParen.match(/^(\s*)(.*)$/);
      if (trimmedLead) {
        return {
          rest: text.slice(0, parenM[1].length) + trimmedLead[1],
          mathPrefix: toKatexSnippet(trimmedLead[2]),
        };
      }
    }
    return { rest: text, mathPrefix: '' };
  }

  let prefix = m[1];
  let captured = m[2];
  // Avoid separating a number from a preceding unit/word comma unless punctuation/space was captured
  // Leave leading whitespace inside prose prefix so "If 2x" -> "If " + KaTeX("2x")
  const wsLead = captured.match(/^(\s*)(.*)$/);
  if (wsLead) {
    prefix += wsLead[1];
    captured = wsLead[2];
  }

  // Do not pull standalone reference numbers after prose labels like "equation 1", "day 3"
  if (
    /^\d+$/.test(captured.trim()) &&
    /\b(?:equation|inequality|statement|choice|option|step|table|figure|line|day|month|year|part|question|item)\s+$/i.test(
      prefix
    )
  ) {
    return { rest: text, mathPrefix: '' };
  }

  // Don't strip trailing sentence comma right before prose word if captured is just spaces
  if (!captured.trim()) {
    return { rest: text, mathPrefix: '' };
  }

  // Reconstruct slice offset accurately on original string length
  const usedLen = text.length - prefix.length;
  const origPrefix = text.slice(0, prefix.length);
  const origCaptured = text.slice(prefix.length, prefix.length + usedLen);
  return { rest: origPrefix, mathPrefix: toKatexSnippet(origCaptured) };
}

function joinLatexTokens(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  if (/(?:^|[^\\])\\[A-Za-z]+$/.test(left) && /^[A-Za-z]/.test(right)) {
    return `${left} ${right}`;
  }
  return `${left}${right}`;
}

function peelLeadingMathSuffix(
  text: string,
  hasOpenParen: boolean
): { mathSuffix: string; rest: string } {
  const norm = text.replace(/\u00A0/g, ' ');
  // Do NOT swallow hyphenated English suffixes like "-intercept", "-axis", "-value"
  if (/^\s*[-–−]\s*[A-Za-z]{2,}/.test(norm)) {
    return { mathSuffix: '', rest: text };
  }

  // Pull leading math tokens: spaces + operators/numbers/parens/°/% ending cleanly before prose or sentence end
  let idx = 0;
  let depth = hasOpenParen ? 1 : 0;
  let lastValidEnd = 0;

  while (idx < norm.length) {
    const sub = norm.slice(idx);
    // Stop before hyphenated word like "-intercept"
    if (/^\s*[-–−][A-Za-z]{2,}/.test(sub)) break;

    const tok = sub.match(
      /^(?:\s+|(?:\d+(?:,\d{3})*(?:\.\d+)?)|[+\-–−=<>≤≥≠≈±×÷·⋅/()\[\]°%])/
    );
    if (!tok) break;
    const val = tok[0];
    if (val === '(' || val === '[') depth++;
    else if (val === ')' || val === ']') {
      if (depth === 0) break;
      depth--;
    }
    idx += val.length;
    if (!/^\s+$/.test(val)) {
      lastValidEnd = idx;
    }
  }

  if (lastValidEnd === 0) {
    return { mathSuffix: '', rest: text };
  }

  const rawTaken = text.slice(0, lastValidEnd);
  const rest = text.slice(lastValidEnd);
  return { mathSuffix: toKatexSnippet(rawTaken), rest };
}

function isPureMathConnector(
  text: string,
  hasNextFrag: boolean,
  openParens: number
): boolean {
  const norm = text.replace(/\u00A0/g, ' ').trim();
  if (!norm) return true;
  if (/^[-–−]\s*[A-Za-z]{2,}/.test(norm)) return false;
  if (norm === ',' && hasNextFrag && openParens > 0) return true;
  // Numbers/operators/parens/degree signs between two math fragments (e.g. " + 2", " = ", " + ", ") + ")
  return /^[\s0-9.,+\-–−=<>≤≥≠≈±×÷·⋅/()\[\]°%]+$/.test(norm) && !/[.,;:?!]$/.test(norm);
}

function countParenBalance(tex: string): number {
  let bal = 0;
  for (const ch of tex) {
    if (ch === '(' || ch === '[') bal++;
    else if (ch === ')' || ch === ']') bal = Math.max(0, bal - 1);
  }
  return bal;
}

function wrapMathBaseForScript(tex: string): string {
  const t = tex.trim();
  if (/^[A-Za-z0-9\\]+$/.test(t) || (t.startsWith('(') && t.endsWith(')'))) {
    return t;
  }
  return t;
}

function mergeContiguousMathInDoc(doc: Document): void {
  const containers = Array.from(doc.querySelectorAll('p, li, td, th, div, label, span'));
  // Process innermost containers first
  containers.reverse();

  for (const container of containers) {
    if (
      container.closest('.katex, .sat-diagram-svg') ||
      container.hasAttribute('data-sat-tex')
    ) {
      continue;
    }
    const children = Array.from(container.childNodes);
    const hasRelevant = children.some(
      (n) =>
        n.nodeType === Node.ELEMENT_NODE &&
        ((n as Element).hasAttribute('data-sat-tex') ||
          ['sup', 'sub'].includes((n as Element).tagName.toLowerCase()))
    );
    if (!hasRelevant) continue;

    type Item =
      | { kind: 'text'; text: string }
      | { kind: 'frag'; tex: string; fallback: string; locked: boolean }
      | { kind: 'sup' | 'sub'; tex: string; fallback: string }
      | { kind: 'other'; node: ChildNode };

    const items: Item[] = [];
    for (const node of children) {
      if (node.nodeType === Node.TEXT_NODE) {
        const txt = node.textContent || '';
        const prev = items[items.length - 1];
        if (prev && prev.kind === 'text') prev.text += txt;
        else items.push({ kind: 'text', text: txt });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.hasAttribute('data-sat-tex')) {
          items.push({
            kind: 'frag',
            tex: el.getAttribute('data-sat-tex') || '',
            fallback: el.getAttribute('data-sat-fallback') || '',
            locked: el.getAttribute('data-sat-locked') === '1',
          });
        } else {
          const tag = el.tagName.toLowerCase();
          if (tag === 'sup' || tag === 'sub') {
            const parsed = getSupSubInnerTex(el);
            if (parsed) {
              items.push({ kind: tag, tex: parsed.tex, fallback: parsed.fallback });
            } else {
              items.push({ kind: 'other', node });
            }
          } else {
            items.push({ kind: 'other', node });
          }
        }
      } else {
        items.push({ kind: 'other', node });
      }
    }

    const outNodes: Node[] = [];
    let i = 0;

    const absorbMathRun = (initialTex: string, initialFallback: string) => {
      let runTex = initialTex;
      let fallback = initialFallback;

      while (i < items.length) {
        const nxt = items[i];
        if (nxt.kind === 'sup' || nxt.kind === 'sub') {
          runTex = `${wrapMathBaseForScript(runTex)}${nxt.kind === 'sup' ? `^{${nxt.tex}}` : `_{${nxt.tex}}`}`;
          fallback += nxt.fallback;
          i++;
        } else if (nxt.kind === 'frag' && !nxt.locked) {
          runTex = joinLatexTokens(runTex, nxt.tex);
          fallback += nxt.fallback;
          i++;
        } else if (nxt.kind === 'text') {
          const afterItem = items[i + 1];
          const canBridge =
            afterItem &&
            ((afterItem.kind === 'frag' && !afterItem.locked) ||
              afterItem.kind === 'sup' ||
              afterItem.kind === 'sub') &&
            isPureMathConnector(nxt.text, afterItem.kind === 'frag', countParenBalance(runTex));
          if (canBridge) {
            runTex = joinLatexTokens(runTex, toKatexSnippet(nxt.text));
            fallback += nxt.text;
            i++;
          } else {
            const { mathSuffix, rest: rem } = peelLeadingMathSuffix(
              nxt.text,
              countParenBalance(runTex) > 0
            );
            if (mathSuffix) {
              runTex = joinLatexTokens(runTex, mathSuffix);
              fallback += nxt.text.slice(0, nxt.text.length - rem.length);
              if (rem) items[i] = { kind: 'text', text: rem };
              else i++;
            }
            break;
          }
        } else {
          break;
        }
      }

      outNodes.push(createMathFrag(doc, runTex.trim(), fallback, false));
    };

    const pullPrefixFromPrevText = (): { tex: string; fallback: string } | null => {
      if (
        outNodes.length === 0 ||
        outNodes[outNodes.length - 1].nodeType !== Node.TEXT_NODE
      ) {
        return null;
      }
      const prevTextNode = outNodes[outNodes.length - 1] as Text;
      const { rest, mathPrefix } = peelTrailingMathPrefix(prevTextNode.textContent || '');
      if (!mathPrefix.trim()) return null;
      prevTextNode.textContent = rest;
      if (!rest) outNodes.pop();
      return { tex: mathPrefix, fallback: mathPrefix };
    };

    while (i < items.length) {
      const cur = items[i];

      if (cur.kind === 'sup' || cur.kind === 'sub') {
        const pulled = pullPrefixFromPrevText();
        if (pulled) {
          const initTex = `${wrapMathBaseForScript(pulled.tex)}${cur.kind === 'sup' ? `^{${cur.tex}}` : `_{${cur.tex}}`}`;
          const initFallback = `${pulled.fallback}${cur.fallback}`;
          i++;
          absorbMathRun(initTex, initFallback);
          continue;
        }
        const holder = doc.createElement('span');
        holder.innerHTML = cur.fallback;
        outNodes.push(...Array.from(holder.childNodes));
        i++;
        continue;
      }

      if (cur.kind === 'text') {
        if (cur.text) outNodes.push(doc.createTextNode(cur.text));
        i++;
        continue;
      }

      if (cur.kind === 'other') {
        outNodes.push(cur.node);
        i++;
        continue;
      }

      if (cur.kind === 'frag') {
        if (cur.locked) {
          outNodes.push(createMathFrag(doc, cur.tex, cur.fallback, true));
          i++;
          continue;
        }

        const pulled = pullPrefixFromPrevText();
        const initTex = pulled ? joinLatexTokens(pulled.tex, cur.tex) : cur.tex;
        const initFallback = pulled ? `${pulled.fallback}${cur.fallback}` : cur.fallback;
        i++;
        absorbMathRun(initTex, initFallback);
      }
    }

    container.replaceChildren(...outNodes);
  }
}
