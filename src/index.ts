import OpenAI from "openai";
import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import { marked, type MarkedExtension } from "marked";
import { markedTerminal } from "marked-terminal";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
      c.type === "function" ? `${c.function.name}(${JSON.parse(c.function.arguments).path})` : c.type,
    );
    log(`[llm] response: tool_calls: ${parts.join(", ")}`);
  } else if (message.content?.trim()) {
    log(`[llm] response: assistant text: ${message.content.length} chars`);
  } else {
    log("[llm] response: empty");
  }

  return message;
}

log(`[start] model: ${model}`);

while (true) {
  const prompt = await rl.question(`${chalk.cyan("You:")} `);
  messages.push({ role: "user", content: prompt });

  let message = await callModel(true);

  const toolCall = message.tool_calls?.[0];
  if (toolCall?.type === "function") {
    // Keep only the first tool call; ignore any extras for this prompt.
    messages.push({ ...message, tool_calls: [toolCall] });
    const { path } = JSON.parse(toolCall.function.arguments);
    console.log(chalk.yellow(`Tool: read_file(${path})`));
    const result = readFile(path);
    log(`[tool] read_file(${path}): ${result.length} chars`);
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: result,
    });
    // Second call has no tools, so the model must answer with text.
    message = await callModel(false);
  }

  console.log(chalk.green("Coady:"));
  const text = message.content ?? "";
  console.log(text.trim() ? marked.parse(text) : chalk.dim("(The model returned no text.)"));
  console.log(chalk.dim("─".repeat(40)));
  messages.push(message);
}
