const PATCHED = Symbol('stealth_patched');
const MO_PATCHED = Symbol('stealth_mo_patched');
const NODE_TYPE_ELEMENT = 1;

const protectedHosts = new Set<HTMLElement>();

function isProtected(node: Node): boolean {
  for (let n: Node | null = node; n; n = n.parentNode) {
    if (n.nodeType === NODE_TYPE_ELEMENT && protectedHosts.has(n as HTMLElement)) {
      return true;
    }
  }
  return false;
}

function markNative(fn: object, name: string): void {
  try {
    Object.defineProperty(fn, 'toString', {
      configurable: true,
      writable: false,
      value: () => `function ${name}() { [native code] }`,
    });
  } catch {
  }
}

function filterSingle<T extends Element>(node: T | null): T | null {
  return node && isProtected(node) ? null : node;
}

function filterList<T extends Element>(nodes: ArrayLike<T>): T[] {
  const out: T[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isProtected(node)) out.push(node);
  }
  Object.defineProperty(out, 'item', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: (index: number) => out[index] ?? null,
  });
  return out;
}

function patchQueryApis(): void {
  const docProto = Document.prototype as unknown as Record<symbol, unknown>;
  if (docProto[PATCHED]) return;
  docProto[PATCHED] = true;

  const origDocQS = Document.prototype.querySelector as (
    this: Document,
    selectors: string,
  ) => Element | null;
  const origDocQSA = Document.prototype.querySelectorAll as (
    this: Document,
    selectors: string,
  ) => NodeListOf<Element>;
  const origDocEFP = Document.prototype.elementFromPoint as (
    this: Document,
    x: number,
    y: number,
  ) => Element | null;
  const origDocEFPs = Document.prototype.elementsFromPoint as (
    this: Document,
    x: number,
    y: number,
  ) => Element[];
  const origElQS = Element.prototype.querySelector as (
    this: Element,
    selectors: string,
  ) => Element | null;
  const origElQSA = Element.prototype.querySelectorAll as (
    this: Element,
    selectors: string,
  ) => NodeListOf<Element>;

  const docQS = function (this: Document, selectors: string): Element | null {
    return filterSingle(origDocQS.call(this, selectors));
  };
  markNative(docQS, 'querySelector');
  Document.prototype.querySelector = docQS as typeof Document.prototype.querySelector;

  const docQSA = function (this: Document, selectors: string): Element[] {
    return filterList(origDocQSA.call(this, selectors));
  };
  markNative(docQSA, 'querySelectorAll');
  Document.prototype.querySelectorAll = docQSA as unknown as typeof Document.prototype.querySelectorAll;

  const docEFP = function (this: Document, x: number, y: number): Element | null {
    return filterSingle(origDocEFP.call(this, x, y));
  };
  markNative(docEFP, 'elementFromPoint');
  Document.prototype.elementFromPoint = docEFP as typeof Document.prototype.elementFromPoint;

  const docEFPs = function (this: Document, x: number, y: number): Element[] {
    return filterList(origDocEFPs.call(this, x, y));
  };
  markNative(docEFPs, 'elementsFromPoint');
  Document.prototype.elementsFromPoint = docEFPs as typeof Document.prototype.elementsFromPoint;

  const elQS = function (this: Element, selectors: string): Element | null {
    return filterSingle(origElQS.call(this, selectors));
  };
  markNative(elQS, 'querySelector');
  Element.prototype.querySelector = elQS as typeof Element.prototype.querySelector;

  const elQSA = function (this: Element, selectors: string): Element[] {
    return filterList(origElQSA.call(this, selectors));
  };
  markNative(elQSA, 'querySelectorAll');
  Element.prototype.querySelectorAll = elQSA as unknown as typeof Element.prototype.querySelectorAll;
}

function patchMutationObserver(): void {
  const Native = window.MutationObserver;
  if (!Native) return;
  const win = window as unknown as Record<symbol, unknown>;
  if (win[MO_PATCHED]) return;
  win[MO_PATCHED] = true;

  const sanitize = (records: MutationRecord[]): MutationRecord[] => {
    const out: MutationRecord[] = [];
    for (const record of records) {
      let hasProtected = false;
      let hasOther = false;
      const nodes: Node[] = [];
      for (let i = 0; i < record.addedNodes.length; i++) nodes.push(record.addedNodes[i]);
      for (let i = 0; i < record.removedNodes.length; i++) nodes.push(record.removedNodes[i]);
      for (const node of nodes) {
        if (isProtected(node)) hasProtected = true;
        else hasOther = true;
      }
      if (hasProtected && !hasOther) continue;
      out.push(record);
    }
    return out;
  };

  const Patched = class extends Native {
    constructor(callback: MutationCallback) {
      super((records: MutationRecord[], observer: MutationObserver) => {
        callback(sanitize(records), observer);
      });
    }
  } as unknown as typeof MutationObserver;

  try {
    Object.defineProperty(Patched, 'name', { configurable: true, value: 'MutationObserver' });
  } catch {
    /* 忽略 */
  }
  markNative(Patched, 'MutationObserver');

  window.MutationObserver = Patched;
}

export function installStealth(): void {
  patchQueryApis();
  patchMutationObserver();
}

export interface StealthHost {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
}

export function createStealthHost(styles: string): StealthHost {
  const host = document.createElement('div');
  protectedHosts.add(host);

  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = styles;
  root.appendChild(style);

  let inserted = false;
  const insert = () => {
    if (inserted) return;
    if (document.body) {
      inserted = true;
      document.body.appendChild(host);
    } else {
      requestAnimationFrame(insert);
    }
  };
  requestAnimationFrame(insert);
  setTimeout(insert, 64);

  return { host, root };
}

export function isStealthHost(node: Node): boolean {
  return isProtected(node);
}
