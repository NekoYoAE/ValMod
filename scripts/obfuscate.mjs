import javascriptObfuscator from 'javascript-obfuscator';

export function obfuscateUserscript() {
  return {
    name: 'obfuscate-userscript',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (!file || file.type !== 'chunk' || !file.fileName.endsWith('.js')) continue;
        const code = file.code;
        if (typeof code !== 'string' || !code.includes('==UserScript==')) continue;

        const headerMatch = code.match(/^(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*)/);
        const header = headerMatch ? headerMatch[1] : '';
        const body = header ? code.slice(header.length) : code;
        if (!body.trim()) continue;

        const result = javascriptObfuscator.obfuscate(body, {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.6,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.35,
          debugProtection: false,
          disableConsoleOutput: false,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          selfDefending: false,
          simplify: true,
          splitStrings: true,
          splitStringsChunkLength: 6,
          stringArray: true,
          stringArrayEncoding: ['rc4'],
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayThreshold: 1,
          stringArrayWrappersCount: 3,
          transformObjectKeys: false,
          unicodeEscapeSequence: false,
        }).getObfuscatedCode();

        file.code = header + result;
      }
    },
  };
}
