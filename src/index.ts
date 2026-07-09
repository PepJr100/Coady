import OpenAI from "openai";
import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import { marked, type MarkedExtension } from "marked";
import { markedTerminal } from "marked-terminal";
import { readFileSync } from "node:fs";
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

while (true) {
  const prompt = await rl.question(`${chalk.cyan("You:")} `);
  messages.push({ role: "user", content: prompt });

  let response = await client.chat.completions.create({
    model,
    messages,
    tools,
  });
  let message = response.choices[0].message;

  const toolCall = message.tool_calls?.[0];
  if (toolCall?.type === "function") {
    // Keep only the first tool call; ignore any extras for this prompt.
    messages.push({ ...message, tool_calls: [toolCall] });
    const { path } = JSON.parse(toolCall.function.arguments);
    console.log(chalk.yellow(`Tool: read_file(${path})`));
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: readFile(path),
    });
    // Second call has no tools, so the model must answer with text.
    response = await client.chat.completions.create({ model, messages });
    message = response.choices[0].message;
  }

  console.log(chalk.green("Assistant:"));
  const text = message.content ?? "";
  console.log(text.trim() ? marked.parse(text) : chalk.dim("(The model returned no text.)"));
  console.log(chalk.dim("─".repeat(40)));
  messages.push(message);
}
