export type McpOption = { slug: string; name: string; hint: string };

// Single source of truth for MCP connect snippets — mirrored in the iOS app (port of buildConfig).
export const MCP_CLIENTS: McpOption[] = [
  { slug: "claude-code", name: "Claude Code", hint: "Run in terminal" },
  { slug: "codex", name: "Codex", hint: "Run in terminal" },
  { slug: "amp", name: "Amp", hint: "Run in terminal" },
  { slug: "cursor", name: "Cursor", hint: "Paste into mcp.json" },
  { slug: "jetbrains", name: "JetBrains", hint: "Paste into mcp.json" },
  { slug: "lmstudio", name: "LM Studio", hint: "Paste into config" },
  { slug: "trae", name: "Trae", hint: "Paste into config" },
  { slug: "boltai", name: "BoltAI", hint: "Paste into config" },
  { slug: "crush", name: "Crush", hint: "Paste into config" },
  { slug: "amazonq", name: "Amazon Q", hint: "Paste into config" },
  { slug: "kiro", name: "Kiro", hint: "Paste into config" },
  { slug: "vscode", name: "VS Code", hint: "Paste into mcp.json" },
  { slug: "copilot", name: "Copilot", hint: "Paste into mcp.json" },
  { slug: "windsurf", name: "Windsurf", hint: "Paste into config" },
  { slug: "antigravity", name: "Antigravity", hint: "Paste into config" },
  { slug: "cline", name: "Cline", hint: "Paste into config" },
  { slug: "kilo", name: "Kilo", hint: "Paste into config" },
  { slug: "roo", name: "Roo", hint: "Paste into config" },
  { slug: "gemini", name: "Gemini CLI", hint: "Paste into config" },
  { slug: "qwen", name: "Qwen", hint: "Paste into config" },
  { slug: "opencode", name: "OpenCode", hint: "Paste into config" },
  { slug: "claude-desktop", name: "Claude Desktop", hint: "Custom connector" },
];

export type McpConfigOut = { label: string; snippet: string; instruction: string };

export function buildConfig(slug: string, name: string, url: string): McpConfigOut {
  const n = name || "hoard";
  switch (slug) {
    case "claude-code":
      return {
        label: "Terminal command",
        snippet: `claude mcp add --transport http ${n} ${url}`,
        instruction: "Run in your terminal, then restart Claude Code.",
      };
    case "codex":
      return {
        label: "Terminal command",
        snippet: `codex mcp add ${n} --url ${url}`,
        instruction: "Run in your terminal, then restart Codex.",
      };
    case "amp":
      return {
        label: "Terminal command",
        snippet: `amp mcp add ${n} ${url}`,
        instruction: "Run in your terminal, then restart Amp.",
      };
    case "vscode":
    case "copilot":
      return {
        label: "mcp.json",
        snippet: JSON.stringify({ mcp: { servers: { [n]: { type: "http", url } } } }, null, 2),
        instruction: "Paste into your mcp.json inputs, then reload the window.",
      };
    case "windsurf":
    case "antigravity":
      return {
        label: "mcp_config.json",
        snippet: JSON.stringify({ mcpServers: { [n]: { serverUrl: url } } }, null, 2),
        instruction: "Paste into the MCP config file and restart the client.",
      };
    case "cline":
    case "kilo":
    case "roo":
      return {
        label: "mcp_settings.json",
        snippet: JSON.stringify({ mcpServers: { [n]: { type: "streamable-http", url } } }, null, 2),
        instruction: "Paste into MCP settings and enable the server.",
      };
    case "gemini":
    case "qwen":
      return {
        label: "settings.json",
        snippet: JSON.stringify({ mcpServers: { [n]: { httpUrl: url } } }, null, 2),
        instruction: "Paste into settings.json and restart the CLI.",
      };
    case "opencode":
      return {
        label: "opencode.json",
        snippet: JSON.stringify({ mcp: { [n]: { type: "remote", url, enabled: true } } }, null, 2),
        instruction: "Paste into opencode.json and restart OpenCode.",
      };
    case "claude-desktop":
      return {
        label: "Custom connector URL",
        snippet: url,
        instruction: "In Claude Desktop go to Settings → Connectors → add a custom connector with this URL.",
      };
    case "cursor":
    case "jetbrains":
    case "lmstudio":
    case "trae":
    case "boltai":
    case "crush":
    case "amazonq":
    case "kiro":
    default:
      return {
        label: "mcp.json",
        snippet: JSON.stringify({ mcpServers: { [n]: { url } } }, null, 2),
        instruction: "Paste into the client's MCP config and restart it.",
      };
  }
}
