import type { SourceKind } from "../../shared/types";

export type SearchQuery = {
  query: string;
  includeDomains?: string;
  sourceKind: SourceKind;
};

export const COMPANY_DOMAINS = [
  "stripe.com",
  "blog.cloudflare.com",
  "developers.cloudflare.com",
  "notion.com",
  "linear.app",
  "anthropic.com",
  "openai.com",
  "vercel.com",
  "github.blog",
  "netflixtechblog.com",
  "shopify.engineering",
  "figma.com",
  "intercom.com",
  "dropbox.tech",
];

export const ESSAY_DOMAINS = [
  "paulgraham.com",
  "jvns.ca",
  "danluu.com",
  "simonwillison.net",
  "macwright.com",
  "overreacted.io",
  "rachelbythebay.com",
  "nicholas.carlini.com",
];

export const SEARCH_QUERIES: SearchQuery[] = [
  {
    query: "engineering blog how we built",
    includeDomains: "blog.cloudflare.com,stripe.com,github.blog,vercel.com",
    sourceKind: "company_blog",
  },
  {
    query: "AI agents LLM infrastructure blog",
    includeDomains: "anthropic.com,openai.com,notion.com",
    sourceKind: "company_blog",
  },
  {
    query: "programming essay longform",
    includeDomains: "jvns.ca,simonwillison.net,danluu.com,overreacted.io",
    sourceKind: "essay",
  },
  {
    query: "startup product essay founder",
    sourceKind: "personal",
  },
  {
    query: "design engineering UX",
    includeDomains: "figma.com,linear.app,stripe.com",
    sourceKind: "company_blog",
  },
  {
    query: "Cloudflare Workers Durable Objects",
    includeDomains: "blog.cloudflare.com,developers.cloudflare.com",
    sourceKind: "company_blog",
  },
];

export function queriesForThisRun(): SearchQuery[] {
  return SEARCH_QUERIES;
}
