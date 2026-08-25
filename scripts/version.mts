import type { Plugin } from 'vite';

export function readVersionParams(): { seed: number; cipher: number; vu: number[] };

export function generateVersionGuard(): { name: string; code: string };

export function versionGuardPlugin(): Plugin;
