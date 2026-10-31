import fs from 'node:fs';
import path from 'node:path';

const nodeDir=path.dirname(process.execPath);
const candidates=[
  path.join(nodeDir,'node_modules','npm','bin','npm-cli.js'),
  path.join(nodeDir,'..','lib','node_modules','npm','bin','npm-cli.js'),
];

export const npmCliPath=candidates.find((candidate)=>fs.existsSync(candidate))??null;

export const resolveNpmCommand=(args=[])=>(
  npmCliPath
    ? {command:process.execPath,args:[npmCliPath,...args]}
    : {command:'npm',args}
);
