import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatReviewProvider } from './ChatReviewContext';
import GitReviewTab from './GitReviewTab';
import type { Project, ProjectSession } from '../../types/app';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../../utils/api', () => ({ authenticatedFetch: mocks.fetch }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it.each([
  ['Windows drive', 'c:\\repo\\Subproject', 'C:/Repo', 'subproject/Report.txt'],
  ['Windows UNC', '\\\\SERVER\\Share\\Repo\\Subproject', '//server/share/repo', 'subproject/Report.txt'],
  ['POSIX', '/repo/subproject', '/repo', 'subproject/report.txt'],
  ['repository root', 'c:\\REPO', 'C:/Repo', 'Report.txt'],
])('preselects the round files using Git filenames in a %s workspace', async (_label, workspace, repository, file) => {
  const checkpoint = { id: 'checkpoint', phase: 'after', turnId: 'turn', sessionId: 'session', createdAt: '2026-10-09T00:00:00Z', status: 'complete', changes: [{ path: 'report.txt' }] };
  const entry = (path: string) => ({ path, indexStatus: '?', worktreeStatus: '?', untracked: true, unstaged: true });
  mocks.fetch.mockImplementation(async (url: string, options?: { body?: string }) => {
    const input = options?.body ? JSON.parse(options.body) : {};
    const body = input.action === 'list' ? { checkpoints: [checkpoint], sessionChanges: checkpoint.changes, operations: [], busy: false }
      : url.includes('/git/status') ? { branch: 'main', repositoryRoot: repository, hasCommits: true, entries: [entry(file), entry('unrelated.txt')] }
      : url.includes('/git/branches') ? { localBranches: ['main'] } : {};
    return { ok: true, json: async () => body };
  });
  render(<ChatReviewProvider project={{ name: 'project', fullPath: workspace } as Project} session={{ id: 'session' } as ProjectSession} openGit onOpen={() => {}}>
    <GitReviewTab />
  </ChatReviewProvider>);
  const selected = await screen.findByLabelText(`选择 ${file}`) as HTMLInputElement;
  await waitFor(() => expect(selected.checked).toBe(true));
  expect((screen.getByLabelText('选择 unrelated.txt') as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByText('暂存所选'));
  await waitFor(() => expect(mocks.fetch.mock.calls.some(([url]) => url === '/api/git/operation')).toBe(true));
  const [, options] = mocks.fetch.mock.calls.find(([url]) => url === '/api/git/operation')!;
  expect(JSON.parse(options.body)).toMatchObject({ operation: 'stage', files: [file] });
});
