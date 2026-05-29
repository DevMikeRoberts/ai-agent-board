const { mkdirSync, rmSync } = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const dbPath = path.join(repoRoot, 'packages', 'e2e', 'test-results', 'agentboard-e2e.db');
const agentboardHome = path.join(repoRoot, 'packages', 'e2e', 'test-results', 'agentboard-home');
function portFromEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a numeric port`);
  }
  return value;
}
const serverPort = portFromEnv('E2E_SERVER_PORT', '3002');
const clientPort = portFromEnv('E2E_CLIENT_PORT', '4176');
const allowedRepoRoots = [
  repoRoot,
  process.env.TEMP,
  process.env.TMP,
  process.env.TMPDIR,
].filter(Boolean).join(',');

mkdirSync(path.dirname(dbPath), { recursive: true });
rmSync(dbPath, { force: true });
rmSync(agentboardHome, { recursive: true, force: true });
mkdirSync(agentboardHome, { recursive: true });

const child = spawn(isWindows ? 'npx tsx src/index.ts' : 'npx', isWindows ? [] : ['tsx', 'src/index.ts'], {
  cwd: path.join(repoRoot, 'packages', 'server'),
  env: {
    ...process.env,
    PORT: serverPort,
    DATABASE_URL: '',
    DB_PATH: dbPath,
    API_KEY: '',
    ALLOWED_ORIGINS: `http://localhost:${clientPort}`,
    ALLOWED_REPO_ROOTS: allowedRepoRoots,
    AGENTBOARD_HOME: agentboardHome,
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
