"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorBox, Field, Input } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error);
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6">
        <h1 className="text-xl font-semibold text-ink">Go CRM</h1>
        <p className="mb-6 text-sm text-ink-2">Go Car Rentals & Go Campers · Reykjavík</p>
        <div className="space-y-3">
          <Field label="E-mail">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error ? <ErrorBox error={error} /> : null}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </form>
    </div>
  );
}
