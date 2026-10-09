import { Files, GitBranch, History, ShieldCheck, Undo2 } from 'lucide-react';
import { useChatReview } from './ChatReviewContext';

export function ReviewToolbar() {
  const review = useChatReview();
  if (!review?.project) return null;
  const latest = review.data.checkpoints.filter(item => item.phase === 'after' && item.activeBranch !== false).at(-1);
  return <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2 text-xs dark:border-neutral-800" data-testid="chat-review-toolbar">
    <button type="button" onClick={() => review.open('git')} className="inline-flex min-w-0 items-center gap-1.5 rounded px-1 py-1 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800" aria-label="打开 Git 管理">
      <GitBranch className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{review.git?.branch || (review.git?.error ? '普通文件夹' : review.project.displayName || review.project.name)}</span>
    </button>
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => review.open('changes', latest?.id)} disabled={!review.sessionId} className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-2 py-1.5 disabled:opacity-40 dark:border-neutral-700"><Files className="h-3.5 w-3.5" />改动 {latest?.changes.length ?? 0}</button>
      <button type="button" onClick={() => review.open('checkpoints')} disabled={!review.sessionId} className="rounded-md p-1.5 text-neutral-500 disabled:opacity-40" aria-label="查看检查点历史"><History className="h-4 w-4" /></button>
    </div>
  </div>;
}

export default function TurnChangesCard({ turnId }: { turnId: string | null | undefined }) {
  const review = useChatReview();
  const checkpoint = review?.data.checkpoints.find(item => item.phase === 'after' && item.turnId === turnId);
  if (!review || !checkpoint || !checkpoint.changes.length) return null;
  const changes = checkpoint.changes;
  const restoration = review.data.operations.filter(operation => operation.checkpointId === checkpoint.id && operation.status === 'complete').at(-1);
  const undone = restoration && review.data.operations.some(operation => operation.undoOf === restoration.id && operation.status === 'complete');
  return <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 text-xs dark:border-neutral-700" data-testid="turn-changes-card">
    <div className="flex items-center justify-between gap-2 px-3 py-2.5"><span>本轮{changes.some(file => file.source === 'observed') ? '检测到' : '修改了'} {changes.length} 个文件{checkpoint.status === 'incomplete' ? ' · 执行未完成' : ''}</span><span className="shrink-0 font-mono"><span className="text-emerald-600 dark:text-emerald-400">+{changes.reduce((sum, file) => sum + file.added, 0)}</span> <span className="text-red-500">−{changes.reduce((sum, file) => sum + file.removed, 0)}</span></span></div>
    {changes.slice(0, 5).map(file => <button key={file.path} type="button" onClick={() => review.open('changes', checkpoint.id, file.path)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"><span className="min-w-0 break-all font-mono">{file.path}</span><span className="shrink-0 text-neutral-400">{file.operation === 'created' ? '新增' : file.operation === 'deleted' ? '删除' : '修改'}</span></button>)}
    {changes.length > 5 && <div className="px-3 py-1 text-neutral-400">还有 {changes.length - 5} 个文件</div>}
    <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 px-3 py-2 dark:border-neutral-700">
      <button type="button" onClick={() => review.open('changes', checkpoint.id)} className="inline-flex items-center gap-1.5 rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700"><Files className="h-3.5 w-3.5" />查看改动</button>
      <button type="button" onClick={() => { review.open('changes', checkpoint.id); void review.preview(checkpoint.id); }} disabled={review.running || review.data.busy || review.readOnly} className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-neutral-500 disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" />撤回本轮</button>
      <span className="ml-auto inline-flex items-center gap-1 text-neutral-400"><ShieldCheck className="h-3 w-3" />{checkpoint.unprotected ? '部分文件未保护' : '检查点已保存'}</span>
    </div>
    {restoration && !undone && <p className="border-t border-neutral-200 bg-emerald-500/5 px-3 py-2 text-neutral-500 dark:border-neutral-700">{restoration.mode === 'conversation' ? '对话已回退' : `已撤回 ${restoration.applied.length} 个文件 · 保留 ${restoration.skipped.length} 个文件`} · 上方展示本轮历史改动</p>}
  </div>;
}
