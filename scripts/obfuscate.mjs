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
          controlFlowFlattening: false,
          deadCodeInjection: false,
          debugProtection: false,
          disableConsoleOutput: false,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          selfDefending: false,
          simplify: true,
          splitStrings: false,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 1,
          transformObjectKeys: false,
          unicodeEscapeSequence: false,
        }).getObfuscatedCode();

        file.code = header + result;
      }
    },
  };
}
