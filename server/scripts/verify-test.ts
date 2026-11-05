import fs from 'fs';
import { verifyPhoto } from '../src/verify';

const [file, ...rest] = process.argv.slice(2);
const criteria = rest.join(' ') || 'Photos showing 20 fully assembled wooden desk frames with bolted joints.';
verifyPhoto(criteria, fs.readFileSync(file).toString('base64'))
  .then((r) => console.log(r))
  .catch((e) => console.error('ERROR:', e.message));
