# Coady

Coady is a small coding agent I built from scratch to learn how coding agents actually work under the hood.

It is being built by following [Matt Wynne's coding-agent-tutorial](https://github.com/mattwynne/coding-agent-tutorial), one spec at a time. Each iteration adds a single capability, kept as small and clear as possible so the agent mechanics are easy to see. The specs I'm working through live in [`docs/specs`](docs/specs).

## Setup

Assume Node.js is installed.

```sh
npm install
```

Set your [OpenRouter](https://openrouter.ai/) API key and model:

```sh
export OPENROUTER_API_KEY=your-key
export OPENROUTER_MODEL='google/gemini-2.5-flash'
```

## Run

```sh
npm start
```

On start, Coady prints a small banner (cactus, name, and the active model) so you can see which model is in use.

![Coady running in the terminal](docs/Pics/Screenshot%202026-07-09%20140619.png)

## Tools

Beyond the tutorial's `read_file`, Coady can also explore the project:

- `read_file` — read a single project file.
- `list_files` — list the files and folders in a project directory.
- `search` — search project file contents for a text query.

All tools are sandboxed to the project directory. The agent can chain them across tool-call rounds — for example, `list_files` to discover a file, then `read_file` to open it.

## Credit

- Built by following [Matt Wynne's coding-agent-tutorial](https://github.com/mattwynne/coding-agent-tutorial).
- The tutorial was inspired by [simple-agent-demo](https://github.com/SDiamante13/simple-agent-demo).
