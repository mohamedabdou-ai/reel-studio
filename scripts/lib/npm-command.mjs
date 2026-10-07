import path from 'node:path';

export const npmCliPath=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');

export const resolveNpmCommand=(args=[])=>({
  command:process.execPath,
  args:[npmCliPath,...args],
});
