import {createHash} from 'node:crypto';


export const manifestRevision = text => createHash('sha256').update(text, 'utf8').digest('hex');
