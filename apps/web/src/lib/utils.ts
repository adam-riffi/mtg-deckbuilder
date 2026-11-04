import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(v: number | null | undefined, currency: "eur" | "usd"): string {
  if (v == null) return "—";
  return new Intl.NumberFormat(currency === "eur" ? "de-DE" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(v);
}

export function formatCost(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
}
