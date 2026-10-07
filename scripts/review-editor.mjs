import './lib/project-tmp.mjs';
import { spawn } from 'node:child_process';
import { cliArgs } from './lib/job-paths.mjs';


const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => {
  const code = typeof rest[0] === 'object' && rest[0] ? rest[0].code : rest[1];
  if (code === 'MODULE_TYPELESS_PACKAGE_JSON' || /Reparsing as ES module/.test(String(warning?.message ?? warning))) return;
  return emitWarning(warning, ...rest);
};
const { createReviewServer } = await import('./lib/review-editor-server.mjs');

const usage = 'Usage: review-editor.mjs <Projects/<slug>/edit.json> [--port n] [--open] [--dev]';
const DEFAULT_PORT = 4177;

async function main() {
  const args = cliArgs(process.argv.slice(2), ['port', 'open', 'dev'], ['open', 'dev']);
  if (args._.length !== 1) throw new Error(usage);
  const port = args.port === undefined ? DEFAULT_PORT : Number(args.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port must be 0-65535, got ${args.port}`);
  const log = (m) => process.stderr.write(`[review-editor] ${m}\n`);

  let running;
  try {
    running = await createReviewServer({ manifestPath: args._[0], port, dev: !!args.dev, log });
  } catch (error) {

    if (error?.code !== 'EADDRINUSE' || args.port !== undefined) throw error;
    running = await createReviewServer({ manifestPath: args._[0], port: 0, dev: !!args.dev, log });
  }
  log(`app built in ${running.bundle.ms} ms (${(running.bundle.bytes / 1048576).toFixed(1)} MB, panels: ${running.bundle.panels.join(', ') || 'none'})`);
  console.log(running.url);
  log('Ctrl-C to stop.');

  if (args.open) spawn('cmd', ['/c', 'start', '""', running.url.replace(/&/g, '^&')], { stdio: 'ignore', detached: true, windowsHide: true }).unref();

  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    if (running.jobs.busy()) log('a job is still running: stopping it before exit.');
    await running.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  process.on('exit', () => running.jobs.killActiveSync());
}

main().catch((error) => {
  console.error(`review-editor: ${error?.message ?? error}`);
  process.exit(1);
});
