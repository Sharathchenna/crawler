// Shared Shiki highlighter for the Workers runtime.
//
// Shiki's default Oniguruma engine compiles WebAssembly at runtime, which
// workerd disallows — so this uses the pure-JS RegExp engine
// (createJavaScriptRegexEngine, forgiving mode) with statically imported
// grammars (dynamic import() specifiers don't bundle for Workers).
// One lazy singleton: grammar loading happens on first highlight, and the
// instance is safe for concurrent requests.
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import githubLight from "@shikijs/themes/github-light";
import githubDark from "@shikijs/themes/github-dark";
import python from "@shikijs/langs/python";
import javascript from "@shikijs/langs/javascript";
import typescript from "@shikijs/langs/typescript";
import tsx from "@shikijs/langs/tsx";
import jsx from "@shikijs/langs/jsx";
import shellscript from "@shikijs/langs/shellscript";
import json from "@shikijs/langs/json";
import jsonc from "@shikijs/langs/jsonc";
import yaml from "@shikijs/langs/yaml";
import toml from "@shikijs/langs/toml";
import sql from "@shikijs/langs/sql";
import html from "@shikijs/langs/html";
import css from "@shikijs/langs/css";
import markdown from "@shikijs/langs/markdown";
import diff from "@shikijs/langs/diff";
import docker from "@shikijs/langs/docker";
import go from "@shikijs/langs/go";
import rust from "@shikijs/langs/rust";
import java from "@shikijs/langs/java";
import c from "@shikijs/langs/c";
import cpp from "@shikijs/langs/cpp";
import csharp from "@shikijs/langs/csharp";
import php from "@shikijs/langs/php";
import ruby from "@shikijs/langs/ruby";
import swift from "@shikijs/langs/swift";
import kotlin from "@shikijs/langs/kotlin";
import lua from "@shikijs/langs/lua";
import xml from "@shikijs/langs/xml";
import ini from "@shikijs/langs/ini";
import powershell from "@shikijs/langs/powershell";
import http from "@shikijs/langs/http";
import makefile from "@shikijs/langs/makefile";
import nginx from "@shikijs/langs/nginx";

export const SHIKI_LANGS = [
  python, javascript, typescript, tsx, jsx, shellscript, json, jsonc,
  yaml, toml, sql, html, css, markdown, diff, docker, go, rust, java,
  c, cpp, csharp, php, ruby, swift, kotlin, lua, xml, ini,
  powershell, http, makefile, nginx,
];

export const SHIKI_THEMES = { light: "github-light", dark: "github-dark" } as const;

let highlighterPromise: Promise<HighlighterCore> | null = null;

export function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [githubLight, githubDark],
      langs: SHIKI_LANGS,
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  }
  return highlighterPromise;
}
