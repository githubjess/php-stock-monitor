const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');

const actions = [
  ['startBackend', '🟢 Backend', 'Start PHP', 'Share Monitor: Backend', false],
  ['stopBackend', '🛑 Stop Backend', 'Stop PHP', 'Share Monitor: Backend', true],
  ['startFrontend', '🔵 Frontend', 'Start React/Vite', 'Share Monitor: Frontend', false],
  ['stopFrontend', '🛑 Stop Frontend', 'Stop React/Vite', 'Share Monitor: Frontend', true],
];

function activate(context) {
  // This is the task-executing extension host OS, including remote workspaces.
  if (!['darwin', 'win32'].includes(process.platform)) return;
  const platformName = process.platform === 'darwin' ? 'macOS' : 'Windows';
  const buttons = [];
  function folders() {
    return (vscode.workspace.workspaceFolders || []).filter(folder =>
      folder.uri.scheme === 'file' &&
      ['php-api/router.php', 'web/package.json', '.vscode/tasks.json'].every(file =>
        fs.existsSync(path.join(folder.uri.fsPath, file))));
  }
  function matches(task, folder, label) {
    return task.name === label && task.scope?.uri?.toString() === folder.uri.toString();
  }
  async function run(label, stop) {
    if (!vscode.workspace.isTrusted) return;
    const candidates = folders();
    const folder = candidates.length === 1 ? candidates[0] :
      (await vscode.window.showQuickPick(candidates.map(value => ({
        label: value.name, description: value.uri.fsPath, folder: value,
      })), { placeHolder: 'Select the Share Monitor workspace' }))?.folder;
    if (!folder) return;
    const running = vscode.tasks.taskExecutions.filter(execution => matches(execution.task, folder, label));
    if (stop) {
      for (const execution of running) execution.terminate();
      return;
    }
    if (running.length) return;
    const task = (await vscode.tasks.fetchTasks()).find(value => matches(value, folder, label));
    if (!task) throw new Error(`Task not found: ${label}`);
    await vscode.tasks.executeTask(task);
  }
  function refresh() {
    for (const button of buttons.splice(0)) button.dispose();
    if (!vscode.workspace.isTrusted || !folders().length) return;
    actions.forEach(([id, text, tooltip], index) => {
      const button = vscode.window.createStatusBarItem(`shareMonitorDev.${id}`, vscode.StatusBarAlignment.Left, 100 - index);
      button.text = text;
      button.name = `Share Monitor: ${tooltip}`;
      button.tooltip = `${tooltip} (${platformName})`;
      button.accessibilityInformation = { label: `${tooltip}, Share Monitor, ${platformName}` };
      button.command = `shareMonitorDev.${id}`;
      button.show();
      buttons.push(button);
    });
  }
  for (const [id, , , label, stop] of actions) {
    context.subscriptions.push(vscode.commands.registerCommand(`shareMonitorDev.${id}`, async () => {
      try { await run(label, stop); }
      catch (error) { void vscode.window.showErrorMessage(`Share Monitor: ${error.message}`); throw error; }
    }));
  }
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    vscode.workspace.onDidGrantWorkspaceTrust(refresh),
    { dispose: () => buttons.splice(0).forEach(button => button.dispose()) },
  );
  refresh();
}

module.exports = { activate };
