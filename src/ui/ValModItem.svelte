<script lang="ts">
  import type { ScratchValMod, ValModValue } from '../core';
  import { listValueToString } from '../core';
  import lockIcon from '../assets/lock.svg?raw';
  import unlockIcon from '../assets/unlock.svg?raw';

  let {
    variable,
    onupdate,
    ontoggleLock,
    oneditstart,
    oneditend,
  }: {
    variable: ScratchValMod;
    onupdate: (v: ScratchValMod, value: ValModValue) => void;
    ontoggleLock: (v: ScratchValMod) => void;
    oneditstart: () => void;
    oneditend: () => void;
  } = $props();

  let draft = $state('');
  let focused = $state(false);

  $effect(() => {
    if (focused) return;
    const text = listValueToString(variable.value);
    if (text !== draft) draft = text;
  });

  function onFocus() {
    focused = true;
    draft = listValueToString(variable.value);
    oneditstart();
  }

  function onBlur() {
    if (draft !== listValueToString(variable.value)) {
      onupdate(variable, draft);
    }
    focused = false;
    oneditend();
  }

  function onInput() {
    if (variable.isLocked) {
      onupdate(variable, draft);
    }
  }

  function keyboardGuard(node: HTMLInputElement) {
    const host = (node.getRootNode() as ShadowRoot).host;
    const onKeydownCapture = (e: KeyboardEvent) => {
      if (!host || !e.composedPath().includes(host)) return;
      e.stopPropagation();
      if (e.key === 'Enter') {
        node.blur();
      }
    };
    window.addEventListener('keydown', onKeydownCapture, true);
    return {
      destroy() {
        window.removeEventListener('keydown', onKeydownCapture, true);
      },
    };
  }
</script>

<div class="ui-item" class:ui-item-locked={variable.isLocked}>
  <div class="ui-info">
    <div class="ui-name-row">
      <span class="ui-name" title={variable.name}>{variable.name}</span>
      <em class="ui-kind" class:ui-kind-list={variable.kind === 'list'}>
        {variable.kind === 'list' ? '列表' : '变量'}
      </em>
    </div>
  </div>

  <div class="ui-controls">
    <button
      class="ui-lock-btn"
      class:ui-lock-on={variable.isLocked}
      onclick={() => ontoggleLock(variable)}
      title={variable.isLocked ? '解锁' : '锁定'}
      aria-label={variable.isLocked ? '解锁' : '锁定'}
    >
      {#if variable.isLocked}
        {@html lockIcon}
      {:else}
        {@html unlockIcon}
      {/if}
    </button>
    <input
      class="ui-input ui-value-input"
      type="text"
      use:keyboardGuard
      bind:value={draft}
      oninput={onInput}
      onfocus={onFocus}
      onblur={onBlur}
      spellcheck="false"
    />
  </div>
</div>
