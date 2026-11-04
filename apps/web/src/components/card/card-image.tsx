"use client";

import type { ImageUris } from "@mtg/mtg";
import { RotateCw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Card image straight from Scryfall's CDN — never cropped or altered (only rounded corners, like the physical card).
 * Double-faced cards get a flip button.
 */
export function CardImage({
  image,
  faceImages = [],
  name,
  size = "normal",
  className,
  lazy = true,
}: {
  image: ImageUris | null | undefined;
  faceImages?: (ImageUris | null)[];
  name: string;
  size?: "small" | "normal" | "large";
  className?: string;
  lazy?: boolean;
}) {
  const [face, setFace] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const faces = image ? [image] : faceImages.filter((f): f is ImageUris => !!f);
  const current = faces[face] ?? faces[0];
  const src = current?.[size] ?? current?.normal ?? current?.small;
  return (
    <div className={cn("group relative", className)}>
      {src && failed !== src ? (
        // biome-ignore lint/performance/noImgElement: Scryfall images must not be re-encoded
        <img
          src={src}
          alt={name}
          loading={lazy ? "lazy" : "eager"}
          className="card-img w-full bg-muted object-contain"
          draggable={false}
          onError={() => setFailed(src)}
        />
      ) : (
        <div className="card-img flex w-full items-center justify-center bg-muted p-2 text-center text-xs text-muted-foreground">
          {name}
        </div>
      )}
      {faces.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFace((f) => (f + 1) % faces.length);
          }}
          className="absolute top-1/3 right-1 rounded-full bg-black/70 p-1.5 text-white opacity-80 hover:opacity-100"
          aria-label={`Flip ${name}`}
        >
          <RotateCw className="size-3.5" />
        </button>
      )}
    </div>
  );
}
