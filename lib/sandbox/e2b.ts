import { Sandbox } from "e2b";
import { generateRuntimeWrapper } from "@/lib/llm/sandbox-client";

// Built-in Node.js modules that don't need to be installed
const BUILTIN_MODULES = new Set([
  "assert", "buffer", "child_process", "cluster", "crypto", "dgram", "dns",
  "domain", "events", "fs", "http", "https", "net", "os", "path", "punycode",
  "querystring", "readline", "repl", "stream", "string_decoder", "timers",
  "tls", "tty", "url", "util", "v8", "vm", "zlib", "process", "console",
  "constants", "module", "async_hooks", "http2", "perf_hooks", "worker_threads",
]);

// Pre-installed packages in our E2B template
const PREINSTALLED_PACKAGES = new Set([
  "@sipgate/ai-flow-sdk",
  "express",
  "tsx",
]);

/**
 * Extract npm package names from import/require statements
 */
function extractImportsFromCode(code: string): Set<string> {
  const imports = new Set<string>();

  // Match ES6 imports: import ... from 'package' or import('package')
  const importRegex = /import\s+(?:[\w{},\s*]*\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    imports.add(match[1]);
  }

  // Match dynamic imports: import('package')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(code)) !== null) {
    imports.add(match[1]);
  }

  // Match CommonJS requires: require('package')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(code)) !== null) {
    imports.add(match[1]);
  }

  return imports;
}

/**
 * Convert import specifiers to npm package names
 * e.g., "axios" -> "axios", "@org/package/subpath" -> "@org/package"
 */
function getPackageNameFromImport(importPath: string): string | null {
  // Ignore relative imports
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    return null;
  }

  // Ignore built-in modules
  if (BUILTIN_MODULES.has(importPath) || importPath.startsWith('node:')) {
    return null;
  }

  // Ignore pre-installed packages
  if (PREINSTALLED_PACKAGES.has(importPath)) {
    return null;
  }

  // Handle scoped packages: @org/package/subpath -> @org/package
  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
  }

  // Regular packages: package/subpath -> package
  const parts = importPath.split('/');
  return parts[0];
}

/**
 * Detect npm packages needed from code and return unique list
 */
function detectRequiredPackages(code: string): string[] {
  const imports = extractImportsFromCode(code);
  const packages = new Set<string>();

  for (const importPath of imports) {
    const packageName = getPackageNameFromImport(importPath);
    if (packageName && !PREINSTALLED_PACKAGES.has(packageName)) {
      packages.add(packageName);
    }
  }

  return Array.from(packages).sort();
}

// Store active sandboxes by project ID
const activeSandboxes = new Map<string, Sandbox>();

// Store sandbox IDs for reconnection after hot reload
const sandboxIds = new Map<string, string>();

// Store captured logs per project (stdout + stderr combined)
const capturedLogs = new Map<string, string[]>();

// Max lines to keep in memory per project
const MAX_LOG_LINES = 200;

export interface SandboxInfo {
  sandboxId: string;
  webhookUrl: string;
}

