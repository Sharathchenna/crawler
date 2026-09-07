import Foundation

/// Port of web `buildConfig(slug, name, url)` — same snippets, copyable from the phone.
public enum MCPConfig {
  public struct Client: Identifiable, Hashable {
    public var id: String { slug }
    public var slug: String
    public var name: String
    public var hint: String
  }

  public static let clients: [Client] = [
    .init(slug: "claude-code", name: "Claude Code", hint: "Run in terminal"),
    .init(slug: "codex", name: "Codex", hint: "Run in terminal"),
    .init(slug: "amp", name: "Amp", hint: "Run in terminal"),
    .init(slug: "cursor", name: "Cursor", hint: "Paste into mcp.json"),
    .init(slug: "jetbrains", name: "JetBrains", hint: "Paste into mcp.json"),
    .init(slug: "lmstudio", name: "LM Studio", hint: "Paste into config"),
    .init(slug: "trae", name: "Trae", hint: "Paste into config"),
    .init(slug: "boltai", name: "BoltAI", hint: "Paste into config"),
    .init(slug: "crush", name: "Crush", hint: "Paste into config"),
    .init(slug: "amazonq", name: "Amazon Q", hint: "Paste into config"),
    .init(slug: "kiro", name: "Kiro", hint: "Paste into config"),
    .init(slug: "vscode", name: "VS Code", hint: "Paste into mcp.json"),
    .init(slug: "copilot", name: "Copilot", hint: "Paste into mcp.json"),
    .init(slug: "windsurf", name: "Windsurf", hint: "Paste into config"),
    .init(slug: "antigravity", name: "Antigravity", hint: "Paste into config"),
    .init(slug: "cline", name: "Cline", hint: "Paste into config"),
    .init(slug: "kilo", name: "Kilo", hint: "Paste into config"),
    .init(slug: "roo", name: "Roo", hint: "Paste into config"),
    .init(slug: "gemini", name: "Gemini CLI", hint: "Paste into config"),
    .init(slug: "qwen", name: "Qwen", hint: "Paste into config"),
    .init(slug: "opencode", name: "OpenCode", hint: "Paste into config"),
    .init(slug: "claude-desktop", name: "Claude Desktop", hint: "Custom connector"),
  ]

  public static func build(slug: String, name: String, url: String) -> (label: String, snippet: String, instruction: String) {
    let n = name.isEmpty ? "hoard" : name
    switch slug {
    case "claude-code":
      return ("Terminal command", "claude mcp add --transport http \(n) \(url)", "Run in your terminal, then restart Claude Code.")
    case "codex":
      return ("Terminal command", "codex mcp add \(n) --url \(url)", "Run in your terminal, then restart Codex.")
    case "amp":
      return ("Terminal command", "amp mcp add \(n) \(url)", "Run in your terminal, then restart Amp.")
    case "vscode", "copilot":
      return ("mcp.json", #"{"mcp":{"servers":{"\#(n)":{"type":"http","url":"\#(url)"}}}}"#, "Paste into your mcp.json inputs, then reload the window.")
    case "windsurf", "antigravity":
      return ("mcp_config.json", #"{"mcpServers":{"\#(n)":{"serverUrl":"\#(url)"}}}"#, "Paste into the MCP config file and restart the client.")
    case "cline", "kilo", "roo":
      return ("mcp_settings.json", #"{"mcpServers":{"\#(n)":{"type":"streamable-http","url":"\#(url)"}}}"#, "Paste into MCP settings and enable the server.")
    case "gemini", "qwen":
      return ("settings.json", #"{"mcpServers":{"\#(n)":{"httpUrl":"\#(url)"}}}"#, "Paste into settings.json and restart the CLI.")
    case "opencode":
      return ("opencode.json", #"{"mcp":{"\#(n)":{"type":"remote","url":"\#(url)","enabled":true}}}"#, "Paste into opencode.json and restart OpenCode.")
    case "claude-desktop":
      return ("Custom connector URL", url, "In Claude Desktop go to Settings → Connectors → add a custom connector with this URL.")
    default:
      return ("mcp.json", #"{"mcpServers":{"\#(n)":{"url":"\#(url)"}}}"#, "Paste into the client's MCP config and restart it.")
    }
  }
}
