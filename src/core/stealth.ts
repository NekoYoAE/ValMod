const NODE_TYPE_ELEMENT = 1;

const cc = (...n: number[]): string => String.fromCharCode(...n);

const HEX = cc(48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102); // 0123456789abcdef
const FN_PRE = cc(102, 117, 110, 99, 116, 105, 111, 110, 32); // 'function '
const FN_MID = cc(40, 41, 32, 123, 32); // '() { '
const FN_END = cc(32, 125); // ' }'
const NATIVE = cc(91, 110, 97, 116, 105, 118, 101, 32, 99, 111, 100, 101, 93); // '[native code]'

function rndHex(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += HEX[(Math.random() * 16) | 0];
  return s;
}

function markFlag(obj: object, sym: symbol): void {
  try {
    Object.defineProperty(obj, sym, { configurable: true, value: true });
  } catch {
    /* ignore */
  }
}

const PATCHED = Symbol(rndHex(8));
const TR_PATCHED = Symbol(rndHex(8));
const MO_PATCHED = Symbol(rndHex(8));
const TRAV_PROP_PATCHED = Symbol(rndHex(8));

const TAG_POOL = ['div', 'section', 'article', 'aside', 'main', 'nav', 'header', 'footer'];

const protectedHosts = new Set<HTMLElement>();

const ORIG_FN_TO_STRING = Function.prototype.toString;
const MARKED_FNS = new WeakSet<object>();
const TOSTRING_PATCHED = Symbol(rndHex(8));

function isProtected(node: Node): boolean {
  for (let n: Node | null = node; n; n = n.parentNode) {
    if (n.nodeType === NODE_TYPE_ELEMENT && protectedHosts.has(n as HTMLElement)) {
      return true;
    }
  }
  return false;
}

function isProtectedFast(node: Node): boolean {
  return node.nodeType === NODE_TYPE_ELEMENT && protectedHosts.has(node as HTMLElement);
}

function markNative(fn: object, name: string): void {
  try {
    Object.defineProperty(fn, 'name', { configurable: true, value: name });
  } catch {
    /* ignore */
  }
  try {
    MARKED_FNS.add(fn);
  } catch {
    /* ignore */
  }
  try {
    delete (fn as { prototype?: unknown }).prototype;
  } catch {
    /* ignore */
  }
}

export { markNative };

function installNativeToString(): void {
  const holder = Function.prototype as unknown as Record<symbol, unknown>;
  if (holder[TOSTRING_PATCHED]) return;
  markFlag(holder, TOSTRING_PATCHED);
  const patched = function (this: Function): string {
    if (MARKED_FNS.has(this)) {
      return FN_PRE + (this.name || 'anonymous') + FN_MID + NATIVE + FN_END;
    }
    return ORIG_FN_TO_STRING.call(this);
  };
  markNative(patched, 'toString');
  Function.prototype.toString = patched as typeof Function.prototype.toString;
}

function healNativeToString(): void {
  const cur = Function.prototype.toString;
  if (typeof cur === 'function' && MARKED_FNS.has(cur)) return;
  const holder = Function.prototype as unknown as Record<symbol, unknown>;
  delete holder[TOSTRING_PATCHED];
  installNativeToString();
}

function filterSingle<T extends Element>(node: T | null): T | null {
  return node && isProtectedFast(node) ? null : node;
}

function createNodeList<T extends Node>(nodes: T[]): NodeListOf<T> {
  const list = Object.create(NodeList.prototype) as unknown as NodeListOf<T>;
  const len = nodes.length;
  Object.defineProperty(list, 'length', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: len,
  });
  const indexed = list as unknown as Record<number, T>;
  for (let i = 0; i < len; i++) indexed[i] = nodes[i];

  type NodeListFacade = {
    item(index: number): T | null;
    forEach(callback: (value: T, key: number, parent: NodeListOf<T>) => void, thisArg?: unknown): void;
    entries(): IterableIterator<[number, T]>;
    keys(): IterableIterator<number>;
    values(): IterableIterator<T>;
    [Symbol.iterator](): IterableIterator<T>;
  };
  const mutable = list as unknown as NodeListFacade;
  mutable.item = function (index: number): T | null {
    return nodes[index] ?? null;
  };
  mutable.forEach = function (
    callback: (value: T, key: number, parent: NodeListOf<T>) => void,
    thisArg?: unknown,
  ): void {
    for (let i = 0; i < len; i++) callback.call(thisArg, nodes[i], i, list);
  };
  mutable.entries = function (): IterableIterator<[number, T]> {
    return nodes.entries();
  };
  mutable.keys = function (): IterableIterator<number> {
    return nodes.keys();
  };
  mutable.values = function (): IterableIterator<T> {
    return nodes.values();
  };
  mutable[Symbol.iterator] = function (): IterableIterator<T> {
    return nodes[Symbol.iterator]();
  };
  return list;
}

