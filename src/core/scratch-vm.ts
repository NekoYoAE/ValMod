import {
  BridgeStatus,
  type BridgeOptions,
  type NameLockOptions,
  type ScratchValue,
  type ScratchVariable,
  type VariableLockInfo,
  type VariableValue,
} from './types';
import { findVmViaFiber, isVMLike, normalizeValue, sleep } from './utils';

interface LockEntry {
  timer: ReturnType<typeof setTimeout> | null;
  targetId: string;
  value: ScratchValue;
  interval: number;
}

export type BridgeEvent =
  | { type: 'status'; payload: { status: BridgeStatus; info?: string } }
  | { type: 'variables'; payload: ScratchVariable[] }
  | { type: 'error'; payload: Error };

export type BridgeListener = (event: BridgeEvent) => void;

export class ScratchVM {
  readonly options: Required<Pick<BridgeOptions, 'pollInterval' | 'connectTimeout'>> &
    Omit<BridgeOptions, 'pollInterval' | 'connectTimeout'>;

  private vm: unknown = null;
  private status: BridgeStatus = BridgeStatus.Disconnected;
  private statusInfo = '';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private snapshot = '';
  private listeners = new Set<BridgeListener>();

  private locks = new Map<string, LockEntry>();
  private bindOrig: typeof Function.prototype.bind | null = null;
  private bindHookInstalled = false;
  private bindHookTried = false;

  constructor(options: BridgeOptions = {}) {
    this.options = {
      pollInterval: 500,
      connectTimeout: 30_000,
      ...options,
    };
  }

  get connected(): boolean {
    return this.status === BridgeStatus.Connected;
  }

  getStatus(): BridgeStatus {
    return this.status;
  }

  getStatusInfo(): string {
    return this.statusInfo;
  }

  get rawVM(): unknown {
    return this.vm;
  }

