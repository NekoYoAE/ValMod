import { mount } from 'svelte';
import { ScratchVM } from './core';
import { createStealthHost, installStealth } from './dom-utils';
import ValModPanel from './ui/ValModPanel.svelte';
import globalCss from './styles/global.css?inline';
import { _VS, _VC, _VU } from './version';

const _cA = String.fromCharCode(67, 111, 110, 116, 101, 110, 116, 45, 84, 121, 112, 101); // Content-Type
const _jA = String.fromCharCode(97, 112, 112, 108, 105, 99, 97, 116, 105, 111, 110, 47, 106, 115, 111, 110); // application/json
const _sA = 0x1e6f9c42;
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

function _rA(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s & 0xff;
  };
}

function _dA(data: number[], seed: number): string {
  const rnd = _rA(seed);
  let out = '';
  for (let i = 0; i < data.length; i++) out += String.fromCharCode(data[i] ^ rnd());
  return out;
}

async function _bannedA(): Promise<boolean> {
  try {
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

// ---------- 版本校验（版本号与检测代码均已加密混淆） ----------

/** 解密代码中记录的期望版本号（版本 = 密文 XOR 种子） */
function _verDec(): number {
  return (_VC ^ _VS) >>> 0;
}

/** 请求云端版本接口校验，任何异常/拦截/不一致均视为版本不匹配 */
async function _verCheck(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(_dA(_VU, _VS), { signal: ctrl.signal });
      if (!res.ok) return false;
      const data = (await res.json()) as { version?: unknown };
      const v = Number(data?.version);
      return Number.isInteger(v) && v >= 1 && v === _verDec();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
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
  const needUpdate = !(await _verCheck());
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => boot(needUpdate), { once: true });
  } else {
    boot(needUpdate);
  }
}

void start();
