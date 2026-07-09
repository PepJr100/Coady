import OpenAI from "openai";
import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import { marked, type MarkedExtension } from "marked";
import { markedTerminal } from "marked-terminal";

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

while (true) {
  const prompt = await rl.question(`${chalk.cyan("You:")} `);
  messages.push({ role: "user", content: prompt });

  const response = await client.chat.completions.create({
    model,
    messages,
  });

  const reply = response.choices[0].message;
  console.log(chalk.green("Assistant:"));
  console.log(marked.parse(reply.content ?? ""));
  console.log(chalk.dim("─".repeat(40)));
  messages.push(reply);
}
