"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    const res =
      mode === "login"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({
            email,
            password,
            name: String(f.get("name") || email.split("@")[0]),
          });
    setPending(false);
    if (res.error) setError(res.error.message ?? "Something went wrong");
    else {
      router.push("/decks");
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-card p-6 shadow-lg"
      >
        <div>
          <h1 className="text-xl font-semibold">{mode === "login" ? "Sign in" : "Create account"}</h1>
          <p className="text-sm text-muted-foreground">Local account stored in your own database.</p>
        </div>
        {mode === "register" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" autoComplete="name" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              No account?{" "}
              <Link className="text-primary underline" href="/register">
                Create one
              </Link>
            </>
          ) : (
            <>
              Have an account?{" "}
              <Link className="text-primary underline" href="/login">
                Sign in
              </Link>
            </>
          )}
        </p>
        <p className="text-center text-xs text-muted-foreground">
          Card data and images from{" "}
          <a className="underline" href="https://scryfall.com">
            Scryfall
          </a>
          .
        </p>
      </form>
    </main>
  );
}
