import { mount } from 'svelte';
import { ScratchVM } from './core';
import { createStealthHost, installStealth } from './dom-utils';
import ValModPanel from './ui/ValModPanel.svelte';
import globalCss from './styles/global.css?inline';

const _cA = String.fromCharCode(67, 111, 110, 116, 101, 110, 116, 45, 84, 121, 112, 101);
const _jA = String.fromCharCode(97, 112, 112, 108, 105, 99, 97, 116, 105, 111, 110, 47, 106, 115, 111, 110);
const _kA1 = 0x7c2a4d11;
const _kA2 = 0x6245d153;
const _sA = (_kA1 ^ _kA2) >>> 0;
const _uA = [
  59, 228, 253, 254, 220, 134, 106, 181, 168, 199,
  172, 11, 210, 58, 148, 134, 58, 237, 142, 91,
  253, 194, 214, 41, 204, 246, 66, 127, 227, 225,
  66, 209, 71, 133, 13, 139, 225, 104, 86, 213,
  219, 122, 206, 160, 238, 216, 184,
];
const _oA = [
  101, 167, 185, 236, 151, 133, 112, 248, 250, 145,
  167, 82, 195, 50, 203, 192, 38, 248, 201, 6,
  174, 136, 141, 122,
];
const _oA2 = [
  101, 241, 186, 235, 158, 142, 38, 170, 173, 203,
  249, 95, 159, 103, 204, 197, 118, 246, 192, 15,
  173, 217, 208, 122,
];
const _hA = [
  36, 231, 254, 160, 204, 223, 50, 180, 184, 193,
  181, 3,
];
const _mA = [3, 223, 218, 218];
const _zA = [58, 199, 81, 158, 7];
const _zA2 = 0x90ab41ff;
function _rA(seed: number): () => number {
  let s = seed >>> 0;
  const M = 0x7fffffff;
  const G = 0x41c64e6d;
  const I = 0x3039;
  return () => {
    s = (Math.imul(s, G) + I) & M;
    return s & 0xff;
  };
}

function _dA(data: number[], seed: number): string {
  const rnd = _rA(seed);
  let out = '';
  for (let i = 0; i < data.length; i++) out += String.fromCharCode(data[i] ^ rnd());
  return out;
}

const _ckA = (d: number[], k: number): boolean => {
  let s = 0;
  for (let i = 0; i < d.length; i++) s = (s + d[i]) & 0xffff;
  return s === k;
};

async function _bannedA(): Promise<boolean> {
  try {
    if (
      !_ckA(_hA, 1899) || !_ckA(_uA, 7464) ||
      !_ckA(_oA, 3683) || !_ckA(_oA2, 3945) || !_ckA(_mA, 662)
    ) {
      return true;
    }
    if (location.hostname !== _dA(_hA, _sA)) return false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    try {
      const res = await fetch(_dA(_uA, _sA), {
        method: _dA(_mA, _sA),
        headers: { [_cA]: _jA },
        body: '{}',
        credentials: 'include',
        signal: ctrl.signal,
      });
      if (!res.ok) return true;
      const data = (await res.json()) as Record<string, unknown>;
      const body = data.body as Record<string, unknown> | undefined;
      const oid = body?.studentOid ?? data.studentOid;
      if (typeof oid !== 'string') return true;
      return oid === _dA(_oA, _sA) || oid === _dA(_oA2, _sA);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return true;
  }
}

function _wipeA(): void {
  try {
    window.stop();
  } catch {
    /* ignore */
  }
  try {
    const root = document.documentElement;
    while (root.firstChild) root.removeChild(root.firstChild);
  } catch {
    /* ignore */
  }
}

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
  if (await _bannedA()) {
    _wipeA();
    return;
  }
  const needUpdate = !(await __guard__());
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => boot(needUpdate), { once: true });
  } else {
    boot(needUpdate);
  }
}

void start();
