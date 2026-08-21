/// <reference types="vite/client" />
/// <reference types="svelte" />

declare module '*.css?inline' {
  const css: string;
  export default css;
}