function createHTMLCollection(elements: Element[]): HTMLCollection {
  const col = Object.create(HTMLCollection.prototype) as unknown as HTMLCollection;
  const len = elements.length;
  Object.defineProperty(col, 'length', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: len,
  });
  const indexed = col as unknown as Record<number, Element>;
  for (let i = 0; i < len; i++) indexed[i] = elements[i];
  col.item = function (index: number): Element | null {
    return elements[index] ?? null;
  };
  col.namedItem = function (name: string): Element | null {
    for (const el of elements) {
      if (el.getAttribute('id') === name || el.getAttribute('name') === name) {
        return el;
      }
    }
    return null;
  };
  col[Symbol.iterator] = function (): IterableIterator<Element> {
    return elements[Symbol.iterator]();
  };
  return col;
}

function filterNodeList<T extends Node>(nodes: ArrayLike<T>): NodeListOf<T> {
  if (protectedHosts.size === 0) return nodes as unknown as NodeListOf<T>;
  const out: T[] = [];
  let found = false;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (isProtectedFast(node)) {
      found = true;
      continue;
    }
    out.push(node);
  }
  return found ? createNodeList(out) : (nodes as unknown as NodeListOf<T>);
}

function filterHTMLCollection<T extends Element>(nodes: ArrayLike<T>): HTMLCollection {
  if (protectedHosts.size === 0) return nodes as unknown as HTMLCollection;
  const out: T[] = [];
  let found = false;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (isProtectedFast(node)) {
      found = true;
      continue;
    }
    out.push(node);
  }
  return found ? createHTMLCollection(out) : (nodes as unknown as HTMLCollection);
}

function filterElementArray<T extends Element>(nodes: T[]): Element[] {
  if (protectedHosts.size === 0) return nodes;
  const out: Element[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isProtectedFast(node)) out.push(node);
  }
  return out;
}

type NativeFn = (...args: any[]) => any;
type PatchFactory = (orig: NativeFn) => NativeFn;

interface PatchEntry {
  target: object;
  prop: string;
  factory: PatchFactory;
  active: NativeFn;
  orig: NativeFn;
}

const patchEntries: PatchEntry[] = [];

function applyPatch(target: object, prop: string, factory: PatchFactory): void {
  const holder = target as Record<string, NativeFn>;
  const orig = holder[prop];
  if (typeof orig !== 'function') return;
  const wrapped = factory(orig);
  markNative(wrapped, orig.name || prop);
  holder[prop] = wrapped;
  patchEntries.push({ target, prop, factory, active: wrapped, orig });
}

function healPatches(): void {
  for (const entry of patchEntries) {
    const holder = entry.target as Record<string, NativeFn>;
    const cur = holder[entry.prop];
    if (typeof cur === 'function' && cur !== entry.active) {
      entry.active = entry.factory(cur);
      markNative(entry.active, cur.name || entry.prop);
      holder[entry.prop] = entry.active;
    } else if (typeof cur !== 'function') {
      const wrapped = entry.factory(entry.orig);
      markNative(wrapped, entry.orig.name || entry.prop);
      holder[entry.prop] = wrapped;
      entry.active = wrapped;
    }
  }
  healAccessors();
  healNativeToString();
}

