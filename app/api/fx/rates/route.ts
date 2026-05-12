import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 300;

type FxRate = {
  pair: string;
  rate: number;
  updatedAt: string;
};

type FxResponse = {
  base: string;
  rates: FxRate[];
  source: "live" | "cache" | "unavailable";
  updatedAt: string;
  error?: string;
};

type CacheEntry = {
  response: FxResponse;
  cachedAt: number;
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const FX_CACHE_KEY = "default";
const SUPPORTED_QUOTES = ["EUR", "GBP", "INR", "BRL", "CAD"] as const;

const cache = new Map<string, CacheEntry>();

function getCachedResponse(): FxResponse | null {
  const entry = cache.get(FX_CACHE_KEY);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    return null;
  }

  return entry.response;
}

function setCachedResponse(response: FxResponse) {
  cache.set(FX_CACHE_KEY, { response, cachedAt: Date.now() });
}

function toFxResponse(base: string, quotes: Record<string, number>, updatedAt: string, source: FxResponse["source"]): FxResponse {
  return {
    base,
    rates: SUPPORTED_QUOTES.map((quote) => ({
      pair: `${base}/${quote}`,
      rate: Number(quotes[quote] ?? 0),
      updatedAt,
    })),
    source,
    updatedAt,
  };
}

async function fetchLiveRates(base: string): Promise<FxResponse> {
  const quotes = SUPPORTED_QUOTES.join(",");
  const response = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${quotes}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FX provider returned ${response.status}.`);
  }

  const payload = (await response.json()) as { base?: string; rates?: Record<string, number>; date?: string };
  const resolvedBase = (payload.base ?? base).toUpperCase();
  const updatedAt = payload.date ? `${payload.date}T00:00:00.000Z` : new Date().toISOString();
  const rates = payload.rates ?? {};
  return toFxResponse(resolvedBase, rates, updatedAt, "live");
}

export async function GET() {
  const cached = getCachedResponse();
  if (cached) {
    return NextResponse.json({ ...cached, source: "cache" } satisfies FxResponse);
  }

  const base = (process.env.FX_BASE_CURRENCY ?? "USD").toUpperCase();

  try {
    const live = await fetchLiveRates(base);
    setCachedResponse(live);
    return NextResponse.json(live);
  } catch (error) {
    const fallback = getCachedResponse();
    if (fallback) {
      return NextResponse.json({
        ...fallback,
        source: "cache",
        error: error instanceof Error ? error.message : "FX provider unavailable.",
      } satisfies FxResponse);
    }

    return NextResponse.json(
      {
        base,
        rates: [],
        source: "unavailable",
        updatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "FX provider unavailable.",
      } satisfies FxResponse,
      { status: 200 },
    );
  }
}