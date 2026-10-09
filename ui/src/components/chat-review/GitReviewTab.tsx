import { useCallback, useEffect, useState } from 'react';
import { GitBranch, GitCommitHorizontal, ArrowUpFromLine, Plus, Minus, RefreshCw, Loader2 } from 'lucide-react';
import { authenticatedFetch } from '../../utils/api';
import { readJson, useChatReview, type GitEntry } from './ChatReviewContext';
import { getWorkspaceFileIdentity, getWorkspaceRelativePath } from '../../utils/workspaceFileMention';

type Remote = { hasRemote?: boolean; hasUpstream?: boolean; remoteName?: string; ahead?: number; behind?: number; error?: string };
const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-900';

export default function GitReviewTab() {
  const review = useChatReview()!;
  const [selected, setSelected] = useState<string[]>([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]), [remote, setRemote] = useState<Remote>({}), [remoteUrl, setRemoteUrl] = useState('');
  const [diff, setDiff] = useState<{ path: string; text: string; side: string } | null>(null);
  const project = review.project, status = review.git;
  const refreshDetails = useCallback(async () => {
    if (!project) return;
    const options = { suppressServerErrorToast: true };
    const [branchResult, remoteResult] = await Promise.all([
      authenticatedFetch(`/api/git/branches?project=${encodeURIComponent(project.name)}`, options).then(response => response.json()).catch(() => ({})),
      authenticatedFetch(`/api/git/remote-status?project=${encodeURIComponent(project.name)}`, options).then(response => response.json()).catch(() => ({})),
    ]);
    setBranches(branchResult.localBranches ?? branchResult.branches ?? []); setRemote(remoteResult);
  }, [project]);
  const refresh = useCallback(async () => { await review.refreshGit(); }, [review.refreshGit]);
  useEffect(() => { if (status && !status.error) void refreshDetails(); }, [status, refreshDetails]);
  const checkpoint = review.data.checkpoints.find(item => item.id === review.checkpointId) ?? review.data.checkpoints.filter(item => item.phase === 'after').at(-1);
  useEffect(() => {
    const repository = status?.repositoryRoot ?? '', workspace = project?.fullPath || project?.path || '';
    const subdirectory = getWorkspaceRelativePath(workspace, repository);
    const prefix = subdirectory ? `${subdirectory}/` : '';
    const identities = new Set(checkpoint?.changes.map(file => getWorkspaceFileIdentity(`${prefix}${file.path}`, repository)) ?? []);
    // Keep Git's exact filename for subsequent operations while matching Windows
    // drive letters, separators and casing through the shared path helper.
    setSelected(status?.entries?.filter(file => identities.has(getWorkspaceFileIdentity(file.path, repository))).map(file => file.path) ?? []);
  }, [checkpoint, status?.repositoryRoot, status?.entries, project?.fullPath, project?.path]);
  const execute = async (operation: string, extra: Record<string, unknown> = {}) => {
    if (!project || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await readJson<{ output?: string }>(await authenticatedFetch('/api/git/operation', { method: 'POST', suppressServerErrorToast: true, body: JSON.stringify({ project: project.name, sessionId: review.sessionId, operation, ...extra }) }));
      setNotice(operation === 'commit' ? '本地提交已创建。' : operation === 'push' ? '推送完成。' : operation === 'init' ? 'Git 仓库已初始化，请选择文件创建首次提交。' : '操作完成。');
      if (operation === 'commit') { setMessage(''); setSelected([]); }
      if (operation === 'remote') setRemoteUrl('');
      await refresh(); await review.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  };
  const blocked = busy || review.running || review.data.busy || review.readOnly;
  const entries = status?.entries ?? [], staged = entries.filter(file => file.staged), unstaged = entries.filter(file => file.unstaged), conflicted = entries.filter(file => file.conflicted);
  const stageFiles = entries.filter(file => (file.unstaged || file.conflicted) && selected.includes(file.path)).map(file => file.path);
  const unstageFiles = staged.filter(file => selected.includes(file.path)).flatMap(file => file.originalPath ? [file.path, file.originalPath] : [file.path]);
  const viewDiff = async (file: GitEntry, side: 'staged' | 'unstaged') => {
    if (!project) return;
    setError(null);
    try {
      const result = await readJson<{ diff: string }>(await authenticatedFetch(`/api/git/review-diff?project=${encodeURIComponent(project.name)}&file=${encodeURIComponent(file.path)}&side=${side}`, { suppressServerErrorToast: true }));
      setDiff({ path: file.path, text: result.diff, side });
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  };
  const group = (label: string, files: GitEntry[], side: 'staged' | 'unstaged') => <div><div className="mb-2 mt-4 text-neutral-500">{label} · {files.length}</div>{files.map(file => <div key={`${side}:${file.path}`} className="flex items-start gap-2 py-2"><input aria-label={`选择 ${file.path}`} type="checkbox" checked={selected.includes(file.path)} onChange={event => setSelected(previous => event.target.checked ? [...previous, file.path] : previous.filter(path => path !== file.path))} className="mt-1 shrink-0" /><button type="button" onClick={() => void viewDiff(file, side)} className="min-w-0 flex-1 break-all text-left font-mono hover:text-violet-600 dark:hover:text-violet-400">{file.path}{file.originalPath && <span className="block text-neutral-400">← {file.originalPath}</span>}</button><span className="rounded bg-violet-500/10 px-1 font-mono text-violet-600 dark:text-violet-400">{file.untracked ? '?' : side === 'staged' ? file.indexStatus : file.worktreeStatus}</span></div>)}</div>;
  if (!project) return <p className="p-4 text-xs text-neutral-500">选择项目后可管理 Git。</p>;
  const noRepository = status?.isRepository === false || (status?.error && /not a git repository|does not contain|initialize/i.test(status.error));
  return <div className="space-y-3 p-3.5 text-xs" data-testid="git-review-tab">
    <div className="font-medium">Git 仓库</div>
    {error && <pre role="alert" className="whitespace-pre-wrap break-words rounded bg-red-500/10 p-2 font-sans text-red-600 dark:text-red-400">{error}</pre>}
    {notice && <p role="status" className="rounded bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-400">{notice}</p>}
    {noRepository ? <div className="space-y-3 py-6"><p>这个项目是普通文件夹，自动检查点和文件恢复可用。</p><button type="button" className={button} disabled={blocked} onClick={() => void execute('init')}><GitBranch className="h-3.5 w-3.5" />初始化 Git 仓库</button></div> : status?.error ? <p role="alert" className="text-red-500">{status.error}<button type="button" className={`${button} ml-2`} onClick={() => void refresh()}>刷新</button></p> : !status ? <p className="py-6 text-neutral-500">正在读取 Git 状态…</p> : <>
      <label className="flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5 shrink-0" /><select aria-label="当前 Git 分支" value={status.branch ?? ''} disabled={blocked} onChange={event => void execute('checkout', { branch: event.target.value })} className="min-w-0 flex-1 bg-transparent py-1"><option value={status.branch}>{status.branch}</option>{branches.filter(branch => branch !== status.branch).map(branch => <option key={branch} value={branch}>{branch}</option>)}</select></label>
      <p className="break-all text-neutral-400">{status.repositoryRoot}</p>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-neutral-500">{remote.hasRemote ? `${remote.remoteName || 'origin'} · ↑${remote.ahead ?? 0} ↓${remote.behind ?? 0}${!remote.hasUpstream ? ' · 尚未设置跟踪分支' : ''}` : '本地仓库 · 尚未配置远程'}</span><button type="button" className={button} disabled={blocked || !remote.hasRemote} onClick={() => void execute('fetch')}><RefreshCw className="h-3 w-3" />Fetch</button></div>
      {!status.hasCommits && <p className="rounded bg-neutral-100 p-2 text-neutral-500 dark:bg-neutral-900">尚无提交，请暂存需要纳入版本管理的文件。</p>}
      {conflicted.length > 0 && group('待解决冲突', conflicted, 'unstaged')}
      {staged.length > 0 && group('已暂存', staged, 'staged')}
      {group('未暂存', unstaged, 'unstaged')}
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked || !stageFiles.length} onClick={() => void execute('stage', { files: stageFiles })}><Plus className="h-3 w-3" />暂存所选</button><button type="button" className={button} disabled={blocked || !unstageFiles.length} onClick={() => void execute('unstage', { files: unstageFiles })}><Minus className="h-3 w-3" />取消暂存所选</button></div>
      {diff && <div className="overflow-hidden rounded border border-neutral-200 dark:border-neutral-700"><div className="break-all bg-neutral-100 p-2 dark:bg-neutral-900">{diff.path} · {diff.side === 'staged' ? '已暂存' : '未暂存'}</div><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all p-2 font-mono text-[11px] leading-5">{diff.text || '无文本差异。'}</pre></div>}
      <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-700"><label className="block">提交说明<textarea aria-label="Git 提交说明" value={message} onChange={event => setMessage(event.target.value)} rows={3} className="mt-1 w-full resize-y rounded-md border border-neutral-200 bg-transparent p-2 dark:border-neutral-700" /></label><p className="text-neutral-500">将提交暂存区的全部 {staged.length} 个文件。</p><div className="flex flex-wrap gap-2"><button type="button" className={`${button} bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white`} disabled={blocked || !message.trim() || !staged.length || !!conflicted.length} onClick={() => void execute('commit', { message: message.trim(), expectedIndexTree: status.indexTree })}><GitCommitHorizontal className="h-3.5 w-3.5" />{status.hasCommits ? 'Commit' : '创建首次提交'}</button><button type="button" className={button} disabled={blocked || !remote.hasRemote || !status.hasCommits || (remote.hasUpstream && !remote.ahead)} onClick={() => void execute('push')}><ArrowUpFromLine className="h-3.5 w-3.5" />Push</button>{busy && <Loader2 className="h-4 w-4 animate-spin" />}</div></div>
      {!remote.hasRemote && <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-700"><label className="block">远程仓库地址<input aria-label="远程仓库地址" value={remoteUrl} onChange={event => setRemoteUrl(event.target.value)} placeholder="https://github.com/…/….git" className="mt-1 w-full rounded border border-neutral-200 bg-transparent p-2 dark:border-neutral-700" /></label><button type="button" className={button} disabled={blocked || !remoteUrl.trim()} onClick={() => void execute('remote', { remoteUrl: remoteUrl.trim() })}>连接远程仓库</button></div>}
    </>}
  </div>;
}
