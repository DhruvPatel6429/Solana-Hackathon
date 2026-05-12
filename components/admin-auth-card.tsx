"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/client";
import { api } from "@/lib/api";

export function AdminAuthCard({
  companyName,
  planTier,
  onAuthenticated,
}: {
  companyName?: string;
  planTier?: string;
  onAuthenticated?: () => void;
}) {
  const auth = useAuthSession();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notifiedSession = useRef(false);
  const ensuringMembership = useRef(false);

  useEffect(() => {
    if (auth.loading) {
      return;
    }

    if (!auth.isAuthenticated) {
      notifiedSession.current = false;
      return;
    }

    if (auth.isAuthenticated && !notifiedSession.current && !ensuringMembership.current) {
      ensuringMembership.current = true;
      api.signup({
        companyName: companyName?.trim() || "Borderless Payroll Company",
        planTier: planTier?.trim() || "Growth",
      }).then(() => {
        notifiedSession.current = true;
        setError(null);
        onAuthenticated?.();
      }).catch((membershipError) => {
        setError(membershipError instanceof Error ? membershipError.message : "Unable to link company membership.");
      }).finally(() => {
        ensuringMembership.current = false;
      });
    }
  }, [auth.isAuthenticated, auth.loading, companyName, onAuthenticated, planTier]);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const session =
        mode === "signup"
          ? await auth.signUp({ email, password, metadata: { role: "admin" } })
          : await auth.signIn({ email, password });

      if (!session?.access_token) {
        setMessage("Check your email to confirm the account, then sign in.");
        return;
      }

      await api.signup({
        companyName: companyName?.trim() || "Borderless Payroll Company",
        planTier: planTier?.trim() || "Growth",
      });
      setMessage(mode === "signup" ? "Admin account created and linked." : "Signed in successfully.");
      onAuthenticated?.();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    setLoading(true);
    try {
      await auth.signOut();
      setMessage("Signed out.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-4 border border-white/10 bg-zinc-900 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="metric-label">Admin session</p>
          <h3 className="mt-2 text-xl font-semibold">Authenticate this browser</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Protected onboarding, contractor, invoice, treasury, and webhook screens require a real Supabase admin session.
          </p>
        </div>
        {auth.isAuthenticated ? <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">Authenticated</span> : null}
      </div>

      {!auth.isAuthenticated ? (
        <>
          <div className="flex gap-2 text-sm">
            <Button variant={mode === "signup" ? "secondary" : "ghost"} onClick={() => setMode("signup")}>
              Create Admin
            </Button>
            <Button variant={mode === "signin" ? "secondary" : "ghost"} onClick={() => setMode("signin")}>
              Sign In
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Admin email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Input placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <Button onClick={() => handleSubmit()} disabled={loading || !email.trim() || password.length < 6}>
            {loading ? "Working..." : mode === "signup" ? "Create admin account" : "Sign in"}
          </Button>
        </>
      ) : (
        <Button variant="ghost" onClick={() => handleSignOut()} disabled={loading}>
          {loading ? "Signing out..." : "Sign out"}
        </Button>
      )}

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </Card>
  );
}
