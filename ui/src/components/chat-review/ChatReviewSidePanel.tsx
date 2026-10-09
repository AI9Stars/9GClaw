import { useEffect, useState, type MouseEvent } from 'react';
import { Files, Loader2, ShieldCheck, Undo2, RefreshCw } from 'lucide-react';
import ToolSidePanel from '../main-content/view/subcomponents/ToolSidePanel';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useChatReview, type RestorePlan } from './ChatReviewContext';
import GitReviewTab from './GitReviewTab';

type Diff = { path: string; oldContent: string | null; newContent: string | null; source: string; hunks: Array<{ oldStart: number; newStart: number; lines: Array<{ type: string; text: string }> }> | null };
const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-900';

function ChangesTab() {
  const review = useChatReview()!;
  const records = review.data.checkpoints.filter(item => item.phase === 'after');
  const checkpoint = records.find(item => item.id === review.checkpointId) ?? records.filter(item => item.activeBranch !== false).at(-1);
  const [file, setFile] = useState<string | null>(review.filePath), [diff, setDiff] = useState<Diff | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => { setFile(review.filePath ?? checkpoint?.changes[0]?.path ?? null); }, [review.filePath, checkpoint?.id]);
  const files = review.scope === 'session' ? review.data.sessionChanges : checkpoint?.changes ?? [];
  useEffect(() => { if (file && !files.some(changed => changed.path === file)) setFile(files[0]?.path ?? null); }, [files, file]);
  useEffect(() => {
    if (!checkpoint || !file) { setDiff(null); return; }
    let current = true; setDiff(null); setError(null);
    void review.request<Diff>('diff', { checkpointId: checkpoint.id, filePath: file, scope: review.scope }).then(result => { if (current) setDiff(result); }, failure => { if (current) setError(failure.message); });
    return () => { current = false; };
  }, [checkpoint?.id, file, review.scope, review.request]);
  if (!checkpoint) return <div className="py-10 text-center text-xs text-neutral-500">{review.loading ? '正在读取检查点…' : '该对话尚无文件改动记录。'}<p className="mt-2">新轮次会自动保存检查点，普通文件夹同样适用。</p></div>;
  return <div className="space-y-4 p-3.5 text-xs">
    <div className="flex items-center justify-between gap-2"><span className="font-medium">{review.scope === 'turn' ? '本轮改动' : '本会话改动'}</span><span className="text-neutral-400">{files.length} 个文件</span></div>
    <div className="text-neutral-500">{new Date(checkpoint.createdAt).toLocaleString()} · 保存的历史版本{checkpoint.status === 'incomplete' ? ' · 执行未完成' : ''}</div>
    <div className="flex rounded-md bg-neutral-100 p-1 dark:bg-neutral-900">{(['turn', 'session'] as const).map(scope => <button type="button" key={scope} onClick={() => review.setScope(scope)} aria-pressed={review.scope === scope} className={`flex-1 rounded px-2 py-1.5 ${review.scope === scope ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100' : 'text-neutral-500'}`}>{scope === 'turn' ? '本轮' : '本会话'}</button>)}</div>
    <div className="-mx-3.5">{files.map(changed => <button type="button" key={changed.path} onClick={() => setFile(changed.path)} className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left ${file === changed.path ? 'bg-neutral-100 dark:bg-neutral-900' : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'}`}><span className="min-w-0 break-all font-mono">{changed.path}<span className="ml-2 font-sans text-neutral-400">{changed.operation === 'created' ? '新增' : changed.operation === 'deleted' ? '删除' : ''}</span></span><span className="shrink-0 font-mono"><span className="text-emerald-600 dark:text-emerald-400">+{changed.added}</span> <span className="text-red-500">−{changed.removed}</span></span></button>)}</div>
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {diff ? <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700"><div className="break-all border-b border-neutral-200 bg-neutral-50 px-2 py-2 font-mono dark:border-neutral-700 dark:bg-neutral-900">{diff.path}</div>
      {diff.hunks ? <div className="max-h-[440px] overflow-auto font-mono text-[11px] leading-5">{diff.hunks.flatMap((hunk, index) => [<div key={`header-${index}`} className="px-2 text-neutral-400">@@ −{hunk.oldStart} +{hunk.newStart} @@</div>, ...hunk.lines.map((line, lineIndex) => <div key={`${index}-${lineIndex}`} className={`flex px-2 ${line.type === 'add' ? 'bg-emerald-500/10' : line.type === 'delete' ? 'bg-red-500/10' : ''}`}><span className="w-4 shrink-0 select-none">{line.type === 'add' ? '+' : line.type === 'delete' ? '−' : ' '}</span><span className="whitespace-pre-wrap break-all">{line.text || ' '}</span></div>)])}</div> : <p className="p-3 text-neutral-500">二进制、大型或未保护文件不展示文本差异。恢复能力以预览为准。</p>}
    </div> : file && !error ? <div className="flex items-center gap-2 text-neutral-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />读取差异…</div> : null}
    {files.length === 0 && <p className="text-neutral-500">本会话当前没有剩余文件改动。</p>}
    {diff?.source === 'observed' && <p className="text-neutral-500">目录比较发现的改动可能包含命令或外部编辑，请在恢复预览中核对。</p>}
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={review.running || review.data.busy || review.readOnly} onClick={() => void review.preview(checkpoint.id, review.scope)}><Undo2 className="h-3.5 w-3.5" />{review.scope === 'turn' ? '撤回本轮' : '撤回本会话修改'}</button><button type="button" className={button} onClick={() => review.open('git', checkpoint.id)}>选择文件并提交</button></div>
    <p className="flex items-start gap-1.5 border-t border-neutral-200 pt-3 text-neutral-500 dark:border-neutral-700"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />恢复只处理已记录的修改，并保护后续编辑。</p>
  </div>;
}

function CheckpointsTab() {
  const review = useChatReview()!;
  const records = review.data.checkpoints.filter(item => item.phase === 'after').slice().reverse();
  return <div className="space-y-4 p-3.5 text-xs"><div className="font-medium">检查点历史</div><p className="text-neutral-500">每轮自动保存。保留最近 100 轮。恢复前会再次保存当前文件。</p>
    {!records.length && <p className="py-8 text-center text-neutral-400">新轮次开始后会出现检查点。</p>}
    {records.map(record => <div key={record.id} className="border-l-2 border-violet-200 pl-3 dark:border-violet-900"><div className="font-medium">{new Date(record.createdAt).toLocaleString()}</div><div className="mt-1 text-neutral-500">{record.changes.length} 个文件 · {record.status === 'complete' ? '完成' : '执行未完成'}{record.unprotected > 0 ? ` · ${record.unprotected} 个文件未保护` : ''}</div><div className="mt-2 flex flex-wrap gap-2"><button type="button" className={button} onClick={() => review.open('changes', record.id)}>查看改动</button><button type="button" className={button} disabled={review.running || review.data.busy || review.readOnly} onClick={() => void review.preview(record.id, record.activeBranch === false ? 'turn' : 'since')}>回到此轮开始前</button></div></div>)}
    {review.data.operations.slice().reverse().map(operation => <div key={operation.id} className="rounded-md bg-neutral-100 p-3 dark:bg-neutral-900"><div>恢复操作 · {new Date(operation.createdAt).toLocaleString()}</div><p className="mt-1 text-neutral-500">{operation.applied.length} 个文件已恢复 · {operation.skipped.length} 个保留{operation.status !== 'complete' ? ' · 恢复中断，可恢复已处理文件' : ''}</p><button type="button" className={`${button} mt-2`} disabled={review.running || review.data.busy || review.readOnly} onClick={() => void review.undo(operation.id)}>撤销这次恢复</button></div>)}
    <p className="flex gap-1.5 border-t border-neutral-200 pt-3 text-neutral-500 dark:border-neutral-700"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />检查点保存在本机，与 Git 提交独立。</p>
  </div>;
}

function RestoreDialog({ plan }: { plan: RestorePlan }) {
  const review = useChatReview()!;
  const [selected, setSelected] = useState(plan.files.filter(file => file.status === 'ready').map(file => file.path));
  const [switching, setSwitching] = useState(false);
  const checkpoint = review.data.checkpoints.find(item => item.id === plan.checkpointId);
  const modeLabel = plan.mode === 'files' ? '仅撤回文件改动' : plan.mode === 'both' ? '文件和对话一起回退' : '仅回退对话';
  return <ConfirmDialog title="恢复预览" confirmLabel={plan.mode === 'conversation' ? '确认回退对话' : `确认恢复 ${selected.length} 个文件`} busy={review.restoring || switching} disabled={plan.mode === 'files' && selected.length === 0} error={review.error} onCancel={() => review.setPlan(null)} onConfirm={() => void review.restore(selected)}>
    <p>恢复前会保存当前状态。存在后续编辑的文件默认保留。</p>
    {checkpoint?.phase === 'after' ? <label className="my-3 block">恢复方式<select aria-label="恢复方式" value={plan.mode} disabled={review.restoring || switching} onChange={async event => { setSwitching(true); await review.preview(plan.checkpointId, plan.scope ?? 'turn', event.target.value as RestorePlan['mode']); setSwitching(false); }} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-foreground"><option value="files">仅撤回文件改动，保留对话</option><option value="both">文件和对话一起回退</option><option value="conversation">仅回退对话，保留文件</option></select></label> : <p className="my-3">{modeLabel}</p>}
    {plan.mode !== 'conversation' && <div className="space-y-2">{plan.files.map(file => <label key={file.path} className="flex items-start gap-2 rounded-md bg-muted/50 p-2"><input type="checkbox" checked={selected.includes(file.path)} disabled={file.status !== 'ready' || review.restoring} onChange={event => setSelected(previous => event.target.checked ? [...previous, file.path] : previous.filter(path => path !== file.path))} className="mt-1" /><span className="min-w-0"><span className="break-all font-mono text-xs">{file.path}</span><span className="mt-1 block text-xs">{file.status === 'conflict' ? '有后续修改，保留该文件' : file.status === 'unprotected' ? '缺少可恢复备份，保留该文件' : file.status === 'unchanged' ? '已经是目标版本，无需修改' : file.target.kind === 'absent' ? '删除本轮新增文件' : '恢复原有内容'}{file.source === 'observed' ? ' · 目录中检测到的变化' : ''}</span></span></label>)}</div>}
    {plan.mode === 'both' && <p className="mt-3">对话将回到目标轮次之前；冲突文件继续保留，Agent 会收到文件恢复说明。</p>}
  </ConfirmDialog>;
}

export default function ChatReviewSidePanel({ width, minWidth, maxWidth, isMobile, onResizeStart, onResizeBy }: {
  width: number; minWidth: number; maxWidth: number; isMobile: boolean; onResizeStart: (event: MouseEvent<HTMLDivElement>) => void; onResizeBy: (delta: number) => void;
}) {
  const review = useChatReview();
  if (!review?.panelOpen) return null;
  return <><ToolSidePanel title="改动与版本" icon={Files} width={width} minWidth={minWidth} maxWidth={maxWidth} isMobile={isMobile} closeLabel="收起改动面板" resizeLabel="调整改动面板宽度" onClose={review.close} onResizeStart={onResizeStart} onResizeBy={onResizeBy}>
    <div className="flex h-full min-h-0 flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100" data-testid="chat-review-panel"><div className="flex shrink-0 items-center gap-5 border-b border-neutral-200 px-3.5 dark:border-neutral-800">{(['changes', 'checkpoints', 'git'] as const).map(tab => <button type="button" key={tab} onClick={() => review.open(tab)} aria-pressed={review.tab === tab} className={`border-b-2 py-3 text-xs ${review.tab === tab ? 'border-violet-500 text-neutral-900 dark:text-neutral-100' : 'border-transparent text-neutral-500'}`}>{tab === 'changes' ? '改动' : tab === 'checkpoints' ? '检查点' : 'Git'}</button>)}<button type="button" className="ml-auto text-neutral-400" aria-label="刷新改动和 Git 状态" onClick={() => { void review.refresh(); void review.refreshGit(); }}><RefreshCw className={`h-3.5 w-3.5 ${review.loading ? 'animate-spin' : ''}`} /></button></div>
      {review.error && <div role="alert" className="shrink-0 break-words bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">{review.error}</div>}
      {(review.running || review.data.busy) && <div className="shrink-0 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">目录正在修改，完成或停止后可恢复和操作 Git。</div>}
      <div className="min-h-0 flex-1 overflow-y-auto">{review.tab === 'changes' ? <ChangesTab /> : review.tab === 'checkpoints' ? <CheckpointsTab /> : <GitReviewTab />}</div>
    </div>
  </ToolSidePanel>{review.plan && <RestoreDialog key={review.plan.id} plan={review.plan} />}</>;
}
