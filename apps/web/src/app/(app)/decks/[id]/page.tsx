import { DeckEditor } from "@/components/deck/deck-editor";

export const metadata = { title: "Deck" };

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DeckEditor deckId={id} />;
}
