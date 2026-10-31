import { $ } from './common.js';

const m = location.pathname.match(/^\/g\/([A-Za-z0-9_-]+)/);
if (m) {
  const { startClient } = await import('./client.js');
  startClient(m[1]);
} else {
  const { startAdmin } = await import('./admin.js');
  startAdmin();
}
