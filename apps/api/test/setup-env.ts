import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from 'dotenv';

for (const file of ['../../.env', '.env']) {
  if (existsSync(file)) config({ path: file });
}

process.env.NODE_ENV = 'test';
process.env.ENABLE_REALTIME = 'false';
process.env.ENABLE_JOBS = 'false';
process.env.REALTIME_PORT = '1246';
process.env.AI_BASE_URL = '';
process.env.AI_API_KEY = '';
process.env.AI_MODEL = '';

const mailDirectory = mkdtempSync(path.join(tmpdir(), 'teamflow-e2e-mail-'));
const fakeCli = path.join(mailDirectory, 'fake-cli.cjs');
writeFileSync(
  fakeCli,
  `const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('+me')) {
  console.log(JSON.stringify({ ok: true, data: { aliases: [{ email: 'bot@example.com', is_primary: true }] } }));
  process.exit(0);
}
if (args.includes('+send')) {
  const body = fs.readFileSync(path.join(process.cwd(), args[args.indexOf('--body-file') + 1]), 'utf8');
  fs.writeFileSync(process.env.AGENT_MAIL_CAPTURE, JSON.stringify({ args, body }));
  console.log(JSON.stringify({ ok: true, data: { message_id: 'msg_e2e' } }));
  process.exit(0);
}
process.exit(2);
`,
  'utf8',
);
process.env.AGENT_MAIL_ENABLED = 'true';
process.env.AGENT_MAIL_CLI_ENTRY = fakeCli;
process.env.AGENT_MAIL_CAPTURE = path.join(mailDirectory, 'capture.json');
process.env.AGENT_MAIL_FAKE_DIR = mailDirectory;
