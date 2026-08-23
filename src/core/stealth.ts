const S = (() => {
  const KEY = (Math.random() * 0xffff) | 0;
  const CACHE = new Map<string, string>();
  return (src: string): string => {
    let out = CACHE.get(src);
    if (out !== undefined) return out;
    const parts = src.split(',');
    let t = '';
    let k = KEY;
    for (let i = 0; i < parts.length; i += 2) {
      k = (k * 1664525 + 1013904223) >>> 0;
      const m = (+parts[i] ^ k) >>> 0;
      const p = (+parts[i + 1] ^ k) >>> 0;
      t += String.fromCharCode(m ^ p);
    }
    out = t;
    CACHE.set(src, out);
    return out;
  };
})();

const NODE_TYPE_ELEMENT = 1;
const QS = S('181,196,38,83,243,150,143,253,65,56,100,55,79,42,237,129,137,236,56,91,138,254,42,69,146,224');
const QSA = S('206,191,103,18,44,73,102,20,26,99,53,102,232,141,228,136,34,71,153,250,101,17,83,60,25,107,143,206,185,213,92,48');
const EFP = S('170,207,142,226,188,217,9,100,22,115,88,54,105,29,158,216,37,87,165,202,204,161,220,140,20,123,247,158,11,101,244,128');
const EFPS = S('186,223,222,178,12,105,217,180,230,131,104,6,217,173,91,40,33,103,232,154,94,49,177,220,219,139,1,110,156,245,190,208,155,239');
const GEBID = S('229,130,156,249,112,4,214,147,186,214,88,61,21,120,18,119,4,106,181,193,110,44,226,155,119,62,225,133');
const GEBCN = S('71,32,154,255,38,82,204,137,56,84,198,163,203,166,168,205,166,200,243,135,73,58,19,81,5,124,232,171,98,14,116,21,3,112,124,15,108,34,120,25,201,164,214,179');
const GEBTN = S('17,118,56,93,108,24,210,151,102,10,132,225,161,204,222,187,176,222,209,165,179,192,93,31,139,242,253,169,149,244,164,195,8,70,140,237,5,104,194,167');
const GEBTNNS = S('189,218,20,113,104,28,142,203,194,174,80,53,125,16,74,47,172,194,77,57,55,68,145,211,111,22,41,125,217,184,208,183,228,170,96,1,1,108,190,219,48,126,150,197');
const GEBN = S('7,96,90,63,230,146,140,201,248,148,134,227,139,230,104,13,102,8,179,199,9,122,211,145,197,188,165,235,47,78,56,85,213,176');
const CLOSEST = S('44,79,14,98,54,89,151,228,150,243,197,182,233,157');
const MO = S('21,88,162,215,62,74,64,33,120,12,146,251,113,30,139,229,79,0,61,95,65,50,140,233,70,52,117,3,227,134,95,45');
const ATTACH_SHADOW = S('201,168,147,231,110,26,208,177,63,92,99,11,189,238,29,117,49,80,11,111,109,2,14,121');
const MODE = S('233,132,124,19,50,86,216,189');
const CLOSED = S('155,248,155,247,133,234,50,65,201,172,127,27');
const CREATE_ELEMENT = S('221,190,119,5,197,160,30,127,166,210,108,9,145,212,79,35,67,38,32,77,45,72,105,7,206,186');
const STYLE = S('162,209,136,252,82,43,226,142,240,149');
const TEXT_CONTENT = S('132,240,234,143,218,162,237,153,103,36,92,51,152,246,169,221,253,152,121,23,254,138');
const APPEND_CHILD = S('0,97,60,76,75,59,59,94,75,37,36,64,220,159,26,114,64,41,24,116,39,67');
const BODY = S('164,198,2,109,140,232,94,39');
const CHILD_NODES = S('57,90,153,241,245,156,39,75,74,46,251,181,255,144,203,175,39,66,202,185');
const CHILDREN = S('167,196,59,83,255,150,145,253,92,56,69,55,79,42,239,129');
const FIRST_CHILD = S('138,236,50,91,140,254,54,69,148,224,252,191,122,18,32,73,120,20,7,99');
const LAST_CHILD = S('10,102,236,141,251,136,51,71,185,250,121,17,85,60,7,107,170,206');
const FIRST_ELEMENT_CHILD = S('179,213,89,48,189,207,145,226,173,217,33,100,31,115,83,54,112,29,189,216,57,87,190,202,226,161,228,140,18,123,242,158,1,101');
const LAST_ELEMENT_CHILD = S('236,128,190,223,193,178,29,105,241,180,239,131,99,6,192,173,77,40,9,103,238,154,114,49,180,220,226,139,2,110,145,245');
const CHILD_ELEMENT_COUNT = S('179,208,135,239,235,130,149,249,96,4,214,147,186,214,88,61,21,120,18,119,4,106,181,193,111,44,244,155,75,62,235,133,84,32');
const PARENT_NODE = S('215,167,187,218,3,113,121,28,165,203,218,174,123,53,127,16,75,47,167,194');
const HOST_TAGS = ['div', 'section', 'article', 'aside', 'main', 'nav'];

