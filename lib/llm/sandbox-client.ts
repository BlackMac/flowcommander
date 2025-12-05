/**
 * Extract import statements from user code
 */
function extractUserImports(code: string): { imports: string[]; codeWithoutImports: string } {
  const imports: string[] = [];
  let codeWithoutImports = code;

  // Match ES6 import statements (must be at start of line, ignoring whitespace)
  const importRegex = /^[\t ]*import\s+.+?from\s+['"][^'"]+['"]\s*;?[\t ]*$/gm;
  const matches = code.match(importRegex);

  if (matches) {
    imports.push(...matches.map(m => m.trim()));
    // Remove import statements from code
    codeWithoutImports = code.replace(importRegex, '').trim();
  }

  return { imports, codeWithoutImports };
}

/**
 * Generates the complete runtime wrapper that gets injected around user code at deploy time.
 * This includes:
 * - All imports (sipgate SDK, express, + user imports)
 * - callLLM() helper function
 * - Express server setup
 *
 * The user only writes the AiFlowAssistant.create({...}) configuration.
 */

export function generateRuntimeWrapper(projectId: string, userCode: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Extract user imports and remove them from code body
  const { imports: userImports, codeWithoutImports } = extractUserImports(userCode);

  // Build imports section
  const allImports = [
    `import { AiFlowAssistant, BargeInStrategy, TtsProvider } from "@sipgate/ai-flow-sdk";`,
    `import express from "express";`,
    ...userImports,
  ].join('\n');

  // Prefix: imports and callLLM helper
  const prefix = `// ===== FLOWCOMMANDER RUNTIME (auto-injected) =====
${allImports}

const __FLOWCOMMANDER_URL__ = "${appUrl}";
const __PROJECT_ID__ = "${projectId}";

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Call the LLM to generate a response.
 * @param messages - Array of messages in the conversation
 * @returns The LLM's response text
 */
async function callLLM(messages: LLMMessage[]): Promise<string> {
  const res = await fetch(\`\${__FLOWCOMMANDER_URL__}/api/llm/\${__PROJECT_ID__}\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(\`LLM call failed: \${res.status} - \${errorData.error || "Unknown error"}\`);
  }

  const data = await res.json();
  return data.response;
}
// ===== END FLOWCOMMANDER RUNTIME HEADER =====

`;

  // Suffix: Express server setup
  const suffix = `

// ===== FLOWCOMMANDER SERVER (auto-injected) =====
const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.post("/webhook", assistant.express());

app.listen(3000, "0.0.0.0", () => {
  console.log("Server running on port 3000");
});
// ===== END FLOWCOMMANDER SERVER =====
`;

  return prefix + codeWithoutImports + suffix;
}

/**
 * @deprecated Use generateRuntimeWrapper instead
 */
export function generateLLMHelper(projectId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return `// ===== FLOWCOMMANDER RUNTIME (auto-injected) =====
const __FLOWCOMMANDER_URL__ = "${appUrl}";
const __PROJECT_ID__ = "${projectId}";

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callLLM(messages: LLMMessage[]): Promise<string> {
  const res = await fetch(\`\${__FLOWCOMMANDER_URL__}/api/llm/\${__PROJECT_ID__}\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(\`LLM call failed: \${res.status} - \${errorData.error || "Unknown error"}\`);
  }

  const data = await res.json();
  return data.response;
}
// ===== END FLOWCOMMANDER RUNTIME =====

`;
}
