import type { SourceKind } from "../../shared/types";

export type FetchJob = {
  url: string;
  discoveredVia: string;
  sourceKind: SourceKind;
  depth: number;
};
