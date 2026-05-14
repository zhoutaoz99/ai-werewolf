import { spawn } from "node:child_process";

const processes = [
  ["api", "npm", ["--workspace", "apps/api", "run", "dev"]],
  ["web", "npm", ["--workspace", "apps/web", "run", "dev"]],
];

const children = processes.map(([name, command, args]) => {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });

  return child;
});

const shutdown = () => {
  for (const child of children) {
    child.kill("SIGTERM");
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
