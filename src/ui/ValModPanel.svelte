<script lang="ts">
  import {
    BridgeStatus,
    type BridgeListener,
    type ScratchVM,
    type ScratchValue,
    type ScratchValMod,
    type ValModValue,
    normalizeValue,
    stringToListValue,
  } from '../core';
  import ValModItem from './ValModItem.svelte';
  import refreshIcon from '../assets/refresh.svg?raw';
  import closeIcon from '../assets/close.svg?raw';
  import downloadIcon from '../assets/download.svg?raw';
  import uploadIcon from '../assets/upload.svg?raw';
  import icon from '../assets/icon.svg?raw';

  let { bridge }: { bridge: ScratchVM } = $props();

  let status: BridgeStatus = $state(BridgeStatus.Disconnected);
  let variables: ScratchValMod[] = $state([]);
  let errorMsg = $state('');
  let minimized = $state(true);
  let editing = $state(false);
  let panelEl: HTMLElement | undefined = $state();
  let bodyEl: HTMLElement | undefined = $state();
  let expandedGroups = $state(new Set<string>());

  type SavedPanelState = {
    left: number;
    top: number;
    width: number;
    height: number;
    docked: boolean;
  };
  const PANEL_STORAGE_KEY = '_p';
  const LEGACY_PANEL_STORAGE_KEY = 'valmod.panel.state';
  let savedState = $state<SavedPanelState | null>(null);

  function readSavedState(): SavedPanelState | null {
    try {
      let raw = localStorage.getItem(PANEL_STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(LEGACY_PANEL_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedPanelState;
      if (parsed && typeof parsed.left === 'number' && typeof parsed.top === 'number') {
        try {
          localStorage.removeItem(LEGACY_PANEL_STORAGE_KEY);
        } catch {}
        return parsed;
      }
    } catch {}
    return null;
  }

  function minimize() {
    const panel = panelEl;
    if (panel) {
      const rect = panel.getBoundingClientRect();
      savedState = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        docked: !panel.style.left || panel.style.left === 'auto',
      };
      try {
        localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(savedState));
      } catch {}
    }
    minimized = true;
  }

  function expand() {
    minimized = false;
  }

  function applySavedState() {
    const panel = panelEl;
    if (!panel) return;
    const state = savedState ?? readSavedState();
    if (!state) return;
    if (!state.docked) {
      panel.style.left = `${state.left}px`;
      panel.style.top = `${state.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
    if (state.width) panel.style.width = `${state.width}px`;
    if (state.height) panel.style.height = `${state.height}px`;
  }

  const groups = $derived.by(() => {
    const map = new Map<string, ScratchValMod[]>();
    for (const v of variables) {
      const key = v.targetName || '未命名目标';
      const list = map.get(key) ?? [];
      list.push(v);
      map.set(key, list);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  });

  let unsubscribe: (() => void) | undefined;

  $effect(() => {
    status = bridge.getStatus();
    errorMsg = bridge.getStatusInfo();
    variables = bridge.getVariables();

    const listener: BridgeListener = (event) => {
      if (event.type === 'status') {
        status = event.payload.status;
        errorMsg =
          event.payload.status === BridgeStatus.Error ? event.payload.info ?? '未知错误' : '';
      } else if (event.type === 'variables') {
        if (!editing) variables = event.payload;
      } else {
        errorMsg = event.payload.message;
      }
    };
    unsubscribe = bridge.subscribe(listener);
    return () => unsubscribe?.();
  });

  $effect(() => {
    if (minimized || !panelEl) return;
    applySavedState();
  });

  const MAX_PANEL_HEIGHT = 560;

  function autoGrowPanel() {
    const panel = panelEl;
    const body = bodyEl;
    if (!panel || !body) return;
    const maxH = Math.min(MAX_PANEL_HEIGHT, window.innerHeight * 0.8);
    const naturalH = panel.offsetHeight - body.clientHeight + body.scrollHeight;
    if (naturalH <= panel.offsetHeight) return;
    const target = Math.min(naturalH, maxH);
    if (target > panel.offsetHeight) {
      panel.style.height = `${target}px`;
    }
  }

  $effect(() => {
    void variables;
    void expandedGroups;
    if (minimized || !panelEl || !bodyEl) return;
    const timer = setTimeout(() => {
      if (minimized) return;
      autoGrowPanel();
    }, 150);
    return () => clearTimeout(timer);
  });

  async function connect() {
    errorMsg = '';
    try {
      await bridge.connect();
    } catch {}
  }

  function updateValMod(variable: ScratchValMod, value: ValModValue) {
    const newValue: ScratchValue =
      variable.kind === 'list' ? stringToListValue(String(value)) : value;
    bridge.updateLockedVariableValue(variable.id, newValue);
    const ok = bridge.setVariable(variable.id, newValue, variable.targetId);
    if (!ok) {
      errorMsg = `${variable.kind === 'list' ? '列表' : '变量'} ${variable.name} 不存在`;
    }
  }

  function toggleLock(v: ScratchValMod) {
    if (bridge.isVariableLocked(v.id)) {
      bridge.unlockVariable(v.id);
    } else {
      bridge.lockVariable(v.id, v.value, v.targetId, 0);
    }
  }

  function startDrag(e: MouseEvent) {
    const panel = panelEl;
    if (!panel || (e.target as HTMLElement).closest('button')) return;
    const rect = panel.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const move = (ev: MouseEvent) => {
      panel.style.left = `${Math.max(0, ev.clientX - offsetX)}px`;
      panel.style.top = `${Math.max(0, ev.clientY - offsetY)}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function startResize(e: MouseEvent) {
    const panel = panelEl;
    if (!panel) return;
    e.preventDefault();
    e.stopPropagation();
    const MIN_SIZE = 200;
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panel.offsetWidth;
    const startHeight = panel.offsetHeight;

    const move = (ev: MouseEvent) => {
      const w = Math.max(MIN_SIZE, startWidth + (ev.clientX - startX));
      const h = Math.max(MIN_SIZE, startHeight + (ev.clientY - startY));
      panel.style.width = `${w}px`;
      panel.style.height = `${h}px`;
    };
    const up = () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    document.body.style.cursor = 'nwse-resize';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function startEdit() {
    editing = true;
  }

  function endEdit() {
    editing = false;
    variables = bridge.getVariables();
  }

  function refresh() {
    if (editing) return;
    variables = bridge.getVariables();
  }

  function toggleGroup(name: string) {
    const next = new Set(expandedGroups);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    expandedGroups = next;
  }

  type ConfigVariable = {
    name: string;
    targetName: string;
    kind: 'variable' | 'list';
    value: ScratchValue;
    isLocked: boolean;
    lockInterval?: number;
  };
  type ValModConfig = {
    app: 'ValMod';
    project: string;
    exportedAt: string;
    variables: ConfigVariable[];
  };

  let toast = $state<{ text: string; kind: 'ok' | 'err' } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let fileInputEl: HTMLInputElement | undefined = $state();

  function showToast(text: string, kind: 'ok' | 'err' = 'ok') {
    toast = { text, kind };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 2500);
  }

  const isCcwDetailPage = $derived(
    window.location.hostname === 'www.ccw.site' &&
      /^\/detail\//.test(window.location.pathname),
  );

  function getProjectOid(): string | null {
    const match = window.location.href.match(/\/detail\/([0-9a-fA-F]+)/);
    return match ? match[1] : null;
  }

  function exportConfig() {
    const list = bridge.getVariables();
    if (list.length === 0) {
      showToast('当前没有可导出的配置', 'err');
      return;
    }
    const oid = getProjectOid();
    if (!oid) {
      showToast('无法从当前网址获取项目 oid', 'err');
      return;
    }
    const lockIntervalMap = new Map(
      bridge.getLockedVariables().map((l) => [l.variableId, l.interval]),
    );
    const config: ValModConfig = {
      app: 'ValMod',
      project: oid,
      exportedAt: new Date().toISOString(),
      variables: list.map((v) => ({
        name: v.name,
        targetName: v.targetName,
        kind: v.kind,
        value: v.value,
        isLocked: v.isLocked,
        lockInterval: v.isLocked ? (lockIntervalMap.get(v.id) ?? 0) : undefined,
      })),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ValMod-config-${oid}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`已导出变量配置`);
  }

  function importConfig() {
    if (!bridge.connected) {
      showToast('请先连接到项目再导入配置', 'err');
      return;
    }
    fileInputEl?.click();
  }

  function toScratchValue(kind: 'variable' | 'list', raw: unknown): ScratchValue {
    if (kind === 'list') {
      return Array.isArray(raw) ? (raw as ScratchValue) : stringToListValue(String(raw));
    }
    if (Array.isArray(raw)) return String(raw[0] ?? '');
    return normalizeValue(raw);
  }

  async function onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const config = JSON.parse(await file.text()) as Partial<ValModConfig>;
      const items = config?.variables;
      if (!Array.isArray(items)) {
        showToast('配置格式不正确，缺少 variables 字段', 'err');
        return;
      }
      if (config.app && config.app !== 'ValMod') {
        showToast('非标准配置文件', 'err');
        return;
      }
      const currentOid = getProjectOid();
      if (!currentOid) {
        showToast('无法获取项目oid', 'err');
        return;
      }
      if (config.project !== currentOid) {
        showToast(
          config.project
            ? '配置文件属于其他项目，不支持此项目'
            : '配置文件数据缺失',
          'err',
        );
        return;
      }
      const current = bridge.getVariables();
      let matched = 0;
      for (const item of items) {
        if (typeof item?.name !== 'string' || item.value === undefined) continue;
        const kind: 'variable' | 'list' = item.kind === 'list' ? 'list' : 'variable';
        const byName = current.filter((v) => v.kind === kind && v.name === item.name);
        const candidates = byName.length > 0 ? byName : current.filter((v) => v.name === item.name);
        const exact = candidates.filter((v) => v.targetName === item.targetName);
        const targets = exact.length > 0 ? exact : candidates;
        const value = toScratchValue(kind, item.value);
        for (const v of targets) {
          bridge.updateLockedVariableValue(v.id, value);
          bridge.setVariable(v.id, value, v.targetId);
          if (item.isLocked) {
            bridge.lockVariable(v.id, value, v.targetId, item.lockInterval ?? 0);
          } else {
            bridge.unlockVariable(v.id);
          }
          matched++;
        }
      }
      variables = bridge.getVariables();
      if (matched === 0) {
        showToast('导入完成，但没有匹配到可应用的变量', 'err');
      } else {
        showToast(`已导入变量配置`);
      }
    } catch (err) {
      showToast(
        `导入失败：${err instanceof Error ? err.message : String(err)}`,
        'err',
      );
    }
  }
