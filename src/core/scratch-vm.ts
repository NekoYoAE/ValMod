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
import { markNative } from './stealth';

interface LockEntry {
  targetId: string;
  value: ScratchValue;
  interval: number;
  lastWrite: number;
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

  private static readonly LOCK_FALLBACK_MS = 100;
  private static readonly EMIT_MIN_INTERVAL = 100;
  private static readonly BIND_HOOK_DELAY_MS = 3000;

  private suppressWriteback = new Set<string>();
  private lockTickerTimer: ReturnType<typeof setTimeout> | null = null;
  private vmChangeHookInstalled = false;
  private emitScheduled = false;
  private lastEmitAttempt = 0;

  constructor(options: BridgeOptions = {}) {
    this.options = {
      pollInterval: 500,
      connectTimeout: 60_000,
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
    this.stopLockTicker();
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
      const variables = target.variables;
      const pushVariable = (
        id: string,
        variable: { name?: string; value?: unknown; isCloud?: boolean },
      ) => {
        if (variable?.name === undefined) return;
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
      };
      if (variables instanceof Map) {
        for (const [id, variable] of variables) pushVariable(id, variable);
      } else {
        for (const [id, variable] of Object.entries(variables)) pushVariable(id, variable);
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
      targetId,
      value: this.snapshotValue(value),
      interval: Math.max(0, interval),
      lastWrite: 0,
    };
    this.locks.set(variableId, entry);
    this.installVariableChangeHook();
    this.writeLockValue(variableId, entry);
    this.startLockTicker();
    this.scheduleEmit();
    return true;
  }

  unlockVariable(variableId: string): void {
    if (!this.locks.delete(variableId)) return;
    this.scheduleEmit();
  }

  clearAllLocks(): void {
    if (this.locks.size === 0) return;
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
    if (entry) entry.value = this.snapshotValue(value);
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

  private snapshotValue(value: ScratchValue): ScratchValue {
    return Array.isArray(value) ? (value.slice() as VariableValue[]) : value;
  }

  private writeLockValue(variableId: string, entry: LockEntry): boolean {
    return this.writeVariable(variableId, this.snapshotValue(entry.value), entry.targetId);
  }

  private peekVariable(variableId: string, targetId: string): unknown {
    try {
      const vm = this.vm as {
        getVariableValue?: (targetId: string, variableId: string) => unknown;
        runtime?: {
          getTargetById?: (
            tid: string,
          ) =>
            | {
                variables?:
                  | Map<string, { value: unknown }>
                  | Record<string, { value: unknown }>;
              }
            | undefined;
        };
      } | null;
      if (!vm) return undefined;
      if (typeof vm.getVariableValue === 'function') {
        return vm.getVariableValue(targetId, variableId);
      }
      const target = vm.runtime?.getTargetById?.(targetId);
      const variables = target?.variables;
      if (variables) {
        const variable =
          variables instanceof Map ? variables.get(variableId) : variables[variableId];
        return variable?.value;
      }
    } catch {}
    return undefined;
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }
    return a === b;
  }

  private startLockTicker(): void {
    if (this.lockTickerTimer !== null) return;
    this.lockTickerTimer = setTimeout(this.tickLocks, ScratchVM.LOCK_FALLBACK_MS);
  }

  private stopLockTicker(): void {
    if (this.lockTickerTimer !== null) {
      clearTimeout(this.lockTickerTimer);
      this.lockTickerTimer = null;
    }
  }

  private tickLocks = (): void => {
    this.lockTickerTimer = null;
    if (this.locks.size === 0) return;
    const now = Date.now();
    for (const [id, entry] of this.locks) {
      if (entry.interval > 0 && now - entry.lastWrite < entry.interval) continue;
      const current = this.peekVariable(id, entry.targetId);
      if (!this.valuesEqual(current, entry.value)) {
        this.suppressWriteback.add(id);
        try {
          this.writeLockValue(id, entry);
        } finally {
          this.suppressWriteback.delete(id);
        }
      }
      entry.lastWrite = now;
    }
    this.lockTickerTimer = setTimeout(this.tickLocks, ScratchVM.LOCK_FALLBACK_MS);
  };

  private onVariableChange = (variable?: unknown): void => {
    const v = variable as { id?: unknown } | null;
    if (!v || typeof v.id !== 'string') return;
    if (this.suppressWriteback.has(v.id)) return;
    const entry = this.locks.get(v.id);
    if (!entry || entry.interval > 0) return;
    this.suppressWriteback.add(v.id);
    try {
      this.writeLockValue(v.id, entry);
    } finally {
      this.suppressWriteback.delete(v.id);
    }
  };

  private installVariableChangeHook(): void {
    if (this.vmChangeHookInstalled) return;
    const vm = this.vm as { on?: (event: string, cb: (variable?: unknown) => void) => void };
    vm.on?.('variableChange', this.onVariableChange);
    this.vmChangeHookInstalled = true;
  }

  private removeVariableChangeHook(): void {
    if (!this.vmChangeHookInstalled) return;
    const vm = this.vm as { off?: (event: string, cb: (variable?: unknown) => void) => void };
    vm.off?.('variableChange', this.onVariableChange);
    this.vmChangeHookInstalled = false;
  }

  private scheduleEmit(): void {
    if (this.status !== BridgeStatus.Connected || this.emitScheduled) return;
    this.emitScheduled = true;
    queueMicrotask(() => {
      this.emitScheduled = false;
      this.emitVariables();
    });
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
    const startedAt = Date.now();
    const deadline = startedAt + this.options.connectTimeout;
    while (Date.now() < deadline) {
      if (this.vm) return this.vm;
      const vm = this.discoverVM();
      if (vm) return vm;
      if (Date.now() - startedAt >= ScratchVM.BIND_HOOK_DELAY_MS) {
        this.installBindHook();
      }
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
    const hooked = function (this: Function, self2: unknown, ...args: unknown[]): unknown {
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
    markNative(hooked, 'bind');
    (Function.prototype as unknown as { bind: typeof Function.prototype.bind }).bind = hooked;
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
    this.installVariableChangeHook();
  }

  private unbindVM(): void {
    this.removeVariableChangeHook();
    const vm = this.vm as { off?: (event: string, cb: () => void) => void };
    vm.off?.('targetsUpdate', this.emitVariables);
    vm.off?.('PROJECT_RUN_START', this.emitVariables);
  }

  private emitVariables = (): void => {
    const now = Date.now();
    if (now - this.lastEmitAttempt < ScratchVM.EMIT_MIN_INTERVAL) return;
    this.lastEmitAttempt = now;
    const list = this.getVariables();
    const snapshot = JSON.stringify(list);
    if (snapshot === this.snapshot) return;
    this.snapshot = snapshot;
    this.emit({ type: 'variables', payload: list });
  };
}

export type { BridgeStatus, ScratchVariable, VariableValue };
