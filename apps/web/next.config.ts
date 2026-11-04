import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@mtg/mtg", "@mtg/db", "@mtg/ai"],
  serverExternalPackages: ["pg", "@electric-sql/pglite", "@electric-sql/pglite-socket"],
  // Card images load directly from Scryfall's CDN with plain <img>; they are never re-encoded or cropped.
  images: { unoptimized: true },
};

export default config;
