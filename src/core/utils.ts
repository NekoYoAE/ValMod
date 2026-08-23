import type { ScratchValue, VariableValue } from './types';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isVMLike(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const vm = value as Record<string, unknown>;
  return (
    typeof vm.setVariableValue === 'function' &&
    typeof vm.getVariableValue === 'function' &&
    vm.runtime !== undefined &&
    typeof (vm.runtime as { targets?: unknown }).targets !== 'undefined'
  );
}

function scanFiberFromNode(node: object): unknown {
  const seen = new Set<object>();
  const queue: object[] = [node];
  let budget = 200_000;

  while (queue.length && budget-- > 0) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);

    const memoizedProps = (cur as { memoizedProps?: unknown }).memoizedProps as
      | Record<string, unknown>
      | undefined;
    if (memoizedProps && isVMLike(memoizedProps.vm)) {
      return memoizedProps.vm;
    }

    const fiber = cur as {
      return?: unknown;
      child?: unknown;
      sibling?: unknown;
    };
    if (fiber.return) queue.push(fiber.return as object);
    if (fiber.child) queue.push(fiber.child as object);
    if (fiber.sibling) queue.push(fiber.sibling as object);
  }
  return null;
}

export function findVmViaFiber(): unknown {
  const candidates: Element[] = [];
  const app = document.getElementById('app');
  if (app) candidates.push(app);
  const root = document.getElementById('root');
  if (root && root !== app) candidates.push(root);

  // 兜底：不同站点 React 根节点 id 可能不同，扫描常见根标记与 fiber key
  if (candidates.length === 0) {
    let budget = 4096;
    const all = document.querySelectorAll('*');
    for (let i = 0; i < all.length && budget-- > 0; i++) {
      const el = all[i];
      if (!el) continue;
      if (el.hasAttribute('data-reactroot')) {
        candidates.push(el);
        break;
      }
      const keys = Object.keys(el);
      let found = false;
      for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
          candidates.push(el);
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }

  for (const el of candidates) {
    const fiberKey = Object.keys(el).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
    );
    if (!fiberKey) continue;
    const start = (el as unknown as Record<string, unknown>)[fiberKey];
    if (!start || typeof start !== 'object') continue;
    const vm = scanFiberFromNode(start as object);
    if (vm) return vm;
  }
  return null;
}

export function normalizeValue(value: unknown): ScratchValue {
  if (Array.isArray(value)) return value as VariableValue[];
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  return value === undefined || value === null ? '' : String(value);
}

export function listValueToString(value: unknown): string {
  if (!Array.isArray(value)) return String(value ?? '');
  return value.map((item) => String(item)).join(', ');
}

export function stringToListValue(input: string): VariableValue[] {
  return input.split(',').map((item) => {
    const s = item.trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s !== '' && !Number.isNaN(Number(s))) return Number(s);
    return s;
  });
}

export function coerceValue(
  input: string,
  current: string | number | boolean,
): string | number | boolean {
  if (typeof current === 'number') {
    const n = Number(input);
    return Number.isNaN(n) ? current : n;
  }
  if (typeof current === 'boolean') {
    return input === 'true';
  }
  return input;
}
