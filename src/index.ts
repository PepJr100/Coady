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
const prompt = await rl.question("You: ");
rl.close();

const response = await client.chat.completions.create({
  model,
  messages: [{ role: "user", content: prompt }],
});

console.log(`Assistant: ${response.choices[0].message.content}`);