  subscribe(listener: BridgeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    this.setStatus(BridgeStatus.Connecting, '等待获取vm');
    try {
      this.installBindHook();
      const vm = await this.waitForVM();
      this.restoreBindHook();
      this.vm = vm;
      this.startPolling();
      this.bindVM();
      this.setStatus(BridgeStatus.Connected, '已获取vm');
      this.emitVariables();
    } catch (err) {
      this.restoreBindHook();
      this.vm = null;
      this.emit({ type: 'error', payload: err instanceof Error ? err : new Error(String(err)) });
      this.setStatus(BridgeStatus.Error, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  disconnect(): void {
    this.restoreBindHook();
    this.unbindVM();
    this.stopPolling();
    this.clearAllLocks();
    this.vm = null;
    this.snapshot = '';
    this.setStatus(BridgeStatus.Disconnected);
  }

  getVariables(): ScratchVariable[] {
    const vm = this.vm as { runtime?: { targets?: unknown[] } } | null;
    if (!vm?.runtime?.targets) return [];

    const result: ScratchVariable[] = [];
    for (const target of vm.runtime.targets as Array<{
      id?: string;
      variables?: Map<string, { name?: string; value?: unknown; isCloud?: boolean }> | Record<string, { name?: string; value?: unknown; isCloud?: boolean }>;
      getName?: () => string;
    }>) {
      if (!target?.variables) continue;
      const entries =
        target.variables instanceof Map
          ? [...target.variables.entries()]
          : Object.entries(target.variables);
      for (const [id, variable] of entries) {
        if (variable?.name === undefined) continue;
        const lock = this.locks.get(id);
        const isList = Array.isArray(variable.value);
        result.push({
          id,
          name: variable.name,
          kind: isList ? 'list' : 'variable',
          value: lock ? lock.value : normalizeValue(variable.value),
          isCloud: Boolean(variable.isCloud),
          targetId: target.id ?? '',
          targetName: target.getName?.() ?? '舞台',
          isLocked: Boolean(lock),
        });
      }
    }
    return result;
  }

  setVariable(variableId: string, value: ScratchValue, targetId: string): boolean {
    const ok = this.writeVariable(variableId, value, targetId);
    if (!ok) {
      this.emit({
        type: 'error',
        payload: new Error(`设置变量失败：${variableId}`),
      });
    }
    return ok;
  }

  lockVariable(
    variableId: string,
    value: ScratchValue,
    targetId: string,
    interval = 0,
  ): boolean {
    if (!this.vm || !targetId) return false;
    this.unlockVariable(variableId);
    const entry: LockEntry = {
      timer: null,
      targetId,
      value,
      interval,
    };
    const tick = () => {
      if (!this.locks.has(variableId)) return;
      this.writeVariable(variableId, entry.value, targetId);
      entry.timer = setTimeout(tick, Math.max(0, interval));
    };
    entry.timer = setTimeout(tick, 0);
    this.locks.set(variableId, entry);
    this.writeVariable(variableId, value, targetId);
    this.scheduleEmit();
    return true;
  }

  unlockVariable(variableId: string): void {
    const entry = this.locks.get(variableId);
    if (!entry) return;
    if (entry.timer !== null) clearTimeout(entry.timer);
    this.locks.delete(variableId);
    this.scheduleEmit();
  }

  clearAllLocks(): void {
    for (const entry of this.locks.values()) {
      if (entry.timer !== null) clearTimeout(entry.timer);
    }
    this.locks.clear();
    this.scheduleEmit();
  }

  isVariableLocked(variableId: string): boolean {
    return this.locks.has(variableId);
  }

  getLockedVariableIds(): string[] {
    return [...this.locks.keys()];
  }

  getLockedVariables(): VariableLockInfo[] {
    return [...this.locks.entries()].map(([variableId, e]) => ({
      variableId,
      targetId: e.targetId,
      value: e.value,
      interval: e.interval,
    }));
  }

  updateLockedVariableValue(variableId: string, value: ScratchValue): void {
    const entry = this.locks.get(variableId);
    if (entry) entry.value = value;
  }

  lockVariablesByName(options: NameLockOptions): number {
    const { names, value, interval = 30 } = options;
    const nameSet = new Set(names);
    let count = 0;
    for (const v of this.getVariables()) {
      if (!nameSet.has(v.name) || this.locks.has(v.id)) continue;
      if (this.lockVariable(v.id, value, v.targetId, interval)) count++;
    }
    return count;
  }

  unlockVariablesByIds(ids: string[]): void {
    for (const id of ids) this.unlockVariable(id);
  }

  private writeVariable(variableId: string, value: ScratchValue, targetId: string): boolean {
    const vm = this.vm as {
      setVariableValue?: (targetId: string, variableId: string, value: ScratchValue) => boolean | void;
      runtime?: {
        getTargetById?: (tid: string) =>
          | {
              variables?: Map<string, { value: unknown }> | Record<string, { value: unknown }>;
            }
          | undefined;
        requestUpdate?: () => void;
      };
    } | null;
    if (!vm) return false;

    if (typeof vm.setVariableValue === 'function') {
      try {
        if (vm.setVariableValue(targetId, variableId, value) !== false) {
          return true;
        }
      } catch {}

    }

    try {
      const target = vm.runtime?.getTargetById?.(targetId);
      const variables = target?.variables;
      if (variables) {
        const variable =
          variables instanceof Map ? variables.get(variableId) : variables[variableId];
        if (variable) {
          variable.value = value;
          vm.runtime?.requestUpdate?.();
          return true;
        }
      }
    } catch {}
    return false;
  }

  private scheduleEmit(): void {
    if (this.status === BridgeStatus.Connected) {
      queueMicrotask(() => this.emitVariables());
    }
  }

  private emit(event: BridgeEvent): void {
    for (const listener of this.listeners) listener(event);
    if (event.type === 'status') {
      this.options.onStatusChange?.(event.payload.status, event.payload.info);
    } else if (event.type === 'variables') {
      this.options.onVariablesChange?.(event.payload);
    } else {
      this.options.onError?.(event.payload);
    }
  }

  private setStatus(status: BridgeStatus, info = ''): void {
    this.status = status;
    this.statusInfo = info;
    this.emit({ type: 'status', payload: { status, info } });
  }

  private async waitForVM(): Promise<unknown> {
    const deadline = Date.now() + this.options.connectTimeout;
    while (Date.now() < deadline) {
      if (this.vm) return this.vm;
      const vm = this.discoverVM();
      if (vm) return vm;
      await sleep(300);
    }
    throw new Error(
      `获取vm超时 ${this.options.connectTimeout} `,
    );
  }

  private discoverVM(): unknown {
    const windowVM = (window as unknown as { vm?: unknown }).vm;
    if (isVMLike(windowVM)) return windowVM;
    const fiberVM = findVmViaFiber();
    if (isVMLike(fiberVM)) return fiberVM;
    return null;
  }

  private installBindHook(): void {
    if (this.bindHookInstalled || this.bindHookTried) return;
    this.bindHookTried = true;
    this.bindOrig = Function.prototype.bind;
    const self = this;
    (Function.prototype as unknown as { bind: typeof Function.prototype.bind }).bind = function (
      self2: unknown,
      ...args: unknown[]
    ) {
      const bound = self.bindOrig?.call(this, self2, ...args);
      if (
        !self.vm &&
        self2 &&
        typeof self2 === 'object' &&
        (self2 as { runtime?: { targets?: unknown } }).runtime?.targets
      ) {
        self.vm = self2;
        self.restoreBindHook();
      }
      return bound;
    };
    this.bindHookInstalled = true;
  }

  private restoreBindHook(): void {
    if (!this.bindHookInstalled || !this.bindOrig) return;
    (Function.prototype as unknown as { bind: typeof Function.prototype.bind }).bind =
      this.bindOrig;
    this.bindHookInstalled = false;
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.emitVariables(), this.options.pollInterval);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private bindVM(): void {
    const vm = this.vm as { on?: (event: string, cb: () => void) => void };
    vm.on?.('targetsUpdate', this.emitVariables);
    vm.on?.('PROJECT_RUN_START', this.emitVariables);
  }

  private unbindVM(): void {
    const vm = this.vm as { off?: (event: string, cb: () => void) => void };
    vm.off?.('targetsUpdate', this.emitVariables);
    vm.off?.('PROJECT_RUN_START', this.emitVariables);
  }

  private emitVariables = (): void => {
    const list = this.getVariables();
    const snapshot = JSON.stringify(list);
    if (snapshot === this.snapshot) return;
    this.snapshot = snapshot;
    this.emit({ type: 'variables', payload: list });
  };
}

export type { BridgeStatus, ScratchVariable, VariableValue };
