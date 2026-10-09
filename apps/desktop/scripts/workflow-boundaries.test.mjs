import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const { parse } = createRequire(new URL('../../../package.json', import.meta.url))('yaml');
const directory = new URL('../../../.github/workflows/', import.meta.url);
const workflow = name => parse(readFileSync(new URL(`${name}.yml`, directory), 'utf8'));

test('Windows Release is the sole packaging entry point and always builds on manual dispatch', () => {
  const release = workflow('release');
  assert.equal(release.name, 'Windows Release');
  assert.deepEqual(Object.keys(release.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(release.jobs), ['detect', 'windows', 'release']);
  assert.equal(release.concurrency['cancel-in-progress'], false);
  const detect = release.jobs.detect.steps.find(step => step.id === 'detect');
  assert.equal(detect.env.FORCE_RELEASE, 'true');
  assert.equal(detect.env.PILOTDECK_RELEASE_STARTED_AT, '${{ steps.started.outputs.started_at }}');
  assert.ok(release.jobs.detect.steps.find(step => step.id === 'started').run.includes('$GITHUB_RUN_ID'));
  assert.equal(release.jobs.windows.with.release_date, '${{ needs.detect.outputs.release_date }}');
  assert.equal(release.jobs.windows.with.revision, '${{ needs.detect.outputs.revision }}');
  const callers = readdirSync(directory).filter(name => name.endsWith('.yml')).flatMap(name => {
    const data = workflow(name.slice(0, -4));
    return Object.values(data.jobs).filter(job => job.uses?.includes('desktop-windows.yml')).map(() => name);
  });
  assert.deepEqual(callers, ['release.yml']);
});

test('native Windows builds use only x64 and arm64 runners without release write access', () => {
  const data = workflow('desktop-windows');
  assert.deepEqual(Object.keys(data.on), ['workflow_call']);
  assert.equal(data.on.workflow_call.inputs.release_date.required, true);
  assert.equal(data.on.workflow_call.inputs.source_sha, undefined);
  assert.equal(data.permissions.contents, 'read');
  assert.deepEqual(data.jobs.build.strategy.matrix.include.map(({ arch, runner }) => [arch, runner]),
    [['x64', 'windows-latest'], ['arm64', 'windows-11-arm']]);
  const checkout = data.jobs.build.steps.find(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref, '${{ github.sha }}');
  assert.equal(checkout.with['persist-credentials'], false);
});

test('PR desktop checks compile and test without packaging or inheriting signing secrets', () => {
  const pr = workflow('desktop-smoke');
  assert.equal(pr.permissions.contents, 'read');
  assert.deepEqual(Object.keys(pr.jobs), ['static-checks']);
  assert.ok(pr.jobs['static-checks'].steps.some(step => step.run?.includes('run test')));
  assert.equal(pr.jobs['static-checks'].secrets, undefined);
});

test('only the final release job can publish after both Windows architectures succeed', () => {
  const release = workflow('release');
  assert.equal(release.permissions.contents, 'read');
  for (const [name, job] of Object.entries(release.jobs)) {
    assert.equal(job.permissions?.contents === 'write', name === 'release');
  }
  assert.deepEqual(release.jobs.release.needs, ['detect', 'windows']);
  const steps = release.jobs.release.steps;
  const download = steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  assert.equal(download.with.pattern, 'pilotdeck-desktop-windows-*');
  const verification = steps.findIndex(step => step.run?.includes('verify-release-assets.mjs'));
  const publication = steps.findIndex(step => step.run?.includes('gh release create'));
  assert.ok(verification >= 0 && publication > verification);
});

test('build retry watches the renamed manual Windows release', () => {
  const retry = workflow('release-retry');
  assert.deepEqual(retry.on.workflow_run.workflows, ['Windows Release']);
  assert.ok(retry.jobs.retry.if.includes("github.event.workflow_run.event == 'workflow_dispatch'"));
  assert.equal(retry.jobs.retry.if.includes('schedule'), false);
});
