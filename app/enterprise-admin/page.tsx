"use client";

import { useEffect, useState } from "react";

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

async function load(endpoint: string): Promise<JsonValue> {
  const response = await fetch(endpoint, { method: "GET", credentials: "include" });
  const text = await response.text();
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

export default function EnterpriseAdminPage() {
  const [metrics, setMetrics] = useState<JsonValue>(null);
  const [health, setHealth] = useState<JsonValue>(null);
  const [reconciliation, setReconciliation] = useState<JsonValue>(null);
  const [compliance, setCompliance] = useState<JsonValue>(null);
  const [apiKeys, setApiKeys] = useState<JsonValue>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, h, r, c, k] = await Promise.all([
        load("/api/admin/metrics"),
        load("/api/admin/system-health"),
        load("/api/admin/reconciliation-report"),
        load("/api/admin/compliance/alerts"),
        load("/api/api-keys"),
      ]);
      setMetrics(m);
      setHealth(h);
      setReconciliation(r);
      setCompliance(c);
      setApiKeys(k);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 text-slate-100">
      <header className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
        <h1 className="text-2xl font-semibold">Enterprise Administration Suite</h1>
        <p className="mt-2 text-sm text-slate-300">
          Operational controls for organizations, payout queues, compliance alerts, webhook replay, reconciliation, and API key governance.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh Controls"}
          </button>
          <a className="rounded-lg border border-slate-700 px-4 py-2 text-sm" href="/operations">
            Recovery Console
          </a>
          <a className="rounded-lg border border-slate-700 px-4 py-2 text-sm" href="/compliance">
            Audit Exports
          </a>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Panel title="System Health" data={health} />
        <Panel title="Metrics" data={metrics} />
        <Panel title="Reconciliation" data={reconciliation} />
        <Panel title="Compliance Alerts" data={compliance} />
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
        <h2 className="text-lg font-semibold">API Key Management</h2>
        <p className="mt-1 text-sm text-slate-300">
          Use `/api/api-keys` for issuance, rotation, revocation, and scoped partner credentials.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-200">
          {JSON.stringify(apiKeys, null, 2)}
        </pre>
      </section>
    </main>
  );
}

function Panel({ title, data }: { title: string; data: JsonValue }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-200">
        {JSON.stringify(data, null, 2)}
      </pre>
    </article>
  );
}
