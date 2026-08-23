import type { Plugin } from 'vite';

export function readVersionParams(): { seed: number; cipher: number; vh: number; vu: number[] };

export function generateVersionGuard(): string;

export function versionGuardPlugin(): Plugin;