</script>

<div class="svp">
  {#if minimized}
    <button class="svp-fab" onclick={expand} title="展开面板" aria-label="展开面板">
      {@html icon}
    </button>
  {:else}
    <section bind:this={panelEl} class="svp-panel">
      <header
        role="toolbar"
        tabindex="0"
        class="svp-header"
        onmousedown={startDrag}
        ondblclick={minimize}
      >
        <span class="svp-title">
          <span class="svp-title-icon">{@html icon}</span>
          ValMod
        </span>
        <div class="svp-actions">
          {#if isCcwDetailPage}
            <button
              class="svp-icon-btn"
              onclick={importConfig}
              title="导入配置"
              aria-label="导入配置"
            >
              {@html uploadIcon}
            </button>
            <button
              class="svp-icon-btn"
              onclick={exportConfig}
              title="导出配置"
              aria-label="导出配置"
            >
              {@html downloadIcon}
            </button>
            <input
              bind:this={fileInputEl}
              class="svp-file-input"
              type="file"
              accept=".json,application/json"
              tabindex="-1"
              onchange={onFileSelected}
            />
          {/if}
          <button class="svp-icon-btn" onclick={refresh} title="刷新" aria-label="刷新">
            {@html refreshIcon}
          </button>
          <button class="svp-icon-btn" onclick={minimize} title="收起" aria-label="收起">
            {@html closeIcon}
          </button>
        </div>
      </header>

      <div bind:this={bodyEl} class="svp-body">
        {#if toast}
          <div class="svp-toast" class:svp-toast-err={toast.kind === 'err'}>
            {toast.text}
          </div>
        {/if}
        {#if status === BridgeStatus.Error}
          <div class="svp-error">
            <p>{errorMsg}</p>
            <button class="svp-btn" onclick={connect}>重新获取</button>
          </div>
        {:else if status === BridgeStatus.Connecting}
          <div class="svp-loading">等待获取vm</div>
        {:else}
          {#each groups as g (g.name)}
            <div class="svp-group">
              <button
                type="button"
                class="svp-group-title"
                class:svp-group-collapsed={!expandedGroups.has(g.name)}
                aria-expanded={expandedGroups.has(g.name)}
                onclick={() => toggleGroup(g.name)}
              >
                <span
                  class="svp-caret"
                  class:svp-caret-open={expandedGroups.has(g.name)}
                  aria-hidden="true"
                ></span>
                <span class="svp-group-name">{g.name}</span>
                <em>{g.items.length}</em>
              </button>
              {#if expandedGroups.has(g.name)}
                <div class="svp-group-items">
                  {#each g.items as v (v.id)}
                    <ValModItem
                      variable={v}
                      onupdate={updateValMod}
                      ontoggleLock={toggleLock}
                      oneditstart={startEdit}
                      oneditend={endEdit}
                    />
                  {/each}
                </div>
              {/if}
            </div>
          {/each}

          {#if groups.length === 0}
            <div class="svp-empty">当前项目没有可修改的变量</div>
          {/if}
        {/if}
      </div>
      <button class="svp-resize-handle" onmousedown={startResize} aria-label="拖拽调整面板大小"></button>
    </section>
  {/if}
</div>
