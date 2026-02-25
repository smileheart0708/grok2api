import type { ModelEffortTier } from "./models";

export type QuotaMetricKind = "queries" | "tokens" | "mixed" | "unknown";

export interface ParsedQuotaSnapshot {
  remaining_queries: number | null;
  total_queries: number | null;
  remaining_tokens: number | null;
  total_tokens: number | null;
  low_effort_cost: number | null;
  high_effort_cost: number | null;
  window_size_seconds: number | null;
  metric_kind: QuotaMetricKind;
}

interface EffortLimitEntry {
  cost: number | null;
  remaining_queries: number | null;
}

function toNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.floor(value);
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = toNonNegativeInteger(value);
  if (parsed === null || parsed <= 0) return null;
  return parsed;
}

function parseEffortEntry(payload: Record<string, unknown>, key: string): EffortLimitEntry {
  const value = payload[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { cost: null, remaining_queries: null };
  }
  const entry = value as Record<string, unknown>;
  return {
    cost: toPositiveInteger(entry["cost"]),
    remaining_queries: toNonNegativeInteger(entry["remainingQueries"]),
  };
}

function normalizeMetricKind(args: {
  hasQueries: boolean;
  hasTokens: boolean;
}): QuotaMetricKind {
  if (args.hasQueries && args.hasTokens) return "mixed";
  if (args.hasQueries) return "queries";
  if (args.hasTokens) return "tokens";
  return "unknown";
}

export function parseQuotaSnapshot(
  payload: Record<string, unknown> | null,
  effortTier: ModelEffortTier,
): ParsedQuotaSnapshot {
  if (!payload) {
    return {
      remaining_queries: null,
      total_queries: null,
      remaining_tokens: null,
      total_tokens: null,
      low_effort_cost: null,
      high_effort_cost: null,
      window_size_seconds: null,
      metric_kind: "unknown",
    };
  }

  const lowEffort = parseEffortEntry(payload, "lowEffortRateLimits");
  const highEffort = parseEffortEntry(payload, "highEffortRateLimits");

  const remainingTokens = toNonNegativeInteger(payload["remainingTokens"]);
  const totalTokens = toNonNegativeInteger(payload["totalTokens"]);
  const topRemainingQueries = toNonNegativeInteger(payload["remainingQueries"]);
  const totalQueries = toNonNegativeInteger(payload["totalQueries"]);
  const windowSizeSeconds = toNonNegativeInteger(payload["windowSizeSeconds"]);

  const preferredEffortRemaining =
    effortTier === "high" ? highEffort.remaining_queries : lowEffort.remaining_queries;
  const preferredEffortCost = effortTier === "high" ? highEffort.cost : lowEffort.cost;
  const fallbackCost = preferredEffortCost ?? 1;

  let normalizedRemainingQueries = preferredEffortRemaining ?? topRemainingQueries;
  if (normalizedRemainingQueries === null && remainingTokens !== null) {
    normalizedRemainingQueries = Math.floor(remainingTokens / Math.max(1, fallbackCost));
  }

  const metricKind = normalizeMetricKind({
    hasQueries:
      normalizedRemainingQueries !== null ||
      topRemainingQueries !== null ||
      lowEffort.remaining_queries !== null ||
      highEffort.remaining_queries !== null,
    hasTokens: remainingTokens !== null,
  });

  return {
    remaining_queries: normalizedRemainingQueries,
    total_queries: totalQueries,
    remaining_tokens: remainingTokens,
    total_tokens: totalTokens,
    low_effort_cost: lowEffort.cost,
    high_effort_cost: highEffort.cost,
    window_size_seconds: windowSizeSeconds,
    metric_kind: metricKind,
  };
}
