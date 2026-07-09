import OpenAI from "openai";
import { createInterface } from "node:readline/promises";

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
rl.on("SIGINT", () => process.exit(0));
const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

while (true) {
  const prompt = await rl.question("You: ");
  messages.push({ role: "user", content: prompt });

 const response = await client.chat.completions.create({
    model,
    messages,
  });

  const reply = response.choices[0].message;
  messages.push(reply);
  console.log(`Assistant: ${reply.content}`);
}
