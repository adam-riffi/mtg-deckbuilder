import { AppNav } from "@/components/app-nav";
import { requirePageUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="flex min-h-screen flex-col">
      <AppNav user={user} />
      <div className="flex-1">{children}</div>
      <footer className="border-t px-4 py-2 text-xs text-muted-foreground">
        Card data and images courtesy of{" "}
        <a className="underline" href="https://scryfall.com" target="_blank" rel="noreferrer">
          Scryfall
        </a>
        . Magic: The Gathering is © Wizards of the Coast. This tool is unofficial Fan Content.
      </footer>
    </div>
  );
}
