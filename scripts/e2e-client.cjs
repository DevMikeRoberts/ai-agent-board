const { spawn } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
function portFromEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a numeric port`);
  }
  return value;
}
const serverPort = portFromEnv('E2E_SERVER_PORT', '3002');
const clientPort = portFromEnv('E2E_CLIENT_PORT', '4176');
const child = spawn(isWindows ? `npx vite --port ${clientPort}` : 'npx', isWindows ? [] : ['vite', '--port', clientPort], {
  cwd: path.join(repoRoot, 'packages', 'client'),
  env: {
    ...process.env,
    API_URL: `http://localhost:${serverPort}`,
    VITE_API_KEY: '',
  },
  shell: isWindows,
  stdio: 'inherit',
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
