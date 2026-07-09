import OpenAI from "openai";
import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import { marked, type MarkedExtension } from "marked";
import { markedTerminal } from "marked-terminal";
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve, relative, join } from "node:path";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Set OPENROUTER_API_KEY to run Coady.");
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://openrouter.ai/api/v1",
});

const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b:free";

const rl = createInterface({ input: process.stdin, output: process.stdout });
// markedTerminal() is a valid extension at runtime; its @types are out of date.
marked.use(markedTerminal() as MarkedExtension);
rl.on("SIGINT", () => process.exit(0));
const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

function readFile(path: string): string {
  const full = resolve(process.cwd(), path);
  if (!full.startsWith(process.cwd())) {
    return `Error: ${path} is outside the project.`;
  }
  try {
    return readFileSync(full, "utf8");
  } catch (error) {
    return `Error reading ${path}: ${String(error)}`;
  }
}

function listFiles(dir: string): string {
  const full = resolve(process.cwd(), dir);
  if (!full.startsWith(process.cwd())) {
    return `Error: ${dir} is outside the project.`;
  }
  try {
    return readdirSync(full, { withFileTypes: true })
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      .join("\n");
  } catch (error) {
    return `Error listing ${dir}: ${String(error)}`;
  }
}

// Skip noise so search stays fast and readable.
const ignored = new Set(["node_modules", ".git"]);

function search(query: string): string {
  const matches: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = relative(process.cwd(), full);
      readFileSync(full, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (line.includes(query)) matches.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
  };
  walk(process.cwd());
  return matches.length ? matches.join("\n") : `No matches for "${query}".`;
}

const toolHandlers: Record<string, (args: any) => string> = {
  read_file: ({ path }) => readFile(path),
  list_files: ({ path }) => listFiles(path ?? "."),
  search: ({ query }) => search(query),
};

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file inside this project.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from the project root." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and folders inside a project directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative directory from the project root. Defaults to the root.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description: "Search project file contents for a text query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to search for." },
        },
        required: ["query"],
      },
    },
  },
];

function log(entry: string): void {
  appendFileSync("agent.log", `${new Date().toISOString()} ${entry}\n`);
}

async function callModel(useTools: boolean) {
  const toolNames = tools
    .map((t) => (t.type === "function" ? t.function.name : t.type))
    .join(", ");
  log(`[llm] request: ${messages.length} messages, tools: ${useTools ? toolNames : "none"}`);

  const response = await client.chat.completions.create({
    model,
    messages,
    tools: useTools ? tools : undefined,
  });
  const message = response.choices[0].message;

  const calls = message.tool_calls;
  if (calls?.length) {
    const parts = calls.map((c) =>
      c.type === "function"
        ? `${c.function.name}(${Object.values(JSON.parse(c.function.arguments)).join(", ")})`
        : c.type,
    );
    log(`[llm] response: tool_calls: ${parts.join(", ")}`);
  } else if (message.content?.trim()) {
    log(`[llm] response: assistant text: ${message.content.length} chars`);
  } else {
    log("[llm] response: empty");
  }

  return message;
}

const cactus = [
  "        ||",
  "    ||  ||",
  "    ||  ||  ||",
  "    ||  ||  ||",
  "    ||__||  ||",
  "        ||__||",
  "        ||",
  "        ||",
  "      __||__",
  "     |______|",
].join("\n");

console.log(chalk.green(cactus));
console.log(`  ${chalk.green.bold("Coady")}${chalk.dim(" — your terminal coding agent")}`);
console.log(chalk.dim(`  model: ${model}`));
console.log(chalk.dim("─".repeat(40)));

log(`[start] model: ${model}`);

while (true) {
  const prompt = await rl.question(`${chalk.cyan("You:")} `);
  messages.push({ role: "user", content: prompt });

  let message = await callModel(true);

  let rounds = 0;
  while (message.tool_calls?.length) {
    // Run this round's batch, in order.
    messages.push(message);
    for (const call of message.tool_calls) {
      if (call.type !== "function") continue;
      const args = JSON.parse(call.function.arguments);
      const label = `${call.function.name}(${Object.values(args).join(", ")})`;
      console.log(chalk.yellow(`Tool: ${label}`));
      const handler = toolHandlers[call.function.name];
      const result = handler ? handler(args) : `Error: unknown tool ${call.function.name}`;
      log(`[tool] ${label}: ${result.length} chars`);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
    rounds++;
    if (rounds >= 5) {
      console.log(chalk.red("(Reached the 5 tool-call round limit.)"));
      // Force a final answer with no tools so history has no dangling calls.
      message = await callModel(false);
      break;
    }
    // Offer tools again so the model can ask for another round.
    message = await callModel(true);
  }

  console.log(chalk.green("Coady:"));
  const text = message.content ?? "";
  console.log(text.trim() ? marked.parse(text) : chalk.dim("(The model returned no text.)"));
  console.log(chalk.dim("─".repeat(40)));
  messages.push(message);
}