const PATCHED = Symbol();
const MO_PATCHED = Symbol();

const protectedHosts = new Set<HTMLElement>();
const patchedBodies = new WeakSet<HTMLElement>();

function isProtected(node: Node): boolean {
  for (let n: Node | null = node; n; n = (n as unknown as Record<PropertyKey, unknown>)[PARENT_NODE] as Node | null) {
    if (n.nodeType === NODE_TYPE_ELEMENT && protectedHosts.has(n as HTMLElement)) {
      return true;
    }
  }
  return false;
}

function isProtectedFast(node: Node): boolean {
  return node.nodeType === NODE_TYPE_ELEMENT && protectedHosts.has(node as HTMLElement);
}

function markNative(fn: unknown, name: string): void {
  try {
    Object.defineProperty(fn as object, 'name', { configurable: true, value: name });
  } catch {
    /* 忽略 */
  }
  try {
    Object.defineProperty(fn as object, 'toString', {
      configurable: true,
      writable: false,
      value: () => `function ${name}() { [native code] }`,
    });
  } catch {
    /* 忽略 */
  }
}

function markAccessor(fn: unknown, name: string): void {
  try {
    Object.defineProperty(fn as object, 'name', { configurable: true, value: `get ${name}` });
  } catch {
    /* 忽略 */
  }
  try {
    Object.defineProperty(fn as object, 'toString', {
      configurable: true,
      writable: false,
      value: () => `function get ${name}() { [native code] }`,
    });
  } catch {
    /* 忽略 */
  }
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

function patchQueryApis(): void {
  const docProto = Document.prototype as unknown as Record<PropertyKey, unknown>;
  if (docProto[PATCHED]) return;
  docProto[PATCHED] = true;

  const origDocQS = docProto[QS] as (this: Document, selectors: string) => Element | null;
  const origDocQSA = docProto[QSA] as (this: Document, selectors: string) => NodeListOf<Element>;
  const origDocEFP = docProto[EFP] as (this: Document, x: number, y: number) => Element | null;
  const origDocEFPs = docProto[EFPS] as (this: Document, x: number, y: number) => Element[];
  const origDocGEBId = docProto[GEBID] as (this: Document, elementId: string) => HTMLElement | null;
  const origDocGEBCN = docProto[GEBCN] as (this: Document, classNames: string) => HTMLCollectionOf<Element>;
  const origDocGEBTN = docProto[GEBTN] as (this: Document, qualifiedName: string) => HTMLCollectionOf<Element>;
  const origDocGEBTNNS = docProto[GEBTNNS] as (
    this: Document,
    namespaceURI: string | null,
    localName: string,
  ) => HTMLCollectionOf<Element>;
  const origDocGEBN = docProto[GEBN] as (this: Document, elementName: string) => NodeListOf<HTMLElement>;

  const elProto = Element.prototype as unknown as Record<PropertyKey, unknown>;
  const origElQS = elProto[QS] as (this: Element, selectors: string) => Element | null;
  const origElQSA = elProto[QSA] as (this: Element, selectors: string) => NodeListOf<Element>;
  const origElGEBCN = elProto[GEBCN] as (this: Element, classNames: string) => HTMLCollectionOf<Element>;
  const origElGEBTN = elProto[GEBTN] as (this: Element, qualifiedName: string) => HTMLCollectionOf<Element>;
  const origElGEBTNNS = elProto[GEBTNNS] as (
    this: Element,
    namespaceURI: string | null,
    localName: string,
  ) => HTMLCollectionOf<Element>;
  const origElClosest = elProto[CLOSEST] as (this: Element, selectors: string) => Element | null;

  const fragProto = DocumentFragment.prototype as unknown as Record<PropertyKey, unknown>;
  const origFragQS = fragProto[QS] as (this: DocumentFragment, selectors: string) => Element | null;
  const origFragQSA = fragProto[QSA] as (this: DocumentFragment, selectors: string) => NodeListOf<Element>;

  const docQS = function (this: Document, selectors: string): Element | null {
    return filterSingle(origDocQS.call(this, selectors));
  };
  markNative(docQS, QS);
  docProto[QS] = docQS;

  const docQSA = function (this: Document, selectors: string): NodeListOf<Element> {
    return filterNodeList(origDocQSA.call(this, selectors));
  };
  markNative(docQSA, QSA);
  docProto[QSA] = docQSA;

  const docEFP = function (this: Document, x: number, y: number): Element | null {
    const el = origDocEFP.call(this, x, y);
    if (!el || !isProtectedFast(el)) return el;
    const chain = filterElementArray(origDocEFPs.call(this, x, y));
    return chain[0] ?? null;
  };
  markNative(docEFP, EFP);
  docProto[EFP] = docEFP;

  const docEFPs = function (this: Document, x: number, y: number): Element[] {
    return filterElementArray(origDocEFPs.call(this, x, y));
  };
  markNative(docEFPs, EFPS);
  docProto[EFPS] = docEFPs;

  const elQS = function (this: Element, selectors: string): Element | null {
    return filterSingle(origElQS.call(this, selectors));
  };
  markNative(elQS, QS);
  elProto[QS] = elQS;

  const elQSA = function (this: Element, selectors: string): NodeListOf<Element> {
    return filterNodeList(origElQSA.call(this, selectors));
  };
  markNative(elQSA, QSA);
  elProto[QSA] = elQSA;

  const fragQS = function (this: DocumentFragment, selectors: string): Element | null {
    return filterSingle(origFragQS.call(this, selectors));
  };
  markNative(fragQS, QS);
  fragProto[QS] = fragQS;

  const fragQSA = function (this: DocumentFragment, selectors: string): NodeListOf<Element> {
    return filterNodeList(origFragQSA.call(this, selectors));
  };
  markNative(fragQSA, QSA);
  fragProto[QSA] = fragQSA;

  const docGEBId = function (this: Document, elementId: string): HTMLElement | null {
    return filterSingle(origDocGEBId.call(this, elementId));
  };
  markNative(docGEBId, GEBID);
  docProto[GEBID] = docGEBId;

  const docGEBCN = function (this: Document, classNames: string): HTMLCollectionOf<Element> {
    return filterHTMLCollection(origDocGEBCN.call(this, classNames)) as HTMLCollectionOf<Element>;
  };
  markNative(docGEBCN, GEBCN);
  docProto[GEBCN] = docGEBCN;

  const elGEBCN = function (this: Element, classNames: string): HTMLCollectionOf<Element> {
    return filterHTMLCollection(origElGEBCN.call(this, classNames)) as HTMLCollectionOf<Element>;
  };
  markNative(elGEBCN, GEBCN);
  elProto[GEBCN] = elGEBCN;

  const docGEBTN = function (this: Document, qualifiedName: string): HTMLCollectionOf<Element> {
    return filterHTMLCollection(origDocGEBTN.call(this, qualifiedName)) as HTMLCollectionOf<Element>;
  };
  markNative(docGEBTN, GEBTN);
  docProto[GEBTN] = docGEBTN;

  const elGEBTN = function (this: Element, qualifiedName: string): HTMLCollectionOf<Element> {
    return filterHTMLCollection(origElGEBTN.call(this, qualifiedName)) as HTMLCollectionOf<Element>;
  };
  markNative(elGEBTN, GEBTN);
  elProto[GEBTN] = elGEBTN;

  const docGEBTNNS = function (
    this: Document,
    namespaceURI: string | null,
    localName: string,
  ): HTMLCollectionOf<Element> {
    return filterHTMLCollection(
      origDocGEBTNNS.call(this, namespaceURI, localName),
    ) as HTMLCollectionOf<Element>;
  };
  markNative(docGEBTNNS, GEBTNNS);
  docProto[GEBTNNS] = docGEBTNNS;

  const elGEBTNNS = function (
    this: Element,
    namespaceURI: string | null,
    localName: string,
  ): HTMLCollectionOf<Element> {
    return filterHTMLCollection(
      origElGEBTNNS.call(this, namespaceURI, localName),
    ) as HTMLCollectionOf<Element>;
  };
  markNative(elGEBTNNS, GEBTNNS);
  elProto[GEBTNNS] = elGEBTNNS;

  const docGEBN = function (this: Document, elementName: string): NodeListOf<HTMLElement> {
    return filterNodeList(origDocGEBN.call(this, elementName));
  };
  markNative(docGEBN, GEBN);
  docProto[GEBN] = docGEBN;

  const elClosest = function (this: Element, selectors: string): Element | null {
    return filterSingle(origElClosest.call(this, selectors));
  };
  markNative(elClosest, CLOSEST);
  elProto[CLOSEST] = elClosest;
}

function patchMutationObserver(): void {
  const win = window as unknown as Record<PropertyKey, unknown>;
  const Native = win[MO] as (new (callback: MutationCallback) => MutationObserver) | undefined;
  if (!Native) return;
  if (win[MO_PATCHED]) return;
  win[MO_PATCHED] = true;

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

  const Patched = class extends Native {
    constructor(callback: MutationCallback) {
      super((records: MutationRecord[], observer: MutationObserver) => {
        callback(sanitize(records), observer);
      });
    }
  } as unknown as typeof MutationObserver;

  try {
    Object.defineProperty(Patched, 'name', { configurable: true, value: MO });
  } catch {
    /* 忽略 */
  }
  markNative(Patched, MO);

  try {
    Object.defineProperty(Patched.prototype, 'constructor', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: Native,
    });
  } catch {
    /* 忽略 */
  }

  win[MO] = Patched;
}

