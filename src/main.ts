import { mount } from 'svelte';
import { ScratchVM } from './core';
import { createStealthHost, installStealth } from './dom-utils';
import { shouldHalt, terminate } from './core/guard';
import ValModPanel from './ui/ValModPanel.svelte';
import globalCss from './styles/global.css?inline';

installStealth();

let booted = false;

function boot(): void {
  if (booted) return;
  booted = true;

  const { root } = createStealthHost(globalCss);
  const mountEl = document.createElement('div');
  root.appendChild(mountEl);

  const bridge = new ScratchVM({ pollInterval: 500 });

  mount(ValModPanel, {
    target: mountEl,
    props: { bridge },
  });

  bridge.connect().catch(() => {
  });
}

async function start(): Promise<void> {
  if (await shouldHalt()) {
    terminate();
    return;
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}

void start();
