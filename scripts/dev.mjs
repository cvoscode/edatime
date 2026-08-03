import { spawn } from 'node:child_process';

const backendPort = process.env.EDATIME_PORT || '3000';
const frontendPort = process.env.EDATIME_VITE_PORT || '5173';
const frontendHost = process.env.EDATIME_VITE_HOST || '127.0.0.1';
const apiOrigin = process.env.EDATIME_API_ORIGIN || `http://127.0.0.1:${backendPort}`;

const children = new Set();
let shuttingDown = false;

function spawnProcess(label, command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    shuttingDown = true;
    for (const other of children) {
      other.kill('SIGTERM');
    }
    if (signal) {
      console.error(`${label} exited from ${signal}`);
      process.exit(1);
    }
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(`${label} failed to start: ${error.message}`);
    shutdown(1);
  });

  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 250).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`Starting EdaTime backend API on http://127.0.0.1:${backendPort}`);
console.log(`Starting Vite frontend on http://${frontendHost}:${frontendPort}`);
console.log(`Vite proxies /api to ${apiOrigin}; open the Vite URL for live CSS/HMR.`);

spawnProcess('backend', 'cargo', ['run', '-p', 'edatime-bin', '--bin', 'edatime'], {
  EDATIME_PORT: backendPort,
});

spawnProcess('vite', 'npm', ['run', 'dev', '--', '--host', frontendHost, '--port', frontendPort], {
  EDATIME_API_ORIGIN: apiOrigin,
  EDATIME_PORT: backendPort,
});
