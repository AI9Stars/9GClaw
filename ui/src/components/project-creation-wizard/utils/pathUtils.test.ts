import { describe, expect, it } from 'vitest';
import { getParentPath, shouldShowGithubAuthentication } from './pathUtils';

describe('project creation path utilities', () => {
  it('moves from Windows drive roots to the virtual drives view', () => {
    expect(getParentPath('C:\\')).toBe('/');
    expect(getParentPath('D:')).toBe('/');
  });

  it('stops at filesystem roots', () => {
    expect(getParentPath('/')).toBeNull();
  });

  it('keeps normal Windows parent navigation under a drive', () => {
    expect(getParentPath('D:\\Projects\\9GClaw')).toBe('D:\\Projects');
    expect(getParentPath('D:\\Projects')).toBe('D:\\');
  });
});

describe('shouldShowGithubAuthentication', () => {
  it.each([
    ['new', 'https://github.com/AI9Stars/9GClaw.git', true],
    ['new', 'http://github.com/AI9Stars/9GClaw.git', false],
    ['new', 'git@github.com:AI9Stars/9GClaw.git', false],
    ['new', 'https://gitlab.com/AI9Stars/9GClaw.git', false],
    ['new', '/tmp/local-repository', false],
    ['existing', 'https://github.com/AI9Stars/9GClaw.git', false],
  ] as const)(
    'returns %s/%s => %s',
    (workspaceType, githubUrl, expected) => {
      expect(shouldShowGithubAuthentication(workspaceType, githubUrl)).toBe(expected);
    },
  );
});
