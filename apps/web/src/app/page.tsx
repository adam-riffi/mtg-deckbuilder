import { redirect } from "next/navigation";
import { getUser } from "@/server/session";

export default async function Home() {
  redirect((await getUser()) ? "/decks" : "/login");
}