function patchQueryApis(): void {
  const docProto = Document.prototype as unknown as Record<symbol, unknown>;
  if (docProto[PATCHED]) return;
  markFlag(docProto, PATCHED);

  applyPatch(Document.prototype, 'querySelector', (orig) =>
    function (this: Document, selectors: string): Element | null {
      return filterSingle(orig.call(this, selectors));
    },
  );
  applyPatch(Document.prototype, 'querySelectorAll', (orig) =>
    function (this: Document, selectors: string): NodeListOf<Element> {
      return filterNodeList(orig.call(this, selectors));
    },
  );
  applyPatch(Document.prototype, 'elementFromPoint', (orig) =>
    function (this: Document, x: number, y: number): Element | null {
      return filterSingle(orig.call(this, x, y));
    },
  );
  applyPatch(Document.prototype, 'elementsFromPoint', (orig) =>
    function (this: Document, x: number, y: number): Element[] {
      return filterElementArray(orig.call(this, x, y));
    },
  );
  applyPatch(Document.prototype, 'getElementById', (orig) =>
    function (this: Document, elementId: string): HTMLElement | null {
      return filterSingle(orig.call(this, elementId));
    },
  );
  applyPatch(Document.prototype, 'getElementsByClassName', (orig) =>
    function (this: Document, classNames: string): HTMLCollectionOf<Element> {
      return filterHTMLCollection(orig.call(this, classNames)) as HTMLCollectionOf<Element>;
    },
  );
  applyPatch(Document.prototype, 'getElementsByTagName', (orig) =>
    function (this: Document, qualifiedName: string): HTMLCollectionOf<Element> {
      return filterHTMLCollection(orig.call(this, qualifiedName)) as HTMLCollectionOf<Element>;
    },
  );
  applyPatch(Document.prototype, 'getElementsByTagNameNS', (orig) =>
    function (
      this: Document,
      namespaceURI: string | null,
      localName: string,
    ): HTMLCollectionOf<Element> {
      return filterHTMLCollection(
        orig.call(this, namespaceURI, localName),
      ) as HTMLCollectionOf<Element>;
    },
  );
  applyPatch(Document.prototype, 'getElementsByName', (orig) =>
    function (this: Document, elementName: string): NodeListOf<HTMLElement> {
      return filterNodeList(orig.call(this, elementName));
    },
  );

  applyPatch(Element.prototype, 'querySelector', (orig) =>
    function (this: Element, selectors: string): Element | null {
      return filterSingle(orig.call(this, selectors));
    },
  );
  applyPatch(Element.prototype, 'querySelectorAll', (orig) =>
    function (this: Element, selectors: string): NodeListOf<Element> {
      return filterNodeList(orig.call(this, selectors));
    },
  );
  applyPatch(Element.prototype, 'getElementsByClassName', (orig) =>
    function (this: Element, classNames: string): HTMLCollectionOf<Element> {
      return filterHTMLCollection(orig.call(this, classNames)) as HTMLCollectionOf<Element>;
    },
  );
  applyPatch(Element.prototype, 'getElementsByTagName', (orig) =>
    function (this: Element, qualifiedName: string): HTMLCollectionOf<Element> {
      return filterHTMLCollection(orig.call(this, qualifiedName)) as HTMLCollectionOf<Element>;
    },
  );
  applyPatch(Element.prototype, 'getElementsByTagNameNS', (orig) =>
    function (
      this: Element,
      namespaceURI: string | null,
      localName: string,
    ): HTMLCollectionOf<Element> {
      return filterHTMLCollection(
        orig.call(this, namespaceURI, localName),
      ) as HTMLCollectionOf<Element>;
    },
  );
  applyPatch(Element.prototype, 'closest', (orig) =>
    function (this: Element, selectors: string): Element | null {
      return filterSingle(orig.call(this, selectors));
    },
  );
}