// Reconnect to an existing sandbox by ID
export async function reconnectSandbox(
  projectId: string,
  sandboxId: string
): Promise<Sandbox | null> {
  try {
    console.log(`[E2B] Attempting to connect to sandbox: ${sandboxId}`);
    const sandbox = await Sandbox.connect(sandboxId, {
      apiKey: process.env.E2B_API_KEY,
    });

    // Verify the sandbox is actually running
    const isRunning = await sandbox.isRunning();
    if (!isRunning) {
      console.log(`[E2B] Sandbox ${sandboxId} is not running`);
      return null;
    }

    console.log(`[E2B] Successfully connected to sandbox: ${sandboxId}`);
    activeSandboxes.set(projectId, sandbox);
    sandboxIds.set(projectId, sandboxId);
    return sandbox;
  } catch (error) {
    // Sandbox no longer exists or connection failed
    console.log(
      `[E2B] Failed to connect to sandbox ${sandboxId}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

// Get or reconnect to sandbox
async function getOrReconnectSandbox(
  projectId: string,
  sandboxId?: string
): Promise<Sandbox | null> {
  // Check if we already have it in memory
  let sandbox: Sandbox | null | undefined = activeSandboxes.get(projectId);
  if (sandbox) {
    // Verify it's still running
    try {
      const isRunning = await sandbox.isRunning();
      if (isRunning) {
        return sandbox;
      }
      // Sandbox died, clean up
      console.log(`[E2B] Cached sandbox for ${projectId} is no longer running`);
      activeSandboxes.delete(projectId);
    } catch {
      activeSandboxes.delete(projectId);
    }
  }

  // Try to reconnect using provided sandboxId or stored one
  const idToUse = sandboxId || sandboxIds.get(projectId);
  if (idToUse) {
    sandbox = await reconnectSandbox(projectId, idToUse);
    if (sandbox) {
      return sandbox;
    }
  }

  return null;
}

export async function createSandbox(projectId: string): Promise<SandboxInfo> {
  // Check if sandbox already exists
  const existing = activeSandboxes.get(projectId);
  if (existing) {
    await existing.kill();
    activeSandboxes.delete(projectId);
  }

  // Create new sandbox with custom template (Node.js 22 + dependencies pre-installed)
  console.log(`[E2B] Creating sandbox for project ${projectId}...`);
  const sandbox = await Sandbox.create("flowcommander-node22", {
    apiKey: process.env.E2B_API_KEY,
    timeoutMs: 3600000, // 1 hour timeout
  });
  console.log(`[E2B] Sandbox created: ${sandbox.sandboxId}`);

  // Verify Node version and dependencies
  const nodeVersion = await sandbox.commands.run("node --version", { timeoutMs: 5000 });
  console.log(`[E2B] Node version: ${nodeVersion.stdout.trim()}`);

  // Get the public URL
  const host = sandbox.getHost(3000);
  const webhookUrl = `https://${host}/webhook`;

  activeSandboxes.set(projectId, sandbox);
  sandboxIds.set(projectId, sandbox.sandboxId);

  return {
    sandboxId: sandbox.sandboxId,
    webhookUrl,
  };
}

export async function deploySandbox(
  projectId: string,
  code: string,
  sandboxId?: string
): Promise<{ success: boolean; logs: string[] }> {
  console.log(`[E2B] deploySandbox called for project ${projectId}, sandboxId: ${sandboxId}`);
  console.log(`[E2B] Code length: ${code?.length || 0}`);

  const sandbox = await getOrReconnectSandbox(projectId, sandboxId);
  console.log(`[E2B] getOrReconnectSandbox returned: ${sandbox ? sandbox.sandboxId : 'null'}`);

  if (!sandbox) {
    console.error("[E2B] Sandbox not found!");
    throw new Error("Sandbox not found. Please restart the sandbox.");
  }

  const logs: string[] = [];

  try {
    console.log(`[E2B] Starting deploy for project ${projectId}`);

    // Kill ALL node processes to free port 3000
    console.log("[E2B] About to run pkill...");
    try {
      const killResult = await sandbox.commands.run("pkill -f 'node' 2>/dev/null; exit 0", { timeoutMs: 5000 });
      console.log(`[E2B] pkill result: exit=${killResult.exitCode}, stdout=${killResult.stdout}, stderr=${killResult.stderr}`);
    } catch (killError) {
      // pkill returns non-zero if no processes found, which is fine
      console.log(`[E2B] pkill threw (this is OK if no processes): ${killError}`);
    }
    logs.push("Killed existing processes");

    // Small delay to ensure processes are killed and port is released
    console.log("[E2B] Waiting 2 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log("[E2B] Wait complete");

    // Check current working directory and permissions
    console.log("[E2B] Checking working directory...");
    const pwdCheck = await sandbox.commands.run("pwd && whoami && ls -la /home/user/", {
      timeoutMs: 5000,
    });
    console.log(`[E2B] Working dir check: ${pwdCheck.stdout}`);

    // Detect required npm packages from user code
    console.log(`[E2B] Analyzing code for imports (code length: ${code.length})`);
    console.log(`[E2B] Code preview for import detection:\n${code.substring(0, 500)}`);

    const requiredPackages = detectRequiredPackages(code);
    console.log(`[E2B] Detected ${requiredPackages.length} required packages:`, requiredPackages);

    // Always create package.json to ensure consistent package availability
    // Include both pre-installed packages and user-detected packages
    const allDependencies = {
      "@sipgate/ai-flow-sdk": "latest",
      "express": "latest",
      "tsx": "latest",
      ...Object.fromEntries(requiredPackages.map(pkg => [pkg, "latest"])),
    };

    const packageJson = {
      name: "voice-agent",
      version: "1.0.0",
      type: "module",
      dependencies: allDependencies,
    };

    try {
      const packageJsonContent = JSON.stringify(packageJson, null, 2);
      console.log("[E2B] Writing package.json:", packageJsonContent);
      await sandbox.files.write("/home/user/package.json", packageJsonContent);

      if (requiredPackages.length > 0) {
        logs.push(`Installing packages: ${requiredPackages.join(", ")}`);
      } else {
        logs.push("Installing base packages");
      }

      // Run npm install with timeout (max 2 minutes for package installation)
      const installResult = await sandbox.commands.run(
        "cd /home/user && npm install --no-audit --no-fund",
        { timeoutMs: 120000 }
      );

      console.log(`[E2B] npm install exit code: ${installResult.exitCode}`);
      console.log(`[E2B] npm install stdout: ${installResult.stdout}`);
      console.log(`[E2B] npm install stderr: ${installResult.stderr}`);

      if (installResult.exitCode === 0) {
        if (requiredPackages.length > 0) {
          logs.push(`Installed: ${requiredPackages.join(", ")}`);
        }
        console.log("[E2B] npm install completed successfully");
      } else {
        logs.push(`npm install failed: ${installResult.stderr}`);
        console.error("[E2B] npm install failed with code:", installResult.exitCode);
      }
    } catch (installError) {
      const errorMsg = installError instanceof Error ? installError.message : String(installError);
      logs.push(`Package installation error: ${errorMsg}`);
      console.error("[E2B] Package installation error:", installError);
      // Continue anyway - maybe packages aren't actually needed
    }

    // Wrap user code with runtime (imports, callLLM, server setup)
    const fullCode = generateRuntimeWrapper(projectId, code);

    // Write the wrapped code
    console.log(`[E2B] Writing code (${code.length} user chars, ${fullCode.length} total with wrapper)`);
    console.log(`[E2B] Code preview: ${code.substring(0, 200)}...`);

    try {
      await sandbox.files.write("/home/user/run.ts", fullCode);
      logs.push("Code written to sandbox (with runtime wrapper)");
      console.log("[E2B] File write completed");
    } catch (writeError) {
      console.error("[E2B] File write failed:", writeError);
      logs.push(`File write error: ${writeError}`);
      throw writeError;
    }

    // Verify file was written
    const fileCheck = await sandbox.commands.run("ls -la /home/user/run.ts && head -5 /home/user/run.ts", {
      timeoutMs: 5000,
    });
    console.log(`[E2B] File check: ${fileCheck.stdout}`);
    if (fileCheck.stderr) {
      console.log(`[E2B] File check stderr: ${fileCheck.stderr}`);
    }
    logs.push(`File: ${fileCheck.stdout.trim()}`);

    // Run the TypeScript file in background using E2B's native background mode
    console.log("[E2B] Starting tsx process in background...");

    // Clear previous logs for this project
    capturedLogs.set(projectId, []);

    // Use E2B's background: true option for proper background execution
    // IMPORTANT: timeout: 0 means no limit on the command connection time
    // Without this, E2B disconnects after 60 seconds (default) which kills the server
    const command = await sandbox.commands.run(
      "cd /home/user && npx tsx run.ts 2>&1 | tee /tmp/server-output.log",
      {
        background: true,
        timeoutMs: 0, // No timeout - keep connection alive indefinitely
        onStdout: (data) => {
          console.log(`[E2B stdout] ${data}`);
          // Capture log line
          const projectLogs = capturedLogs.get(projectId) || [];
          projectLogs.push(`[stdout] ${data}`);
          // Keep only last MAX_LOG_LINES
          if (projectLogs.length > MAX_LOG_LINES) {
            projectLogs.shift();
          }
          capturedLogs.set(projectId, projectLogs);
        },
        onStderr: (data) => {
          console.log(`[E2B stderr] ${data}`);
          // Capture log line
          const projectLogs = capturedLogs.get(projectId) || [];
          projectLogs.push(`[stderr] ${data}`);
          // Keep only last MAX_LOG_LINES
          if (projectLogs.length > MAX_LOG_LINES) {
            projectLogs.shift();
          }
          capturedLogs.set(projectId, projectLogs);
        },
      }
    );

    console.log(`[E2B] Background command started with PID: ${command.pid}`);
    logs.push(`Started server with PID: ${command.pid}`);

    // Give it a moment to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Check if process is running
    const pidCheck = await sandbox.commands.run(
      `ps aux | grep -E 'tsx|node' | grep -v grep || echo 'No tsx/node process found'`,
      { timeoutMs: 5000 }
    );
    console.log(`[E2B] Process check: ${pidCheck.stdout}`);
    logs.push(`Process check: ${pidCheck.stdout.trim()}`);

    // Check early logs
    const earlyLogs = await sandbox.commands.run(
      "cat /tmp/server-output.log 2>/dev/null || echo 'No log yet'",
      { timeoutMs: 5000 }
    );
    console.log(`[E2B] Early logs: ${earlyLogs.stdout}`);
    if (earlyLogs.stdout.includes("Error") || earlyLogs.stdout.includes("error")) {
      logs.push(`Startup errors: ${earlyLogs.stdout}`);
    }

    logs.push("Server starting...");

    // Wait for server to be ready by polling the port
    const maxAttempts = 15;
    let serverReady = false;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        const check = await sandbox.commands.run(
          "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/health || echo 'not ready'",
          { timeoutMs: 5000 }
        );

        if (check.stdout.includes("200") || check.stdout.includes("404")) {
          // 404 is fine - it means server is up, just no /health route
          serverReady = true;
          logs.push(`Server ready after ${i + 1} seconds`);
          break;
        }
      } catch {
        // Connection refused, keep waiting
      }
    }

    if (!serverReady) {
      logs.push(
        "Warning: Server may still be starting. Check status in a few seconds."
      );
    }

    return { success: true, logs };
  } catch (error) {
    console.error("[E2B] Deploy error caught:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : "";
    console.error(`[E2B] Error message: ${errorMessage}`);
    console.error(`[E2B] Error stack: ${errorStack}`);
    logs.push(`Deploy failed: ${errorMessage}`);
    return { success: false, logs };
  }
}

export async function getSandboxStatus(
  projectId: string,
  sandboxId?: string
): Promise<{ status: "running" | "stopped" | "error" | "port_down"; url?: string }> {
  const sandbox = await getOrReconnectSandbox(projectId, sandboxId);

  if (!sandbox) {
    return { status: "stopped" };
  }

  try {
    // Check if sandbox is still alive
    const result = await sandbox.commands.run("echo ok", { timeoutMs: 5000 });
    if (result.exitCode !== 0) {
      return { status: "error" };
    }

    // Check if port 3000 is listening
    const portCheck = await sandbox.commands.run(
      "curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:3000/health 2>/dev/null || echo 'down'",
      { timeoutMs: 5000 }
    );

    const host = sandbox.getHost(3000);
    const url = `https://${host}/webhook`;

    if (portCheck.stdout.includes("200") || portCheck.stdout.includes("404")) {
      return { status: "running", url };
    }

    // Sandbox container is running but port is down - server crashed
    console.log(`[E2B] Sandbox ${sandboxId} port 3000 is down (server crashed)`);
    return { status: "port_down", url };
  } catch {
    // Sandbox is dead, clean up
    activeSandboxes.delete(projectId);
    sandboxIds.delete(projectId);
    return { status: "stopped" };
  }
}

// Restart the server inside the sandbox (redeploy without recreating container)
export async function restartSandboxServer(
  projectId: string,
  code: string,
  sandboxId?: string
): Promise<{ success: boolean; logs: string[] }> {
  console.log(`[E2B] Restarting server for project ${projectId}`);
  return deploySandbox(projectId, code, sandboxId);
}

export async function terminateSandbox(
  projectId: string,
  sandboxId?: string
): Promise<void> {
  const sandbox = await getOrReconnectSandbox(projectId, sandboxId);
  if (sandbox) {
    await sandbox.kill();
    activeSandboxes.delete(projectId);
    sandboxIds.delete(projectId);
  }
}

export function getSandboxForProject(projectId: string): Sandbox | undefined {
  return activeSandboxes.get(projectId);
}

export async function getSandboxLogs(
  projectId: string,
  sandboxId?: string
): Promise<{ logs: string; error?: string }> {
  const logs: string[] = [];

  // First, include any captured in-memory logs (most reliable for crashes)
  const inMemoryLogs = capturedLogs.get(projectId);
  if (inMemoryLogs && inMemoryLogs.length > 0) {
    logs.push("=== Captured Output ===");
    logs.push(inMemoryLogs.join("\n"));
  }

  const sandbox = await getOrReconnectSandbox(projectId, sandboxId);

  if (!sandbox) {
    // Return in-memory logs even if sandbox is gone
    if (logs.length > 0) {
      return { logs: logs.join("\n") };
    }
    return { logs: "", error: "Sandbox not found. Please restart the sandbox." };
  }

  try {
    // Try to get any recent console output from file
    try {
      const recentOutput = await sandbox.commands.run(
        "tail -100 /tmp/server-output.log 2>/dev/null || echo ''",
        { timeoutMs: 5000 }
      );
      if (recentOutput.stdout.trim()) {
        logs.push("=== Server Output Log ===");
        logs.push(recentOutput.stdout);
      }
    } catch {
      // Could not read log file
    }

    // Check running processes
    try {
      const psResult = await sandbox.commands.run("ps aux | grep -E 'node|tsx' | grep -v grep", {
        timeoutMs: 5000,
      });
      if (psResult.stdout.trim()) {
        logs.push("=== Running Processes ===");
        logs.push(psResult.stdout);
      }
    } catch {
      // Could not check processes
    }

    // Check if port 3000 is listening
    try {
      const portCheck = await sandbox.commands.run(
        "netstat -tlnp 2>/dev/null | grep 3000 || ss -tlnp | grep 3000 || echo 'Port 3000 not listening'",
        { timeoutMs: 5000 }
      );
      logs.push("=== Port Status ===");
      logs.push(portCheck.stdout);
    } catch {
      // Could not check port
    }

    return { logs: logs.join("\n") };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    // Still return in-memory logs if we have them
    if (logs.length > 0) {
      return { logs: logs.join("\n"), error: errorMessage };
    }
    return { logs: "", error: errorMessage };
  }
}

// Export function to get just the in-memory captured logs
export function getCapturedLogs(projectId: string): string[] {
  return capturedLogs.get(projectId) || [];
}
