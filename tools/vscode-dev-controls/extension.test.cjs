const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(platform, trusted = true) {
  const uri = name => ({ scheme: 'file', fsPath: `/${name}`, toString: () => `file:///${name}` });
  const folder = { name: 'Share Monitor', uri: uri('project') };
  const other = { uri: uri('other') };
  const commands = new Map();
  const buttons = [];
  const started = [];
  const stopped = [];
  const execution = (name, scope) => ({ task: { name, scope }, terminate: () => stopped.push([name, scope]) });
  const vscode = {
    workspace: {
      workspaceFolders: [folder], isTrusted: trusted,
      onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
      onDidGrantWorkspaceTrust: () => ({ dispose() {} }),
    },
    window: {
      createStatusBarItem: id => {
        const item = { id, show() { this.visible = true; }, dispose() { this.visible = false; } };
        buttons.push(item); return item;
      },
      showErrorMessage: message => { throw new Error(message); },
    },
    commands: { registerCommand: (id, callback) => { commands.set(id, callback); return { dispose() {} }; } },
    StatusBarAlignment: { Left: 1 },
    tasks: {
      taskExecutions: [],
      fetchTasks: async () => [
        { name: 'Share Monitor: Backend', scope: other },
        { name: 'Share Monitor: Backend', scope: folder },
        { name: 'Share Monitor: Frontend', scope: folder },
      ],
      executeTask: async task => started.push(task),
    },
  };
  const sandbox = {
    module: { exports: {} }, process: { platform },
    require: name => name === 'vscode' ? vscode : name === 'node:fs' ? { existsSync: () => true } : require(name),
  };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/extension.cjs`, 'utf8'), sandbox);
  sandbox.module.exports.activate({ subscriptions: [] });
  return { vscode, folder, other, commands, buttons, started, stopped, execution };
}

for (const platform of ['darwin', 'win32']) {
  test(`${platform}: exactly four matching controls; start and stop stay in their workspace`, async () => {
    const f = fixture(platform);
    assert.equal(f.buttons.filter(button => button.visible).length, 4);
    assert.deepEqual(f.buttons.map(button => button.text), ['🟢 Backend', '🛑 Stop Backend', '🔵 Frontend', '🛑 Stop Frontend']);
    assert.ok(f.buttons.every(button => button.tooltip.endsWith(platform === 'darwin' ? '(macOS)' : '(Windows)')));
    await f.commands.get('shareMonitorDev.startBackend')();
    assert.equal(f.started[0].scope, f.folder);
    f.vscode.tasks.taskExecutions = [
      f.execution('Share Monitor: Backend', f.folder),
      f.execution('Share Monitor: Frontend', f.folder),
      f.execution('Share Monitor: Backend', f.other),
    ];
    await f.commands.get('shareMonitorDev.startBackend')();
    assert.equal(f.started.length, 1, 'repeated start must not launch a second task');
    await f.commands.get('shareMonitorDev.stopBackend')();
    assert.deepEqual(f.stopped, [['Share Monitor: Backend', f.folder]]);
    await f.commands.get('shareMonitorDev.stopFrontend')();
    assert.deepEqual(f.stopped[1], ['Share Monitor: Frontend', f.folder]);
  });
}
test('unsupported hosts and untrusted workspaces receive no controls', () => {
  assert.equal(fixture('linux').buttons.length, 0);
  assert.equal(fixture('darwin', false).buttons.length, 0);
});
