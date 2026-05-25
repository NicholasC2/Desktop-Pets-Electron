import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {

  const disposable = vscode.commands.registerCommand(
    'fl-dance.open',
    () => {

      const electronPath = require('electron');

      const mainPath = path.join(
        context.extensionPath,
        'electron',
        'main.js'
      );

      const child = spawn(electronPath, [mainPath], {
        detached: true,
        stdio: 'ignore'
      });

      child.unref();
    }
  );

  context.subscriptions.push(disposable);
}