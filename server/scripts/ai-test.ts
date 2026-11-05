import { askJson } from '../src/ai';

askJson('Reply with only this JSON: {"ok": true}', 'ping')
  .then((r) => console.log('AI works:', JSON.stringify(r)))
  .catch((e) => console.error('AI error:', e.message));
