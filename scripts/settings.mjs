import {parseArgs} from 'node:util';
import {ROOT} from './lib/project-paths.mjs';
import {createSettingsServer} from './lib/settings-server.mjs';

export async function runSettings(args = []) {
  const {values} = parseArgs({args, options: {port: {type: 'string'}}, strict: true});
  const port = values.port === undefined ? 0 : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Settings port must be from 0 to 65535.');
  const app = await createSettingsServer({root: ROOT, port});
  console.log('شاشة الإعدادات جاهزة — افتح الرابط وعدّل اختياراتك.');
  console.log(JSON.stringify({ok: true, url: app.url, command: 'settings'}));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().then(() => process.exit(0)));
  return app;
}
