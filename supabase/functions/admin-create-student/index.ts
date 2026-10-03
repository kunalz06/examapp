import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() => new Response(
  JSON.stringify({ error: "Student creation has moved to the application server." }),
  {
    status: 410,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  },
));
