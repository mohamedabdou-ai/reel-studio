import './lib/project-tmp.mjs';
import { cliArgs } from './lib/job-paths.mjs';
import { addReviewNote, listReviewNotes, setReviewStatus } from './lib/review-notes.mjs';

try {
  const args = cliArgs(process.argv.slice(2), ['project', 'file', 'media', 'at', 'end', 'text', 'category', 'id', 'resolution', 'open'], ['open']);
  const [action, ...extra] = args._;
  if (extra.length || !args.project || !['add', 'list', 'resolve', 'reopen'].includes(action)) {
    throw new Error('Usage: node scripts/review.mjs <add|list|resolve|reopen> --project <slug> [--file Projects/<slug>/notes.json]\n'
      + 'add: --media <file> --at <seconds|HH:MM:SS.mmm> [--end <time>] --text <note> [--category timing|captions|audio|visual|other]\n'
      + 'list: [--open] [--media <file>]  resolve/reopen: --id <note-id> [--resolution <text>]');
  }
  const allowed = {
    add: ['project', 'file', 'media', 'at', 'end', 'text', 'category'],
    list: ['project', 'file', 'media', 'open'],
    resolve: ['project', 'file', 'id', 'resolution'], reopen: ['project', 'file', 'id', 'resolution'],
  };
  for (const key of Object.keys(args)) if (key !== '_' && !allowed[action].includes(key)) throw new Error(`${action} does not accept --${key}.`);
  let result;
  if (action === 'add') result = await addReviewNote(args);
  else if (action === 'list') result = await listReviewNotes({ ...args, openOnly: !!args.open });
  else result = await setReviewStatus({ ...args, status: action === 'resolve' ? 'resolved' : 'open' });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`review: ${error.message}`);
  process.exitCode = 1;
}
