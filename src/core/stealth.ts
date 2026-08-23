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

function isProtectedFast(node: Node): boolean {
  return node.nodeType === NODE_TYPE_ELEMENT && protectedHosts.has(node as HTMLElement);
}

function markNative(fn: object, name: string): void {
  try {
    Object.defineProperty(fn, 'name', {
      configurable: true,
      value: name,
    });
  } catch {
    /* 忽略 */
  }
  try {
    Object.defineProperty(fn, 'toString', {
      configurable: true,
      writable: false,
      value: () => `function ${name}() { [native code] }`,
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

function filterNodeList<T extends Element>(nodes: ArrayLike<T>): NodeListOf<T> {
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
  const origDocGEBId = Document.prototype.getElementById as (
    this: Document,
    elementId: string,
  ) => HTMLElement | null;
  const origDocGEBCN = Document.prototype.getElementsByClassName as (
    this: Document,
    classNames: string,
  ) => HTMLCollectionOf<Element>;
  const origDocGEBTN = Document.prototype.getElementsByTagName as (
    this: Document,
    qualifiedName: string,
  ) => HTMLCollectionOf<Element>;
  const origDocGEBTNNS = Document.prototype.getElementsByTagNameNS as (
    this: Document,
    namespaceURI: string | null,
    localName: string,
  ) => HTMLCollectionOf<Element>;
  const origDocGEBN = Document.prototype.getElementsByName as (
    this: Document,
    elementName: string,
  ) => NodeListOf<HTMLElement>;

  const origElQS = Element.prototype.querySelector as (
    this: Element,
    selectors: string,
  ) => Element | null;
  const origElQSA = Element.prototype.querySelectorAll as (
    this: Element,
    selectors: string,
  ) => NodeListOf<Element>;
  const origElGEBCN = Element.prototype.getElementsByClassName as (
    this: Element,
    classNames: string,
  ) => HTMLCollectionOf<Element>;
  const origElGEBTN = Element.prototype.getElementsByTagName as (
    this: Element,
    qualifiedName: string,
  ) => HTMLCollectionOf<Element>;
  const origElGEBTNNS = Element.prototype.getElementsByTagNameNS as (
    this: Element,
    namespaceURI: string | null,
    localName: string,
  ) => HTMLCollectionOf<Element>;
  const origElClosest = Element.prototype.closest as (
    this: Element,
    selectors: string,
  ) => Element | null;

  const docQS = function (this: Document, selectors: string): Element | null {
    return filterSingle(origDocQS.call(this, selectors));
  };
  markNative(docQS, 'querySelector');
  Document.prototype.querySelector = docQS as typeof Document.prototype.querySelector;

  const docQSA = function (this: Document, selectors: string): NodeListOf<Element> {
    return filterNodeList(origDocQSA.call(this, selectors));
  };
  markNative(docQSA, 'querySelectorAll');
  Document.prototype.querySelectorAll = docQSA as typeof Document.prototype.querySelectorAll;

  const docEFP = function (this: Document, x: number, y: number): Element | null {
    return filterSingle(origDocEFP.call(this, x, y));
  };
  markNative(docEFP, 'elementFromPoint');
  Document.prototype.elementFromPoint = docEFP as typeof Document.prototype.elementFromPoint;

  const docEFPs = function (this: Document, x: number, y: number): Element[] {
    return filterElementArray(origDocEFPs.call(this, x, y));
  };
  markNative(docEFPs, 'elementsFromPoint');
  Document.prototype.elementsFromPoint = docEFPs as typeof Document.prototype.elementsFromPoint;

  const elQS = function (this: Element, selectors: string): Element | null {
    return filterSingle(origElQS.call(this, selectors));
  };
  markNative(elQS, 'querySelector');
  Element.prototype.querySelector = elQS as typeof Element.prototype.querySelector;

  const elQSA = function (this: Element, selectors: string): NodeListOf<Element> {
    return filterNodeList(origElQSA.call(this, selectors));
  };
  markNative(elQSA, 'querySelectorAll');
  Element.prototype.querySelectorAll = elQSA as typeof Element.prototype.querySelectorAll;

  const docGEBId = function (this: Document, elementId: string): HTMLElement | null {
    return filterSingle(origDocGEBId.call(this, elementId));
  };
  markNative(docGEBId, 'getElementById');
  Document.prototype.getElementById = docGEBId as typeof Document.prototype.getElementById;

  const docGEBCN = function (this: Document, classNames: string): HTMLCollectionOf<Element> {
    return filterHTMLCollection(origDocGEBCN.call(this, classNames)) as HTMLCollectionOf<Element>;
  };
  markNative(docGEBCN, 'getElementsByClassName');
  Document.prototype.getElementsByClassName = docGEBCN as typeof Document.prototype.getElementsByClassName;

  const elGEBCN = function (this: Element, classNames: string): HTMLCollectionOf<Element> {
    return filterHTMLCollection(origElGEBCN.call(this, classNames)) as HTMLCollectionOf<Element>;
  };
  markNative(elGEBCN, 'getElementsByClassName');
  Element.prototype.getElementsByClassName = elGEBCN as typeof Element.prototype.getElementsByClassName;

  const docGEBTN = function (this: Document, qualifiedName: string): HTMLCollectionOf<Element> {
    return filterHTMLCollection(origDocGEBTN.call(this, qualifiedName)) as HTMLCollectionOf<Element>;
  };
  markNative(docGEBTN, 'getElementsByTagName');
  Document.prototype.getElementsByTagName = docGEBTN as typeof Document.prototype.getElementsByTagName;

  const elGEBTN = function (this: Element, qualifiedName: string): HTMLCollectionOf<Element> {
    return filterHTMLCollection(origElGEBTN.call(this, qualifiedName)) as HTMLCollectionOf<Element>;
  };
  markNative(elGEBTN, 'getElementsByTagName');
  Element.prototype.getElementsByTagName = elGEBTN as typeof Element.prototype.getElementsByTagName;

  const docGEBTNNS = function (
    this: Document,
    namespaceURI: string | null,
    localName: string,
  ): HTMLCollectionOf<Element> {
    return filterHTMLCollection(
      origDocGEBTNNS.call(this, namespaceURI, localName),
    ) as HTMLCollectionOf<Element>;
  };
  markNative(docGEBTNNS, 'getElementsByTagNameNS');
  Document.prototype.getElementsByTagNameNS = docGEBTNNS as typeof Document.prototype.getElementsByTagNameNS;

  const elGEBTNNS = function (
    this: Element,
    namespaceURI: string | null,
    localName: string,
  ): HTMLCollectionOf<Element> {
    return filterHTMLCollection(
      origElGEBTNNS.call(this, namespaceURI, localName),
    ) as HTMLCollectionOf<Element>;
  };
  markNative(elGEBTNNS, 'getElementsByTagNameNS');
  Element.prototype.getElementsByTagNameNS = elGEBTNNS as typeof Element.prototype.getElementsByTagNameNS;

  const docGEBN = function (this: Document, elementName: string): NodeListOf<HTMLElement> {
    return filterNodeList(origDocGEBN.call(this, elementName));
  };
  markNative(docGEBN, 'getElementsByName');
  Document.prototype.getElementsByName = docGEBN as typeof Document.prototype.getElementsByName;

  const elClosest = function (this: Element, selectors: string): Element | null {
    return filterSingle(origElClosest.call(this, selectors));
  };
  markNative(elClosest, 'closest');
  Element.prototype.closest = elClosest as typeof Element.prototype.closest;
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
