import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:4000/api/v1';

let sharedAccessToken: string | null = null;

async function authenticate(page: Page): Promise<string> {
  if (!sharedAccessToken) {
    const response = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com', password: 'Passw0rd!' }),
    });
    if (!response.ok) throw new Error(`E2E login failed: ${response.status}`);
    const body = (await response.json()) as { accessToken: string };
    sharedAccessToken = body.accessToken;
  }
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: sharedAccessToken }),
    }),
  );
  return sharedAccessToken;
}

async function openDemoProject(page: Page) {
  await page
    .getByRole('link', { name: /打开项目 毕业设计协作/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /毕业设计协作/ })).toBeVisible();
}

async function demoProjectId(token: string): Promise<string> {
  const projects = await fetch(`${API}/projects`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((response) => response.json() as Promise<{ items: Array<{ id: string; name: string }> }>);
  const project = projects.items.find((item) => item.name === '毕业设计协作') ?? projects.items[0];
  if (!project) throw new Error('No demo project');
  return project.id;
}

async function expectJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

test.describe('critical flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('dashboard and realtime board render', async ({ page }) => {
    await page.context().clearCookies();
    await authenticate(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /打开项目/ }).first()).toBeVisible();
    await openDemoProject(page);
    await expect(page.getByText('待办').first()).toBeVisible();
    await expect(page.getByText('进行中').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '新建任务', exact: true })).toBeVisible();
  });

  test('create a task and open its drawer', async ({ page }) => {
    const token = await authenticate(page);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    await page.goto('/');
    await expect(page.getByRole('link', { name: /打开项目/ }).first()).toBeVisible();
    await openDemoProject(page);
    const projectId = new URL(page.url()).pathname.split('/')[2]!;
    const title = `E2E UI 任务 ${Date.now()}`;
    try {
      await page.getByRole('button', { name: '新建任务', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('新建任务')).toBeVisible();
      await dialog.getByLabel('标题').fill(title);
      await dialog.getByLabel('工时估算（小时）').fill('2');
      await dialog.getByRole('button', { name: '创建任务' }).click();
      await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });
      const createdCard = page.getByRole('button', { name: new RegExp(`打开任务：${title}`) });
      await expect(createdCard).toContainText('2h');
      await page.getByRole('button', { name: `打开任务：${title}` }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog').getByText(title).first()).toBeVisible();
    } finally {
      const board = await fetch(`${API}/projects/${projectId}/board`, { headers }).then(
        (response) => response.json() as Promise<{ tasks: Array<{ id: string; title: string }> }>,
      );
      const created = board.tasks.find((task) => task.title === title);
      if (created) await fetch(`${API}/tasks/${created.id}`, { method: 'DELETE', headers });
    }
  });

  test('board groups tasks by assignee and resumes drag when ungrouped', async ({ page }) => {
    await authenticate(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /打开项目/ }).first()).toBeVisible();
    await openDemoProject(page);

    const groupSelect = page.getByRole('combobox', { name: '任务分组' });
    await groupSelect.click();
    await page.getByRole('option', { name: '按负责人' }).click();

    await expect(
      page.getByText('分组视图用于浏览；拖拽排序请切换「不分组」').first(),
    ).toBeVisible();
    await expect(page.getByRole('group', { name: /Alice：/ }).first()).toBeVisible();
    await expect(page.getByRole('group', { name: /未指派：/ }).first()).toBeVisible();
    await expect(page.getByLabel(/拖动任务：/)).toHaveCount(0);

    await groupSelect.click();
    await page.getByRole('option', { name: '不分组' }).click();
    await expect(page.getByText('分组视图用于浏览；拖拽排序请切换「不分组」').first()).toBeHidden();
    await expect(page.getByLabel(/拖动任务：/).first()).toBeVisible();
  });

  test('board bulk actions update priority, assignee and completion', async ({ page }) => {
    const token = await authenticate(page);
    const projectId = await demoProjectId(token);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const board = await fetch(`${API}/projects/${projectId}/board`, { headers }).then((response) =>
      expectJson<{
        columns: Array<{ id: string; name: string; isDone: boolean }>;
        members: Array<{ userId: string; name: string }>;
      }>(response, 'load board'),
    );
    const column = board.columns.find((item) => !item.isDone);
    const doneColumn = board.columns.find((item) => item.isDone);
    const target = board.members[0];
    if (!column) throw new Error('Demo project has no non-done column');
    if (!doneColumn) throw new Error('Demo project has no done column');
    if (!target) throw new Error('Demo project has no members');

    const suffix = Date.now();
    const titles = [`E2E 批量 A ${suffix}`, `E2E 批量 B ${suffix}`];
    const created: Array<{ id: string }> = [];
    try {
      for (const title of titles) {
        const task = await fetch(`${API}/projects/${projectId}/tasks`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ title, columnId: column.id, priority: 'LOW' }),
        }).then((response) => expectJson<{ id: string }>(response, `create task ${title}`));
        created.push(task);
      }

      await page.goto('/');
      await expect(page.getByRole('link', { name: /打开项目/ }).first()).toBeVisible();
      await openDemoProject(page);
      await page.getByRole('button', { name: '批量选择', exact: true }).click();

      for (const title of titles) {
        await page.getByRole('checkbox', { name: `选择任务：${title}` }).check();
      }
      const bulk = page.getByRole('region', { name: '批量操作' });
      await expect(bulk).toBeVisible();
      await expect(bulk.getByText('已选 2 个任务')).toBeVisible();

      // 筛选变化后必须清空选择，避免批量操作误伤当前不可见的任务。
      const search = page.getByRole('textbox', { name: '搜索任务标题' });
      await search.fill(titles[0]!);
      await expect(bulk).toBeHidden();
      await expect(page.getByRole('button', { name: '退出批量' })).toBeVisible();
      await search.fill('');
      for (const title of titles) {
        await page.getByRole('checkbox', { name: `选择任务：${title}` }).check();
      }
      await expect(bulk.getByText('已选 2 个任务')).toBeVisible();

      await page.getByRole('combobox', { name: '批量设置优先级' }).click();
      await page.getByRole('option', { name: '高' }).click();
      await expect(page.getByText(/已更新 2 个任务/).first()).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(
          async () => {
            const latest = await fetch(`${API}/projects/${projectId}/board`, { headers }).then(
              (response) =>
                expectJson<{
                  tasks: Array<{ title: string; priority: string }>;
                }>(response, 'poll priority'),
            );
            return titles.every(
              (title) => latest.tasks.find((task) => task.title === title)?.priority === 'HIGH',
            );
          },
          { timeout: 15_000 },
        )
        .toBe(true);

      await page.getByRole('combobox', { name: '批量设置负责人' }).click();
      await page.getByRole('option', { name: target.name }).click();
      await expect
        .poll(
          async () => {
            const latest = await fetch(`${API}/projects/${projectId}/board`, { headers }).then(
              (response) =>
                expectJson<{
                  tasks: Array<{ title: string; assignee: { userId: string } | null }>;
                }>(response, 'poll assignee'),
            );
            return titles.every(
              (title) =>
                latest.tasks.find((task) => task.title === title)?.assignee?.userId ===
                target.userId,
            );
          },
          { timeout: 15_000 },
        )
        .toBe(true);

      await page.getByRole('button', { name: '移入完成列' }).click();
      await expect(page.getByText(/已移入完成列 2 个/).first()).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(
          async () => {
            const latest = await fetch(`${API}/projects/${projectId}/board`, { headers }).then(
              (response) =>
                expectJson<{
                  tasks: Array<{ title: string; completedAt: string | null }>;
                }>(response, 'poll completion'),
            );
            return titles.every(
              (title) => latest.tasks.find((task) => task.title === title)?.completedAt !== null,
            );
          },
          { timeout: 15_000 },
        )
        .toBe(true);
      for (const title of titles) {
        await expect(page.getByLabel(`列：${doneColumn.name}`).getByText(title)).toBeVisible({
          timeout: 10_000,
        });
      }
      await expect(page.getByRole('region', { name: '批量操作' })).toHaveCount(0);
    } finally {
      for (const task of created) {
        await fetch(`${API}/tasks/${task.id}`, { method: 'DELETE', headers });
      }
    }
  });

  test('board bulk completion keeps blocked tasks selected on partial failure', async ({ page }) => {
    const token = await authenticate(page);
    const projectId = await demoProjectId(token);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const board = await fetch(`${API}/projects/${projectId}/board`, { headers }).then((response) =>
      expectJson<{
        columns: Array<{ id: string; name: string; isDone: boolean }>;
      }>(response, 'load board'),
    );
    const column = board.columns.find((item) => !item.isDone);
    const doneColumn = board.columns.find((item) => item.isDone);
    if (!column) throw new Error('Demo project has no non-done column');
    if (!doneColumn) throw new Error('Demo project has no done column');

    const suffix = Date.now();
    const blockerTitle = `E2E 批量阻塞源 ${suffix}`;
    const blockedTitle = `E2E 批量被阻塞 ${suffix}`;
    const freeTitle = `E2E 批量可完成 ${suffix}`;
    const created: Array<{ id: string }> = [];
    try {
      for (const title of [blockerTitle, blockedTitle, freeTitle]) {
        const task = await fetch(`${API}/projects/${projectId}/tasks`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ title, columnId: column.id }),
        }).then((response) => expectJson<{ id: string }>(response, `create task ${title}`));
        created.push(task);
      }
      const [blocker, blocked, free] = created;
      if (!blocker || !blocked || !free) throw new Error('Failed to create bulk fixtures');
      await fetch(`${API}/tasks/${blocked.id}/dependencies`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ blockedByTaskId: blocker.id }),
      }).then((response) => expectJson(response, 'create dependency'));

      await page.goto('/');
      await expect(page.getByRole('link', { name: /打开项目/ }).first()).toBeVisible();
      await openDemoProject(page);
      await page.getByRole('button', { name: '批量选择', exact: true }).click();
      await page.getByRole('checkbox', { name: `选择任务：${blockedTitle}` }).check();
      await page.getByRole('checkbox', { name: `选择任务：${freeTitle}` }).check();

      const bulk = page.getByRole('region', { name: '批量操作' });
      await expect(bulk.getByText('已选 2 个任务')).toBeVisible();
      await page.getByRole('button', { name: '移入完成列' }).click();

      await expect(page.getByText(/已移入完成列 1 个，1 个因依赖/).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(bulk.getByText('已选 1 个任务')).toBeVisible();
      await expect(page.getByRole('checkbox', { name: `选择任务：${blockedTitle}` })).toBeChecked();
      await expect(
        page.getByLabel(`列：${doneColumn.name}`).getByText(freeTitle),
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.getByLabel(`列：${column.name}`).getByText(blockedTitle)).toBeVisible();
    } finally {
      for (const task of created) {
        await fetch(`${API}/tasks/${task.id}`, { method: 'DELETE', headers });
      }
    }
  });

  test('task estimate can be edited in the drawer and shown on the card', async ({ page }) => {
    const token = await authenticate(page);
    const projectId = await demoProjectId(token);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const board = await fetch(`${API}/projects/${projectId}/board`, { headers }).then((response) =>
      expectJson<{
        columns: Array<{ id: string; name: string; isDone: boolean }>;
        members: Array<{ userId: string; name: string }>;
      }>(response, 'load board'),
    );
    const column = board.columns.find((item) => !item.isDone);
    const target = board.members[0];
    if (!column) throw new Error('Demo project has no non-done column');
    if (!target) throw new Error('Demo project has no members');

    const title = `E2E 工时任务 ${Date.now()}`;
    const created = await fetch(`${API}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title,
        columnId: column.id,
        assigneeId: target.userId,
        estimateMinutes: 60,
      }),
    }).then((response) => expectJson<{ id: string }>(response, 'create estimated task'));

    let copyId: string | null = null;
    try {
      await page.goto(`/projects/${projectId}?task=${created.id}`);
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(title).first()).toBeVisible({ timeout: 15_000 });
      const estimateInput = dialog.getByLabel('工时估算（小时）');
      await expect(estimateInput).toHaveValue('1');
      await expect(dialog.getByText('预计投入 1 小时')).toBeVisible();

      await estimateInput.fill('1.5');
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(dialog.getByText('预计投入 1.5 小时')).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(
          async () => {
            const detail = await fetch(`${API}/tasks/${created.id}`, { headers }).then(
              (response) =>
                expectJson<{ estimateMinutes: number | null }>(response, 'poll estimate'),
            );
            return detail.estimateMinutes;
          },
          { timeout: 15_000 },
        )
        .toBe(90);

      await page.keyboard.press('Escape');
      await expect(page.getByText('1.5h').first()).toBeVisible({ timeout: 10_000 });

      await page.goto(`/projects/${projectId}/overview`);
      await expect(page.getByText('成员工作负载')).toBeVisible();
      await expect(page.getByText(/预计 1\.5 小时/).first()).toBeVisible({ timeout: 10_000 });

      const copy = await fetch(`${API}/tasks/${created.id}/duplicate`, {
        method: 'POST',
        headers,
      }).then((response) =>
        expectJson<{ id: string; estimateMinutes: number | null }>(response, 'duplicate task'),
      );
      copyId = copy.id;
      expect(copy.estimateMinutes).toBe(90);
    } finally {
      if (copyId) await fetch(`${API}/tasks/${copyId}`, { method: 'DELETE', headers });
      await fetch(`${API}/tasks/${created.id}`, { method: 'DELETE', headers });
    }
  });

  test('board exports filtered tasks as CSV', async ({ page }) => {
    const token = await authenticate(page);
    const projectId = await demoProjectId(token);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const board = await fetch(`${API}/projects/${projectId}/board`, { headers }).then((response) =>
      expectJson<{
        columns: Array<{ id: string; name: string; isDone: boolean }>;
      }>(response, 'load board'),
    );
    const column = board.columns.find((item) => !item.isDone);
    if (!column) throw new Error('Demo project has no non-done column');

    const title = `E2E 导出,任务 ${Date.now()}`;
    const created = await fetch(`${API}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, columnId: column.id, estimateMinutes: 90 }),
    }).then((response) => expectJson<{ id: string }>(response, 'create CSV task'));

    try {
      await page.goto(`/projects/${projectId}`);
      await page.getByRole('textbox', { name: '搜索任务标题' }).fill(title);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: '导出 CSV' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/^teamflow-board-\d{4}-\d{2}-\d{2}\.csv$/);
      const filePath = await download.path();
      if (!filePath) throw new Error('CSV download path is missing');
      const content = await readFile(filePath, 'utf8');
      expect(content.startsWith('\uFEFF任务标题,看板列,负责人,优先级,截止时间,工时估算,标签,状态,更新时间')).toBe(
        true,
      );
      expect(content).toContain(`"${title}"`);
      expect(content).toContain(`,${column.name},`);
      expect(content).toContain(',1.5 小时,');
      const rows = content.split('\r\n').filter((row) => row.length > 0);
      expect(rows).toHaveLength(2);
    } finally {
      await fetch(`${API}/tasks/${created.id}`, { method: 'DELETE', headers });
    }
  });

  test('settings page lists members and permissions', async ({ page }) => {
    await authenticate(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /打开项目/ }).first()).toBeVisible();
    await openDemoProject(page);
    await page
      .getByRole('navigation', { name: '项目导航' })
      .getByRole('link', { name: '设置' })
      .click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText('成员', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Alice', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('邀请', { exact: false }).first()).toBeVisible();
  });

  test('timeline and reports render', async ({ page }) => {
    await authenticate(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /打开项目/ }).first()).toBeVisible();
    await openDemoProject(page);
    await page.getByRole('link', { name: '时间线', exact: true }).click();
    await expect(page).toHaveURL(/\/timeline$/);
    await expect(page.getByText('活动时间线').first()).toBeVisible();
    await expect(page.getByText('Alice').first()).toBeVisible();

    await page.getByRole('link', { name: '报告', exact: true }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByText('团队总览').first()).toBeVisible();
    await expect(page.getByText('报告预览').first()).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 Markdown' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.md$/);
    await expect(page.getByText('历史周报快照')).toBeVisible();
    const generate = page.getByRole('button', { name: /保存本周快照/ }).first();
    if (await generate.isVisible()) {
      await generate.click();
      await expect(page.getByText(/已保存/).first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test('invalid invite link shows a friendly error', async ({ page }) => {
    await authenticate(page);
    await page.goto('/invite/not-a-valid-token');
    await expect(page.getByText(/邀请|失败|不存在|无效/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('project calendar renders and exports ICS', async ({ page }) => {
    const token = await authenticate(page);
    const projectId = await demoProjectId(token);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const board = await fetch(`${API}/projects/${projectId}/board`, { headers }).then(
      (response) => response.json() as Promise<{ columns: Array<{ id: string; name: string }> }>,
    );
    const column = board.columns[0];
    if (!column) throw new Error('Demo project has no columns');

    const title = `E2E 日历任务 ${Date.now()}`;
    const nowParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const currentYear = Number(nowParts.find((part) => part.type === 'year')?.value);
    const currentMonth = Number(nowParts.find((part) => part.type === 'month')?.value);
    const due = new Date(Date.UTC(currentYear, currentMonth - 1, 15, 4, 0, 0));
    const next = new Date(due.getTime() + 24 * 60 * 60 * 1000);
    const icsDate = (date: Date): string =>
      `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(
        date.getUTCDate(),
      ).padStart(2, '0')}`;
    const dueDate = due.toISOString();
    const created = await fetch(`${API}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, columnId: column.id, dueDate, priority: 'HIGH' }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    try {
      await page.goto('/');
      await expect(page.getByRole('link', { name: /打开项目/ }).first()).toBeVisible();
      await openDemoProject(page);

      await page
        .getByRole('navigation', { name: '项目导航' })
        .getByRole('link', { name: '日历', exact: true })
        .click();
      await expect(page).toHaveURL(/\/calendar$/);
      await expect(page.getByRole('heading', { name: '项目日历' })).toBeVisible();
      await expect(page.getByRole('group', { name: /任务日历/ })).toBeVisible();
      await expect(page.getByText(title).first()).toBeVisible();

      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: /导出.*ICS/ }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.ics$/);
      const filePath = await download.path();
      if (!filePath) throw new Error('ICS download path is missing');
      const content = await readFile(filePath, 'utf8');
      expect(content).toContain('BEGIN:VCALENDAR');
      expect(content).toContain('BEGIN:VEVENT');
      expect(content).toContain(`SUMMARY:${title}`);
      expect(content).toContain('UID:teamflow-task-' + created.id + '@teamflow');
      expect(content).toContain(`DTSTART;VALUE=DATE:${icsDate(due)}`);
      expect(content).toContain(`DTEND;VALUE=DATE:${icsDate(next)}`);
      expect(content).toContain('STATUS:CONFIRMED');
      expect(content).not.toContain('STATUS:COMPLETED');
      expect(content).not.toContain('METHOD:');
      expect(content.endsWith('END:VCALENDAR\r\n')).toBe(true);
      expect(content.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    } finally {
      await fetch(`${API}/tasks/${created.id}`, { method: 'DELETE', headers });
    }
  });

  test('drag a task across columns and persist after reload', async ({ page }) => {
    const token = await authenticate(page);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const projectId = await demoProjectId(token);
    const board = await fetch(`${API}/projects/${projectId}/board`, { headers }).then(
      (response) =>
        response.json() as Promise<{
          columns: Array<{ id: string; name: string }>;
        }>,
    );
    const todo = board.columns.find((column) => column.name === '待办')!;
    const doing = board.columns.find((column) => column.name === '进行中')!;
    const title = `E2E 拖拽任务 ${Date.now()}`;
    const created = await fetch(`${API}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, columnId: todo.id }),
    }).then((response) => response.json() as Promise<{ id: string }>);
    try {
      await page.goto(`/projects/${projectId}`);
      await page.getByRole('textbox', { name: '搜索任务标题' }).fill(title);
      const handle = page.getByRole('button', { name: `拖动任务：${title}` });
      await expect(handle).toBeVisible();
      await handle.scrollIntoViewIfNeeded();
      const target = page.getByLabel('列：进行中');
      const source = await handle.boundingBox();
      const destination = await target.boundingBox();
      if (!source || !destination) throw new Error('missing drag geometry');
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(destination.x + destination.width / 2, destination.y + 80, {
        steps: 25,
      });
      await page.waitForTimeout(300);
      await page.mouse.up();
      await expect(page.getByLabel('列：进行中').getByText(title)).toBeVisible({
        timeout: 10_000,
      });
      await page.reload();
      await expect(page.getByLabel('列：进行中').getByText(title)).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await fetch(`${API}/tasks/${created.id}`, { method: 'DELETE', headers });
    }
  });

  test('add a comment and upload an attachment in the task drawer', async ({ page }) => {
    const token = await authenticate(page);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const projectId = await demoProjectId(token);
    const board = await fetch(`${API}/projects/${projectId}/board`, { headers }).then(
      (response) => response.json() as Promise<{ columns: Array<{ id: string }> }>,
    );
    const title = `E2E 抽屉任务 ${Date.now()}`;
    const created = await fetch(`${API}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, columnId: board.columns[0]!.id }),
    }).then((response) => response.json() as Promise<{ id: string }>);
    try {
      await page.goto(`/projects/${projectId}?task=${created.id}`);
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(title).first()).toBeVisible({ timeout: 15_000 });
      const editor = dialog.locator('.tiptap').last();
      await editor.fill('来自 Playwright 的评论');
      await dialog.getByRole('button', { name: '发表评论' }).click();
      await expect(dialog.getByText('来自 Playwright 的评论')).toBeVisible({ timeout: 15_000 });

      await dialog.locator('input[type=file]').setInputFiles({
        name: 'e2e-note.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('hello from e2e'),
      });
      await expect(dialog.getByText('e2e-note.txt')).toBeVisible({ timeout: 15_000 });

      await dialog.getByRole('button', { name: '删除附件 e2e-note.txt' }).click();
      const attachmentConfirm = page.getByRole('dialog', { name: '删除附件' });
      await expect(attachmentConfirm).toBeVisible();
      await attachmentConfirm.getByRole('button', { name: '取消' }).click();
      await expect(dialog.getByText('e2e-note.txt')).toBeVisible();
      await dialog.getByRole('button', { name: '删除附件 e2e-note.txt' }).click();
      await page
        .getByRole('dialog', { name: '删除附件' })
        .getByRole('button', { name: '删除附件' })
        .click();
      await expect(dialog.getByText('暂无附件')).toBeVisible({ timeout: 15_000 });

      await dialog.getByRole('button', { name: '评论操作' }).last().click();
      await page.getByRole('menuitem', { name: '删除' }).click();
      const commentConfirm = page.getByRole('dialog', { name: '删除评论' });
      await expect(commentConfirm).toBeVisible();
      await commentConfirm.getByRole('button', { name: '取消' }).click();
      await expect(dialog.getByText('来自 Playwright 的评论')).toBeVisible();
      await dialog.getByRole('button', { name: '评论操作' }).last().click();
      await page.getByRole('menuitem', { name: '删除' }).click();
      await page
        .getByRole('dialog', { name: '删除评论' })
        .getByRole('button', { name: '删除评论' })
        .click();
      await expect(dialog.getByText('评论已删除')).toBeVisible({ timeout: 15_000 });
    } finally {
      await fetch(`${API}/tasks/${created.id}`, { method: 'DELETE', headers });
    }
  });

  test('v1.1 command palette, my tasks, overview and notification preferences', async ({
    page,
  }) => {
    await authenticate(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /打开项目/ }).first()).toBeVisible();
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: '全局搜索' });
    await expect(palette.getByPlaceholder('搜索项目、任务或成员…')).toBeVisible();
    await palette.getByPlaceholder('搜索项目、任务或成员…').fill('看板');
    await expect(palette.getByText('实现实时看板同步').first()).toBeVisible({
      timeout: 10_000,
    });
    await palette.getByText('实现实时看板同步').first().click();
    await expect(page).toHaveURL(/\/projects\/.+\?task=.+/);
    const taskDrawer = page.getByRole('dialog', { name: '任务详情' });
    await expect(taskDrawer).toBeVisible();
    await expect(palette).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(taskDrawer).toBeHidden();

    await page.getByRole('link', { name: '概览', exact: true }).click();
    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByText('成员工作负载')).toBeVisible();

    await page.getByRole('link', { name: '我的任务' }).click();
    await expect(page).toHaveURL(/\/my-tasks$/);
    await expect(page.getByRole('heading', { name: '我的任务' })).toBeVisible();

    await page.getByRole('link', { name: '通知' }).first().click();
    await expect(page).toHaveURL(/\/inbox$/);
    await page.getByRole('button', { name: '通知偏好' }).click();
    const preferences = page.getByRole('dialog', { name: '通知偏好' });
    await expect(preferences).toBeVisible();
    await expect(preferences.getByRole('button', { name: '保存偏好' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('v1.1 quick add, subtasks, AI breakdown, replies, reactions and watch', async ({ page }) => {
    const token = await authenticate(page);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const projectId = await demoProjectId(token);

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole('heading', { name: /毕业设计协作/ })).toBeVisible();
    const quickTitle = `V1.1 快速任务 ${Date.now()}`;
    await page.getByRole('button', { name: '在列「待办」快速新建任务' }).click();
    await page.getByPlaceholder('输入标题，回车创建').fill(quickTitle);
    await page.getByPlaceholder('输入标题，回车创建').press('Enter');
    await expect(page.getByText(quickTitle).first()).toBeVisible({ timeout: 15_000 });
    const board = await fetch(`${API}/projects/${projectId}/board`, { headers }).then(
      (response) =>
        response.json() as Promise<{
          columns: Array<{ id: string; name: string }>;
          tasks: Array<{ id: string; title: string }>;
        }>,
    );
    const quickTask = board.tasks.find((item) => item.title === quickTitle);
    if (quickTask) await fetch(`${API}/tasks/${quickTask.id}`, { method: 'DELETE', headers });
    const todo = board.columns.find((column) => column.name === '待办')!;
    const taskTitle = `V1.1 任务 ${Date.now()}`;
    const created = await fetch(`${API}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: taskTitle, columnId: todo.id }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    try {
      await page.goto(`/projects/${projectId}?task=${created.id}`);
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(taskTitle).first()).toBeVisible({ timeout: 15_000 });

      const subtaskTitle = `V1.1 子任务 ${Date.now()}`;
      await dialog.getByPlaceholder('添加子任务，回车确认').fill(subtaskTitle);
      await dialog.getByPlaceholder('添加子任务，回车确认').press('Enter');
      await expect(dialog.getByText(subtaskTitle).first()).toBeVisible({ timeout: 10_000 });
      await dialog.getByRole('checkbox', { name: `切换「${subtaskTitle}」完成状态` }).click();

      await dialog.getByRole('button', { name: 'AI 拆解' }).click();
      const aiDialog = page.getByRole('dialog', { name: 'AI 任务拆解' });
      await expect(aiDialog).toBeVisible();
      await aiDialog.getByRole('button', { name: '生成预览' }).click();
      const firstSuggestion = aiDialog.getByRole('textbox').first();
      await expect(firstSuggestion).toBeVisible({ timeout: 15_000 });
      const suggestionTitle = await firstSuggestion.inputValue();
      expect(suggestionTitle.trim().length).toBeGreaterThan(0);
      await aiDialog.getByRole('button', { name: /创建 \d+ 个子任务/ }).click();
      await expect(dialog.getByText(suggestionTitle).first()).toBeVisible({
        timeout: 15_000,
      });

      const rootText = `V1.1 根评论 ${Date.now()}`;
      await dialog.locator('.tiptap').last().fill(rootText);
      await dialog.getByRole('button', { name: '发表评论' }).click();
      await expect(dialog.getByText(rootText).last()).toBeVisible({ timeout: 15_000 });

      await dialog.getByRole('button', { name: '回复' }).last().click();
      await expect(dialog.getByRole('button', { name: '发布回复' })).toBeVisible();
      const replyText = `V1.1 回复 ${Date.now()}`;
      await dialog.locator('.tiptap').last().fill(replyText);
      await dialog.getByRole('button', { name: '发布回复' }).click();
      await expect(dialog.getByText(replyText).last()).toBeVisible({ timeout: 15_000 });

      await dialog.getByRole('button', { name: '添加表情回应' }).last().click();
      await page.getByRole('menuitem', { name: '回应 🎉' }).click();
      await expect(
        dialog.locator('button[aria-pressed="true"]').filter({ hasText: '🎉' }).last(),
      ).toBeVisible();

      const watchingButton = dialog.getByRole('button', { name: '已关注' });
      if (await watchingButton.isVisible()) await watchingButton.click();
      await dialog.getByRole('button', { name: '关注', exact: true }).click();
      await expect(dialog.getByRole('button', { name: '已关注' })).toBeVisible();

      await dialog.getByRole('button', { name: '活动' }).click();
      await expect(dialog.getByLabel('任务活动')).toBeVisible();
    } finally {
      await fetch(`${API}/tasks/${created.id}`, { method: 'DELETE', headers });
    }
  });

  test('v1.2 dependencies, duplicate, due filter and drag-drop attachment', async ({ page }) => {
    const token = await authenticate(page);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const projectId = await demoProjectId(token);
    const board = await fetch(`${API}/projects/${projectId}/board`, { headers }).then(
      (response) =>
        response.json() as Promise<{
          columns: Array<{ id: string; name: string }>;
          tasks: Array<{ id: string; title: string }>;
        }>,
    );
    const todo = board.columns.find((column) => column.name === '待办')!;
    const done = board.columns.find((column) => column.name === '已完成')!;
    const stamp = Date.now();
    const blockerTitle = `V1.2 前置任务 ${stamp}`;
    const dependentTitle = `V1.2 依赖任务 ${stamp}`;

    const blocker = await fetch(`${API}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: blockerTitle, columnId: todo.id }),
    }).then((response) => response.json() as Promise<{ id: string }>);
    const dependent = await fetch(`${API}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: dependentTitle,
        columnId: todo.id,
        dueDate: new Date(stamp - 24 * 60 * 60 * 1000).toISOString(),
      }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    try {
      await page.goto(`/projects/${projectId}?task=${dependent.id}`);
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(dependentTitle).first()).toBeVisible({ timeout: 15_000 });

      await dialog.getByRole('combobox', { name: '选择要等待完成的任务' }).click();
      await page.getByRole('option', { name: new RegExp(blockerTitle) }).click();
      await dialog.getByRole('button', { name: '添加依赖' }).click();
      await expect(dialog.getByText(blockerTitle).first()).toBeVisible({ timeout: 10_000 });
      await expect(dialog.getByText('阻塞中').first()).toBeVisible();

      const dataTransfer = await page.evaluateHandle(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['drop-upload'], 'e2e-drop-note.txt', { type: 'text/plain' }));
        return transfer;
      });
      await dialog
        .getByRole('group', { name: '附件上传区域' })
        .dispatchEvent('drop', { dataTransfer });
      await expect(dialog.getByText('e2e-drop-note.txt')).toBeVisible({ timeout: 15_000 });

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();

      await page.getByRole('textbox', { name: '搜索任务标题' }).fill(dependentTitle);
      await expect(page.getByText(dependentTitle).first()).toBeVisible();
      await expect(page.getByText('阻塞 1').first()).toBeVisible({ timeout: 10_000 });

      await page.getByRole('combobox', { name: '按截止时间筛选' }).click();
      await page.getByRole('option', { name: '已逾期', exact: true }).click();
      await expect(page.getByText(dependentTitle).first()).toBeVisible();

      await page.getByRole('combobox', { name: '按截止时间筛选' }).click();
      await page.getByRole('option', { name: '无截止时间', exact: true }).click();
      await expect(page.getByText(dependentTitle)).toHaveCount(0);
      await page.getByRole('button', { name: '重置筛选' }).click();

      await page.getByRole('textbox', { name: '搜索任务标题' }).fill(blockerTitle);
      await page.getByRole('button', { name: `任务快捷操作：${blockerTitle}` }).click();
      await page.getByRole('menuitem', { name: '复制任务' }).click();
      await expect(page.getByText(/已创建副本/).first()).toBeVisible({ timeout: 10_000 });

      const afterDuplicate = await fetch(`${API}/projects/${projectId}/board`, { headers }).then(
        (response) => response.json() as Promise<{ tasks: Array<{ id: string; title: string }> }>,
      );
      const duplicate = afterDuplicate.tasks.find(
        (task) => task.title === `${blockerTitle}（副本）`,
      );
      expect(duplicate).toBeTruthy();
      if (duplicate) {
        await fetch(`${API}/tasks/${duplicate.id}`, { method: 'DELETE', headers });
      }

      await page.getByRole('textbox', { name: '搜索任务标题' }).fill(dependentTitle);
      const handle = page.getByRole('button', { name: `拖动任务：${dependentTitle}` });
      await expect(handle).toBeVisible();
      await handle.scrollIntoViewIfNeeded();
      const source = await handle.boundingBox();
      const destination = await page.getByLabel('列：已完成').boundingBox();
      if (!source || !destination) throw new Error('missing drag geometry');
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(destination.x + destination.width / 2, destination.y + 80, {
        steps: 25,
      });
      await page.waitForTimeout(300);
      await page.mouse.up();

      const blockedDialog = page.getByRole('dialog', { name: '任务仍有未完成依赖' });
      await expect(blockedDialog).toBeVisible();
      await blockedDialog.getByRole('button', { name: '仍要完成' }).click();
      await expect(page.getByLabel('列：已完成').getByText(dependentTitle)).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await Promise.all([
        fetch(`${API}/tasks/${dependent.id}`, { method: 'DELETE', headers }),
        fetch(`${API}/tasks/${blocker.id}`, { method: 'DELETE', headers }),
      ]);
    }
  });

  test('v1.3 live weekly summary and safe email preview', async ({ page }) => {
    const token = await authenticate(page);
    const projectId = await demoProjectId(token);
    await page.goto(`/projects/${projectId}/reports`);
    await expect(page.getByRole('heading', { name: /本周实时汇总/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/本周新增 \d+ 个任务/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '智能发送邮件' })).toBeVisible();

    await page.getByRole('button', { name: '智能发送邮件' }).click();
    const dialog = page.getByRole('dialog', { name: '智能发送周报邮件' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Agent Mail 当前不可用|Agent Mail 已连接/)).toBeVisible({
      timeout: 15_000,
    });

    await dialog.getByRole('button', { name: '生成邮件预览' }).click();
    await expect(dialog.getByRole('heading', { name: '邮件预览' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByLabel('主题')).toHaveValue(/周报/);
    await expect(dialog.getByLabel('正文')).toHaveValue(/本周概览/);
    await expect(dialog.getByRole('button', { name: '确认发送' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('v1.4 account menu and profile settings', async ({ page }) => {
    const token = await authenticate(page);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const newName = `Alice E2E ${Date.now()}`;
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
    try {
      await page.goto('/');
      const accountTrigger = page.getByRole('button', { name: '账户菜单' });
      await accountTrigger.click();
      await expect(page.getByText('已登录 TeamFlow')).toBeVisible();
      await page.getByRole('menuitem', { name: /个人资料与设置/ }).click();
      await expect(page).toHaveURL(/\/settings$/);
      await expect(page.getByRole('heading', { name: '账号设置' })).toBeVisible();
      await expect(page.locator('#current-password')).toBeVisible();
      await expect(page.getByText('通知与快捷入口')).toBeVisible();

      await page.locator('#account-name').fill(newName);
      await page.getByLabel('选择头像图片').setInputFiles({
        name: 'avatar.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
      });
      await expect(page.getByText('头像已准备好，点击保存后生效')).toBeVisible({
        timeout: 10_000,
      });
      await page.getByRole('button', { name: '保存资料' }).click();
      await expect(page.getByText('个人资料已更新')).toBeVisible({ timeout: 15_000 });

      await accountTrigger.click();
      await expect(page.getByText(newName).first()).toBeVisible();
      await expect(page.locator('img[src^="data:image/"]').first()).toBeVisible();
      await page.keyboard.press('Escape');

      await page.reload();
      await expect(page.locator('#account-name')).toHaveValue(newName);
      await expect(page.locator('img[src^="data:image/"]').first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await fetch(`${API}/users/me`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: 'Alice', avatarUrl: null }),
      });
    }
  });
});
