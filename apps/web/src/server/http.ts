import "server-only";
import { type Db, getDb, NotFoundError } from "@mtg/db";
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { getUser, type SessionUser } from "./session";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (args: { req: Request; user: SessionUser; db: Db; params: P }) => Promise<unknown>;

/** Wraps a route handler: auth, JSON response, and uniform error mapping. */
export function route<P = Record<string, string>>(handler: Handler<P>, opts: { public?: boolean } = {}) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const user = await getUser();
      if (!user && !opts.public) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
      const params = ctx?.params ? await ctx.params : ({} as P);
      const out = await handler({ req, user: user ?? { id: "", name: "", email: "" }, db: getDb(), params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ZodError)
        return NextResponse.json({ error: "Invalid request", issues: e.issues }, { status: 400 });
      if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  return schema.parse(json);
}

export function searchParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}
