export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  return Response.json(
    {
      status: "ok",
      service: "seller-shield",
      scope: "process",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
