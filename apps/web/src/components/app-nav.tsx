"use client";

import { BookOpen, Library, LogOut, Search, Settings, Swords } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CommandPalette } from "@/components/command-palette";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Kbd,
} from "@/components/ui/primitives";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/decks", label: "Decks", icon: Swords },
  { href: "/search", label: "Cards", icon: Search },
  { href: "/collection", label: "Collection", icon: Library },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppNav({ user }: { user: { name: string; email: string } }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur">
      <Link href="/decks" className="mr-2 flex items-center gap-1.5 font-semibold">
        <BookOpen className="size-5 text-primary" aria-hidden />
        Deckbuilder
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
              path.startsWith(l.href) && "bg-accent text-foreground",
            )}
          >
            <l.icon className="size-4" aria-hidden />
            <span className="hidden sm:inline">{l.label}</span>
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <CommandPalette />
        <span className="hidden text-xs text-muted-foreground md:inline">
          <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Account menu">
              {user.name || user.email}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={async () => {
                await authClient.signOut();
                router.push("/login");
                router.refresh();
              }}
            >
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
