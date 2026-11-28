import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { AgentMailService } from './agent-mail.service';

describe('AgentMailService', () => {
  let directory: string;
  let capturePath: string;
  let service: AgentMailService;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'teamflow-mail-test-'));
    capturePath = path.join(directory, 'capture.json');
    const cliPath = path.join(directory, 'fake-cli.cjs');
    await writeFile(
      cliPath,
      `const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('+me')) {
  console.log(JSON.stringify({ ok: true, data: { aliases: [{ email: 'bot@example.com', is_primary: true }] } }));
  process.exit(0);
}
if (args.includes('+send')) {
  const bodyFile = args[args.indexOf('--body-file') + 1];
  const body = fs.readFileSync(path.join(process.cwd(), bodyFile), 'utf8');
  fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ args, body }));
  console.log(JSON.stringify({ ok: true, data: { message_id: 'msg_test' } }));
  process.exit(0);
}
process.exit(2);
`,
      'utf8',
    );
    const config = {
      get: (key: string) => {
        if (key === 'AGENT_MAIL_ENABLED') return true;
        if (key === 'AGENT_MAIL_CLI_ENTRY') return cliPath;
        return undefined;
      },
    } as unknown as ConfigService;
    service = new AgentMailService(config);
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('reads the authorized sender from the CLI', async () => {
    const status = await service.status(true);
    expect(status.enabled).toBe(true);
    expect(status.available).toBe(true);
    expect(status.sender).toBe('bot@example.com');
  });

  it('sends through the CLI after explicit confirmation and passes the body via file', async () => {
    const result = await service.send({
      recipients: ['alice@example.com', 'bob@example.com'],
      subject: '本周项目周报',
      body: '第一行\n第二行',
    });
    expect(result).toMatchObject({
      messageId: 'msg_test',
      sender: 'bot@example.com',
      recipients: ['alice@example.com', 'bob@example.com'],
    });
    const captured = JSON.parse(await readFile(capturePath, 'utf8')) as {
      args: string[];
      body: string;
    };
    expect(captured.args).toEqual(
      expect.arrayContaining([
        'message',
        '+send',
        '--to',
        'alice@example.com',
        '--to',
        'bob@example.com',
        '--subject',
        '本周项目周报',
        '--body-file',
        'body.txt',
        '--confirmed',
      ]),
    );
    expect(captured.body).toBe('第一行\n第二行');
  });

  it('refuses to send when Agent Mail is disabled', async () => {
    const disabled = new AgentMailService({
      get: () => false,
    } as unknown as ConfigService);
    const status = await disabled.status(true);
    expect(status).toMatchObject({ enabled: false, available: false });
    await expect(
      disabled.send({ recipients: ['alice@example.com'], subject: 'x', body: 'x' }),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_CONFIGURED' });
  });
});
