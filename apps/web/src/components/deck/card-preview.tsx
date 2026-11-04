"use client";

import type { Card, ImageUris, Printing } from "@mtg/mtg";
import { CardImage } from "@/components/card/card-image";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/primitives";

/** Large card image on hover (used by text/table views and the primer). */
export function CardHoverPreview({
  card,
  printing,
  image,
  faceImages,
  children,
}: {
  card: Pick<Card, "name">;
  printing?: Printing | null;
  image?: ImageUris | null;
  faceImages?: (ImageUris | null)[];
  children: React.ReactNode;
}) {
  const img = printing?.imageUris ?? image ?? null;
  const faces = printing?.faceImageUris ?? faceImages ?? [];
  return (
    <HoverCard openDelay={250} closeDelay={50}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="pointer-events-none w-60">
        <CardImage image={img} faceImages={faces} name={card.name} lazy={false} className="shadow-2xl" />
      </HoverCardContent>
    </HoverCard>
  );
}