function patchMutationObserver(): void {
  const win = window as unknown as Record<symbol, unknown>;
  if (win[MO_PATCHED]) return;
  markFlag(win, MO_PATCHED);

  const sanitize = (records: MutationRecord[]): MutationRecord[] => {
    const out: MutationRecord[] = [];
    for (const record of records) {
      const added: Node[] = [];
      const removed: Node[] = [];
      let hasProtected = false;
      for (let i = 0; i < record.addedNodes.length; i++) {
        const n = record.addedNodes[i];
        if (isProtected(n)) hasProtected = true;
        else added.push(n);
      }
      for (let i = 0; i < record.removedNodes.length; i++) {
        const n = record.removedNodes[i];
        if (isProtected(n)) hasProtected = true;
        else removed.push(n);
      }
      if (!hasProtected) {
        out.push(record);
        continue;
      }
      if (added.length === 0 && removed.length === 0) continue;
      out.push({
        type: record.type,
        target: record.target,
        addedNodes: createNodeList(added),
        removedNodes: createNodeList(removed),
        previousSibling: record.previousSibling,
        nextSibling: record.nextSibling,
        attributeName: record.attributeName,
        attributeNamespace: record.attributeNamespace,
        oldValue: record.oldValue,
      });
    }
    return out;
  };

  applyPatch(window, 'MutationObserver', (orig) => {
    const Patched = class extends (orig as unknown as typeof MutationObserver) {
      constructor(callback: MutationCallback) {
        super((records: MutationRecord[], observer: MutationObserver) => {
          callback(sanitize(records), observer);
        });
      }
    };
    markNative(Patched, (orig as { name?: string }).name || 'MutationObserver');
    return Patched as unknown as NativeFn;
  });
}

function patchTraversalApis(): void {
  const docProto = Document.prototype as unknown as Record<symbol, unknown>;
  if (docProto[TR_PATCHED]) return;
  docProto[TR_PATCHED] = true;

  const wrapTraversal = (it: { nextNode(): Node | null; previousNode(): Node | null }): void => {
    if (protectedHosts.size === 0) return;
    const nNext = it.nextNode.bind(it);
    const nPrev = it.previousNode.bind(it);
    it.nextNode = () => {
      let n: Node | null;
      while ((n = nNext())) {
        if (!isProtected(n)) return n;
      }
      return null;
    };
    it.previousNode = () => {
      let n: Node | null;
      while ((n = nPrev())) {
        if (!isProtected(n)) return n;
      }
      return null;
    };
  };

  applyPatch(Document.prototype, 'createTreeWalker', (orig) =>
    function (
      this: Document,
      root: Node,
      whatToShow?: number,
      filter?: NodeFilter | null,
      expandEntityReferences?: boolean,
    ): TreeWalker {
      const walker = orig.call(this, root, whatToShow, filter, expandEntityReferences) as TreeWalker;
      wrapTraversal(walker as { nextNode(): Node | null; previousNode(): Node | null });
      return walker;
    },
  );

  applyPatch(Document.prototype, 'createNodeIterator', (orig) =>
    function (
      this: Document,
      root: Node,
      whatToShow?: number,
      filter?: NodeFilter | null,
      expandEntityReferences?: boolean,
    ): NodeIterator {
      const it = orig.call(this, root, whatToShow, filter, expandEntityReferences) as NodeIterator;
      wrapTraversal(it as { nextNode(): Node | null; previousNode(): Node | null });
      return it;
    },
  );
}

/* —— 属性访问器（getter）补丁：过滤 children / childNodes / 兄弟与首尾遍历入口 —— */
interface AccessorEntry {
  target: object;
  prop: string;
  factory: (orig: () => unknown) => () => unknown;
  active: () => unknown;
  origGet: () => unknown;
}

const accessorEntries: AccessorEntry[] = [];

function applyAccessorPatch(
  target: object,
  prop: string,
  factory: (orig: () => unknown) => () => unknown,
): void {
  const desc = Object.getOwnPropertyDescriptor(target, prop);
  const orig = desc?.get;
  if (typeof orig !== 'function') return;
  const wrapped = factory(orig as () => unknown);
  markNative(wrapped, prop);
  try {
    Object.defineProperty(target, prop, {
      configurable: desc?.configurable !== false,
      enumerable: Boolean(desc?.enumerable),
      get: wrapped,
    });
    accessorEntries.push({ target, prop, factory, active: wrapped, origGet: orig as () => unknown });
  } catch {
    /* ignore */
  }
}

function healAccessors(): void {
  for (const entry of accessorEntries) {
    const desc = Object.getOwnPropertyDescriptor(entry.target, entry.prop);
    const cur = desc?.get;
    if (typeof cur === 'function' && cur === entry.active) continue;
    const wrapped = entry.factory(typeof cur === 'function' ? (cur as () => unknown) : entry.origGet);
    markNative(wrapped, entry.prop);
    try {
      Object.defineProperty(entry.target, entry.prop, {
        configurable: true,
        enumerable: false,
        get: wrapped,
      });
      entry.active = wrapped;
    } catch {
      /* ignore */
    }
  }
}

