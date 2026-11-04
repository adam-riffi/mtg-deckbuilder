import { getCardDetail, getDb } from "@mtg/db";
import { notFound } from "next/navigation";
import { CardDetailView } from "@/components/card/card-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await getCardDetail(getDb(), id) : null;
  return { title: d?.card.name ?? "Card" };
}

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getCardDetail(getDb(), id);
  if (!d) notFound();
  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">{d.card.name}</h1>
      <CardDetailView id={id} />
    </main>
  );
}
