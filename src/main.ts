import { mount } from 'svelte';
import { ScratchVM } from './core';
import { createStealthHost, installStealth } from './dom-utils';
import ValModPanel from './ui/ValModPanel.svelte';
import globalCss from './styles/global.css?inline';

installStealth();

let booted = false;

function boot(needUpdate: boolean): void {
  if (booted) return;
  booted = true;

  const { root } = createStealthHost(globalCss);
  const mountEl = document.createElement('div');
  root.appendChild(mountEl);

  const bridge = new ScratchVM({ pollInterval: 500 });

  mount(ValModPanel, {
    target: mountEl,
    props: { bridge, updateRequired: needUpdate },
  });

  if (!needUpdate) {
    bridge.connect().catch(() => {
    });
  }
}

async function start(): Promise<void> {
  const needUpdate = !(await __guard__());
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => boot(needUpdate), { once: true });
  } else {
    boot(needUpdate);
  }
}

void start();
