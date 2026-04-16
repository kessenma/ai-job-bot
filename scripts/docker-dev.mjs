#!/usr/bin/env node
import { createInterface } from "readline";
import { execSync, spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_DIR = resolve(ROOT, "apps/web");

const SERVICES = {
  web: {
    label: "Web app (port 3000)",
    file: "docker-compose.web.yml",
    localOnly: false,
  },
  llm: {
    label: "LLM service (port 8083)",
    file: "docker-compose.llm.yml",
    localOnly: true, // no local dev mode — always Docker
  },
  playwright: {
    label: "Playwright service (port 8084)",
    file: "docker-compose.playwright.yml",
    localOnly: true, // no local dev mode — always Docker
  },
  jobspy: {
    label: "JobSpy service (port 8085)",
    file: "docker-compose.jobspy.yml",
    localOnly: true, // no local dev mode — always Docker
  },
};

const PRESETS = {
  1: { name: "Web + LLM", services: ["web", "llm"] },
  2: { name: "Web + Playwright", services: ["web", "playwright"] },
  3: { name: "All services", services: ["web", "llm", "playwright", "jobspy"] },
  4: { name: "All except LLM", services: ["web", "playwright", "jobspy"] },
  5: { name: "Custom selection", services: null },
};

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

function checkDockerRunning() {
  try {
    execSync("docker info", { stdio: "ignore" });
    return;
  } catch {
    // not running — try to start it
  }

  console.log("Docker is not running. Starting Docker Desktop...");
  try {
    execSync("open -a Docker", { stdio: "ignore" });
  } catch {
    console.error("Could not launch Docker Desktop. Please start it manually.");
    process.exit(1);
  }

  // Poll until the daemon is ready (up to 60s)
  const deadline = Date.now() + 60_000;
  process.stdout.write("Waiting for Docker");
  while (Date.now() < deadline) {
    try {
      execSync("docker info", { stdio: "ignore" });
      process.stdout.write(" ready.\n");
      return;
    } catch {
      process.stdout.write(".");
      execSync("sleep 2");
    }
  }

  console.error("\nDocker did not start in time. Please try again.");
  process.exit(1);
}

function getRunningServices(files) {
  const composeArgs = files.flatMap((f) => ["-f", f]);
  try {
    const out = execSync(
      ["docker", "compose", ...composeArgs, "ps", "--services", "--filter", "status=running"].join(" "),
      { stdio: ["ignore", "pipe", "ignore"] }
    ).toString().trim();
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

// Returns "skip" if all services are running and user wants to keep them,
// or undefined otherwise.
async function warnIfAlreadyRunning(files, { canSkip = false } = {}) {
  const running = getRunningServices(files);
  if (running.length === 0) return;

  console.log(`\n⚠️  The following services are already running:`);
  running.forEach((s, i) => console.log(`  ${i + 1}) ${s}`));
  console.log(`\nOptions:`);
  if (canSkip) {
    console.log(`  k) Keep running (skip rebuild)`);
  }
  console.log(`  a) Restart all`);
  console.log(`  n) Abort`);
  console.log(`  Or enter numbers to restart specific services (e.g. "1" or "1,3")`);

  const answer = (await ask(`\nRestart which? (${canSkip ? "k/" : ""}a/n/numbers): `)).trim().toLowerCase();

  if (answer === "k" && canSkip) {
    console.log("Keeping existing containers running.");
    return "skip";
  }

  if (answer === "n") {
    console.log("Aborted.");
    process.exit(0);
  }

  let toRestart;
  if (answer === "a" || answer === "y") {
    toRestart = running;
  } else {
    const indices = answer
      .split(",")
      .map((s) => parseInt(s.trim(), 10) - 1)
      .filter((i) => i >= 0 && i < running.length);
    toRestart = [...new Set(indices.map((i) => running[i]))];
  }

  if (toRestart.length === 0) {
    console.log("No services selected, continuing without restart.");
    return canSkip ? "skip" : undefined;
  }

  // Stop only the selected services
  const composeArgs = files.flatMap((f) => ["-f", f]);
  console.log(`\nRestarting: ${toRestart.join(", ")}`);
  execSync(
    ["docker", "compose", ...composeArgs, "stop", ...toRestart].join(" "),
    { stdio: "inherit" }
  );
}

function ensureCoolifyNetwork() {
  try {
    execSync("docker network inspect coolify", { stdio: "ignore" });
  } catch {
    console.log("Creating 'coolify' network for local dev...");
    execSync("docker network create coolify", { stdio: "inherit" });
  }
}

// Parse answer like "1", "1l", "4", "4l" — returns { presetKey, localWeb }
function parseAnswer(raw) {
  const localWeb = raw.endsWith("l") || raw.endsWith("L");
  const presetKey = raw.replace(/[lL]$/, "").trim();
  return { presetKey, localWeb };
}

async function pickServices() {
  console.log("\nAvailable presets:");
  for (const [key, preset] of Object.entries(PRESETS)) {
    console.log(`  ${key}) ${preset.name}`);
  }
  console.log(
    '\n  Tip: append "l" to run the web app locally instead of in Docker'
  );
  console.log('       e.g. "1l" = Web (local) + LLM (Docker)');

  let raw, presetKey, localWeb, preset;
  while (true) {
    raw = (await ask("\nSelect preset (1-5[l]): ")).trim();
    ({ presetKey, localWeb } = parseAnswer(raw));
    preset = PRESETS[presetKey];
    if (preset) break;
    console.log(`\n  "${raw}" is not a valid selection. Please try again.`);
  }

  if (preset.services) {
    console.log(
      `\nSelected: ${preset.name}${localWeb ? " (web running locally)" : ""}`
    );
    return { services: preset.services, localWeb };
  }

  // Custom selection
  console.log("\nAvailable services:");
  const keys = Object.keys(SERVICES);
  keys.forEach((key, i) => {
    console.log(`  ${i + 1}) ${key} — ${SERVICES[key].label}`);
  });

  const answer = (
    await ask('\nEnter numbers separated by commas (e.g. "1,2"): ')
  ).trim();
  const indices = answer
    .split(",")
    .map((s) => parseInt(s.trim(), 10) - 1)
    .filter((i) => i >= 0 && i < keys.length);

  const selected = [...new Set(indices.map((i) => keys[i]))];

  if (selected.length === 0) {
    console.log("No valid services selected, defaulting to Web + LLM.");
    return { services: ["web", "llm"], localWeb: false };
  }

  return { services: selected, localWeb };
}

async function main() {
  const args = process.argv.slice(2);
  const detached = args.includes("--detach") || args.includes("-d");
  const down = args.includes("--down");
  const backendOnly = args.includes("--backend-only");
  const presetArg = args.find((a) => a.startsWith("--preset="))?.split("=")[1];

  console.log("=== Docker Dev Runner ===");

  let selected, localWeb;

  if (presetArg) {
    // Non-interactive mode: --preset=1l, --preset=2, etc.
    const { presetKey, localWeb: lw } = parseAnswer(presetArg);
    const preset = PRESETS[presetKey];
    if (!preset || !preset.services) {
      console.error(`Unknown preset: ${presetArg}`);
      process.exit(1);
    }
    selected = preset.services;
    localWeb = lw;
    console.log(
      `\nPreset: ${preset.name}${localWeb ? " (web running locally)" : ""}`
    );
  } else {
    ({ services: selected, localWeb } = await pickServices());
  }

  // Split: backend services always go to Docker; web may run locally
  const runWebLocally = (localWeb || backendOnly) && selected.includes("web");
  const dockerServices = runWebLocally
    ? selected.filter((s) => s !== "web")
    : selected;

  const files = dockerServices.map((s) => SERVICES[s].file);
  const composeArgs = files.flatMap((f) => ["-f", f]);

  if (runWebLocally) {
    console.log(`\nWeb:      local (bun dev)`);
  }
  if (dockerServices.length > 0) {
    console.log(`Docker:   ${dockerServices.join(", ")}`);
    console.log(`Files:    ${files.join(", ")}`);
  }

  // Docker is only needed if we have backend services
  let skipDockerRebuild = false;
  if (dockerServices.length > 0) {
    checkDockerRunning();
    ensureCoolifyNetwork();
    const result = await warnIfAlreadyRunning(files, { canSkip: runWebLocally });
    if (result === "skip") skipDockerRebuild = true;
  }

  rl.close();

  if (down) {
    if (dockerServices.length > 0) {
      console.log("\nTearing down Docker services...");
      execSync(["docker", "compose", ...composeArgs, "down"].join(" "), {
        stdio: "inherit",
      });
    }
    return;
  }

  const procs = [];

  // Start backend services detached so web logs aren't buried
  if (dockerServices.length > 0 && !skipDockerRebuild) {
    const upArgs = ["docker", "compose", ...composeArgs, "up", "--build"];
    if (runWebLocally || detached) upArgs.push("-d");

    console.log(`\nRunning: ${upArgs.join(" ")}\n`);
    if (runWebLocally) {
      // Run backends detached, web locally in foreground
      execSync(upArgs.join(" "), { stdio: "inherit" });
    } else {
      const proc = spawn(upArgs[0], upArgs.slice(1), { stdio: "inherit" });
      procs.push(proc);
    }
  }

  if (runWebLocally && !backendOnly) {
    console.log("\nStarting web app locally...\n");
    const webProc = spawn("bun", ["run", "dev"], {
      cwd: WEB_DIR,
      stdio: "inherit",
    });
    procs.push(webProc);
  }

  const cleanup = () => {
    procs.forEach((p) => p.kill("SIGINT"));
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  procs.forEach((p) => p.on("exit", (code) => process.exit(code ?? 0)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