function patchBodyTraversal(): void {
  const body = document.body;
  if (!body || patchedBodies.has(body)) return;
  patchedBodies.add(body);

  const getterOf = (proto: object, key: string): ((this: unknown) => unknown) | undefined => {
    const desc = Object.getOwnPropertyDescriptor(proto, key);
    return typeof desc?.get === 'function' ? (desc.get as (this: unknown) => unknown) : undefined;
  };

  const gChildNodes = getterOf(Node.prototype, CHILD_NODES);
  const gChildren = getterOf(Element.prototype, CHILDREN);
  const gFirstChild = getterOf(Node.prototype, FIRST_CHILD);
  const gLastChild = getterOf(Node.prototype, LAST_CHILD);
  const gFirstElementChild = getterOf(Element.prototype, FIRST_ELEMENT_CHILD);
  const gLastElementChild = getterOf(Element.prototype, LAST_ELEMENT_CHILD);
  const gChildElementCount = getterOf(Element.prototype, CHILD_ELEMENT_COUNT);

  const def = (key: string, get: (this: HTMLElement) => unknown): void => {
    try {
      Object.defineProperty(body, key, { configurable: true, enumerable: false, get });
    } catch {
      /* 忽略 */
    }
  };

  if (gChildNodes) {
    const get = function (this: HTMLElement): NodeListOf<Node> {
      return filterNodeList(gChildNodes.call(this) as ArrayLike<Node>);
    };
    markAccessor(get, CHILD_NODES);
    def(CHILD_NODES, get);
  }

  if (gChildren) {
    const get = function (this: HTMLElement): HTMLCollection {
      return filterHTMLCollection(gChildren.call(this) as ArrayLike<Element>);
    };
    markAccessor(get, CHILDREN);
    def(CHILDREN, get);
  }

  if (gFirstChild) {
    const get = function (this: HTMLElement): Node | null {
      if (protectedHosts.size === 0) return gFirstChild.call(this) as Node | null;
      let n = gFirstChild.call(this) as Node | null;
      while (n && isProtectedFast(n)) n = n.nextSibling;
      return n;
    };
    markAccessor(get, FIRST_CHILD);
    def(FIRST_CHILD, get);
  }

  if (gLastChild) {
    const get = function (this: HTMLElement): Node | null {
      if (protectedHosts.size === 0) return gLastChild.call(this) as Node | null;
      let n = gLastChild.call(this) as Node | null;
      while (n && isProtectedFast(n)) n = n.previousSibling;
      return n;
    };
    markAccessor(get, LAST_CHILD);
    def(LAST_CHILD, get);
  }

  if (gFirstElementChild) {
    const get = function (this: HTMLElement): Element | null {
      if (protectedHosts.size === 0) return gFirstElementChild.call(this) as Element | null;
      let el = gFirstElementChild.call(this) as Element | null;
      while (el && protectedHosts.has(el as HTMLElement)) el = el.nextElementSibling;
      return el;
    };
    markAccessor(get, FIRST_ELEMENT_CHILD);
    def(FIRST_ELEMENT_CHILD, get);
  }

  if (gLastElementChild) {
    const get = function (this: HTMLElement): Element | null {
      if (protectedHosts.size === 0) return gLastElementChild.call(this) as Element | null;
      let el = gLastElementChild.call(this) as Element | null;
      while (el && protectedHosts.has(el as HTMLElement)) el = el.previousElementSibling;
      return el;
    };
    markAccessor(get, LAST_ELEMENT_CHILD);
    def(LAST_ELEMENT_CHILD, get);
  }

  if (gChildElementCount) {
    const get = function (this: HTMLElement): number {
      if (protectedHosts.size === 0) return gChildElementCount.call(this) as number;
      let count = gChildElementCount.call(this) as number;
      if (count > 0) {
        const col = gChildren?.call(this) as HTMLCollection | undefined;
        if (col) {
          for (let i = 0; i < col.length; i++) {
            if (protectedHosts.has(col[i] as HTMLElement)) count--;
          }
        }
      }
      return count;
    };
    markAccessor(get, CHILD_ELEMENT_COUNT);
    def(CHILD_ELEMENT_COUNT, get);
  }
}

