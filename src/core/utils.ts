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

export function findVmViaFiber(): unknown {
  const root = document.getElementById('app');
  if (!root) return null;

  const fiberKey = Object.keys(root).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
  );
  if (!fiberKey) return null;

  const seen = new Set<object>();
  const queue: object[] = [(root as unknown as Record<string, unknown>)[fiberKey] as object];
  let budget = 200_000;

  while (queue.length && budget-- > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);

    const memoizedProps = (node as { memoizedProps?: unknown }).memoizedProps as
      | Record<string, unknown>
      | undefined;
    if (memoizedProps && isVMLike(memoizedProps.vm)) {
      return memoizedProps.vm;
    }

    const fiber = node as {
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
