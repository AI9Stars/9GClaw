import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatReviewProvider } from './ChatReviewContext';
import TurnChangesCard, { ReviewToolbar } from './TurnChangesCard';
import ChatReviewSidePanel from './ChatReviewSidePanel';
import type { Project, ProjectSession } from '../../types/app';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../../utils/api', () => ({ authenticatedFetch: mocks.fetch }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const changes = ['ready.txt', 'conflict.txt'].map(path => ({ path, operation: 'updated', source: 'file_tool', added: 1, removed: 1, restorable: true, binary: false }));
const checkpoint = { id: 'checkpoint', phase: 'after', turnId: 'turn', sessionId: 'session', createdAt: '2026-10-09T00:00:00Z', status: 'complete', activeBranch: true, unprotected: 0, changes };
const absent = { kind: 'absent' };
const plan = { id: 'plan', checkpointId: checkpoint.id, mode: 'files', scope: 'turn', files: [
  { path: 'ready.txt', status: 'ready', expected: absent, target: absent, source: 'file_tool' },
  { path: 'conflict.txt', status: 'conflict', expected: absent, target: absent, source: 'file_tool' },
] };
function setup() {
  mocks.fetch.mockImplementation(async (url: string, options?: { body?: string }) => {
    const input = options?.body ? JSON.parse(options.body) : {};
    const body = input.action === 'list' ? { checkpoints: [checkpoint], sessionChanges: changes, operations: [], busy: false }
      : input.action === 'preview' ? plan : input.action === 'diff' ? { path: input.filePath, source: 'file_tool', hunks: [] }
      : input.action === 'restore' ? { id: plan.id, status: 'complete' }
      : url.includes('/git/status') ? { branch: 'main', repositoryRoot: '/workspace', hasCommits: true, entries: [] }
      : {};
    return { ok: true, json: async () => body };
  });
  render(<ChatReviewProvider project={{ name: 'workspace', fullPath: '/workspace' } as Project} session={{ id: 'session' } as ProjectSession} onOpen={() => {}}>
    <ReviewToolbar /><textarea aria-label="聊天草稿" /><TurnChangesCard turnId="turn" />
    <ChatReviewSidePanel width={500} minWidth={300} maxWidth={800} isMobile={false} onResizeStart={() => {}} onResizeBy={() => {}} />
  </ChatReviewProvider>);
}

it('opens review from the turn and closing the panel preserves the conversation draft', async () => {
  setup(); await screen.findByTestId('turn-changes-card');
  const draft = screen.getByLabelText('聊天草稿'); fireEvent.change(draft, { target: { value: '继续完成未发出的需求' } });
  fireEvent.click(within(screen.getByTestId('turn-changes-card')).getByText('查看变更'));
  expect(await screen.findByTestId('chat-review-panel')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('收起改动面板'));
  expect(screen.queryByTestId('chat-review-panel')).toBeNull();
  expect((draft as HTMLTextAreaElement).value).toBe('继续完成未发出的需求');
  expect(screen.getByTestId('turn-changes-card')).toBeTruthy();
});

it('restores only selected safe files and keeps conflict files unchecked', async () => {
  setup(); await screen.findByTestId('turn-changes-card');
  fireEvent.click(within(screen.getByTestId('turn-changes-card')).getByText('撤销'));
  const dialog = await screen.findByRole('dialog');
  const checkboxes = within(dialog).getAllByRole('checkbox') as HTMLInputElement[];
  expect(checkboxes[0].checked).toBe(true); expect(checkboxes[1].checked).toBe(false); expect(checkboxes[1].disabled).toBe(true);
  fireEvent.click(within(dialog).getByText('确认恢复 1 个文件'));
  await waitFor(() => expect(mocks.fetch.mock.calls.some(([, options]) => options?.body && JSON.parse(options.body).action === 'restore')).toBe(true));
  const [, request] = mocks.fetch.mock.calls.find(([, options]) => options?.body && JSON.parse(options.body).action === 'restore')!;
  expect(JSON.parse(request.body).paths).toEqual(['ready.txt']);
});

it('clears the previous file diff immediately while the next file is loading', async () => {
  setup();
  const originalFetch = mocks.fetch.getMockImplementation()!;
  let finishNext!: (value: unknown) => void;
  const nextDiff = new Promise(resolve => { finishNext = resolve; });
  const result = (path: string, text: string) => ({ path, source: 'file_tool', oldContent: '', newContent: text,
    hunks: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: [{ type: 'add', text }] }],
  });
  mocks.fetch.mockImplementation(async (url, options) => {
    const input = options?.body ? JSON.parse(options.body) : {};
    if (input.action !== 'diff') return originalFetch(url, options);
    return { ok: true, json: () => input.filePath === 'conflict.txt' ? nextDiff : Promise.resolve(result('ready.txt', 'first-version')) };
  });
  await screen.findByTestId('turn-changes-card');
  fireEvent.click(within(screen.getByTestId('turn-changes-card')).getByText('查看变更'));
  await screen.findByText('first-version');
  fireEvent.change(screen.getByLabelText('查看变更文件'), { target: { value: 'conflict.txt' } });
  expect(screen.queryByText('first-version')).toBeNull();
  await act(async () => { finishNext(result('conflict.txt', 'second-version')); });
  expect(await screen.findByText('second-version')).toBeTruthy();
});