export function installStealth(): void {
  patchQueryApis();
  patchMutationObserver();
  patchBodyTraversal();
}

export interface StealthHost {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
}

export function createStealthHost(styles: string): StealthHost {
  const doc = document as unknown as Record<PropertyKey, unknown>;
  const createEl = doc[CREATE_ELEMENT] as (tag: string) => HTMLElement;
  const tag = HOST_TAGS[(Math.random() * HOST_TAGS.length) | 0];
  const host = createEl(tag);
  protectedHosts.add(host);

  const hostRec = host as unknown as Record<PropertyKey, unknown>;
  const root = (hostRec[ATTACH_SHADOW] as (o: Record<PropertyKey, unknown>) => ShadowRoot)({
    [MODE]: CLOSED,
  });

  const style = createEl(STYLE) as HTMLStyleElement;
  (style as unknown as Record<PropertyKey, unknown>)[TEXT_CONTENT] = styles;
  const rootRec = root as unknown as Record<PropertyKey, unknown>;
  (rootRec[APPEND_CHILD] as (n: Node) => void)(style);

  let inserted = false;
  let attempts = 0;
  const insert = (): void => {
    if (inserted) return;
    if (++attempts > 90) return; // 兜底：防止页面异常时无限循环空转
    const body = doc[BODY] as HTMLElement | null;
    if (body) {
      inserted = true;
      ((body as unknown as Record<PropertyKey, unknown>)[APPEND_CHILD] as (n: Node) => void)(host);
      patchBodyTraversal();
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