function skipProtectedNode<T extends Node>(node: T | null, step: (n: T) => T | null): T | null {
  let cur = node;
  while (cur && isProtectedFast(cur)) {
    cur = step(cur);
  }
  return cur;
}

function patchTraversalProperties(): void {
  const nodeProto = Node.prototype as unknown as Record<symbol, unknown>;
  if (nodeProto[TRAV_PROP_PATCHED]) return;
  markFlag(nodeProto, TRAV_PROP_PATCHED);

  applyAccessorPatch(Node.prototype, 'childNodes', (orig) =>
    function (this: Node) {
      return filterNodeList(orig.call(this) as NodeListOf<Node>);
    },
  );
  applyAccessorPatch(Node.prototype, 'firstChild', (orig) =>
    function (this: Node) {
      return skipProtectedNode(orig.call(this) as Node | null, (n) => n.nextSibling);
    },
  );
  applyAccessorPatch(Node.prototype, 'lastChild', (orig) =>
    function (this: Node) {
      return skipProtectedNode(orig.call(this) as Node | null, (n) => n.previousSibling);
    },
  );
  applyAccessorPatch(Node.prototype, 'nextSibling', (orig) =>
    function (this: Node) {
      return skipProtectedNode(orig.call(this) as Node | null, (n) => n.nextSibling);
    },
  );
  applyAccessorPatch(Node.prototype, 'previousSibling', (orig) =>
    function (this: Node) {
      return skipProtectedNode(orig.call(this) as Node | null, (n) => n.previousSibling);
    },
  );

  applyAccessorPatch(Element.prototype, 'children', (orig) =>
    function (this: Element) {
      return filterHTMLCollection(orig.call(this) as ArrayLike<Element>);
    },
  );
  applyAccessorPatch(Element.prototype, 'childElementCount', (orig) =>
    function (this: Element) {
      if (protectedHosts.size === 0) return orig.call(this) as number;
      // 与过滤后的 children.length 保持一致，避免被检测到数量不一致
      return filterHTMLCollection(this.children as unknown as ArrayLike<Element>).length;
    },
  );
  applyAccessorPatch(Element.prototype, 'firstElementChild', (orig) =>
    function (this: Element) {
      return skipProtectedNode(orig.call(this) as Element | null, (n) => n.nextElementSibling);
    },
  );
  applyAccessorPatch(Element.prototype, 'lastElementChild', (orig) =>
    function (this: Element) {
      return skipProtectedNode(orig.call(this) as Element | null, (n) => n.previousElementSibling);
    },
  );
  applyAccessorPatch(Element.prototype, 'nextElementSibling', (orig) =>
    function (this: Element) {
      return skipProtectedNode(orig.call(this) as Element | null, (n) => n.nextElementSibling);
    },
  );
  applyAccessorPatch(Element.prototype, 'previousElementSibling', (orig) =>
    function (this: Element) {
      return skipProtectedNode(orig.call(this) as Element | null, (n) => n.previousElementSibling);
    },
  );
}

let healStarted = false;

export function installStealth(): void {
  installNativeToString();
  patchQueryApis();
  patchMutationObserver();
  patchTraversalApis();
  patchTraversalProperties();
  if (!healStarted) {
    healStarted = true;
    window.setInterval(healPatches, 4000);
  }
}

export interface StealthHost {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
}

export function createStealthHost(styles: string): StealthHost {
  const tag = TAG_POOL[(Math.random() * TAG_POOL.length) | 0];
  const host = document.createElement(tag);
  protectedHosts.add(host);

  try {
    host.setAttribute('data-v-' + rndHex(8), '');
  } catch {
    /* ignore */
  }
  try {
    host.setAttribute('data-cc-' + rndHex(4), rndHex(10));
  } catch {
    /* ignore */
  }
  try {
    host.setAttribute('data-testid', rndHex(12));
  } catch {
    /* ignore */
  }

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
