// 應用程式入口：載入全域樣式、把已註冊的模組交給殼層。

import './styles/base.css';
import { createShell } from './shell/shell';
import { modules } from './modules/registry';

const root = document.getElementById('app');
if (root) {
  createShell(root, modules);
}
