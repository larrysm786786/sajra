// Supabase Edge Function: sajra-chat
// Set GROQ_API_KEY as a Supabase function secret before deployment. (GROK_API_KEY is accepted temporarily for compatibility.)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
type Message = { role: "user" | "assistant"; content: string };
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  const apiKey = Deno.env.get("GROQ_API_KEY") ?? Deno.env.get("GROK_API_KEY");
  if (!apiKey) return reply({ error: "Groq API is not configured. Add GROQ_API_KEY to Supabase secrets." }, 503);
  try {
    const body = await req.json();
    if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 12) return reply({ error: "Invalid conversation." }, 400);
    const messages: Message[] = [];
    for (const item of body.messages) {
      if (!item || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string" || !item.content.trim() || item.content.length > 4000) return reply({ error: "Invalid message." }, 400);
      messages.push({ role: item.role, content: item.content.trim() });
    }
    if (messages[messages.length - 1].role !== "user") return reply({ error: "A user message is required." }, 400);
    const appName = typeof body.appName === "string" ? body.appName.slice(0, 80) : "Sajra";
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-oss-120b", temperature: 0.7, max_completion_tokens: 700, messages: [
        { role: "system", content: `You are ${appName} AI, a warm, helpful family-tree guide for the Sajra website. Answer in the language the visitor uses (including Roman Urdu). Help explain how to explore and search a family tree, find people, and use Sajra. You do not have access to the site's private family records or live database, so never invent names, relationships, or facts. Ask visitors to use the tree search when they want details about a specific person. Be concise, respectful, and do not request sensitive personal information.` }, ...messages
      ] })
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Groq API error", response.status, detail.slice(0, 500));
      let providerDetail = "";
      try {
        const parsed = JSON.parse(detail);
        const rawDetail = parsed?.error?.message ?? parsed?.error ?? parsed?.message;
        if (typeof rawDetail === "string") providerDetail = rawDetail.slice(0, 240);
      } catch { /* Keep provider details out of the response. */ }
      const keyRejected = /incorrect api key|invalid api key|invalid authentication/i.test(providerDetail);
      const message = keyRejected || response.status === 401
        ? "GROQ_API_KEY is not valid. Create an active Groq API key at console.groq.com and update the Supabase secret."
        : response.status === 403
          ? "Groq denied API access. Check the Groq account, model access, and available credits."
          : response.status === 429
            ? "Chat abhi busy hai ya Groq API quota khatam hai. Thodi der baad dobara koshish karein."
            : `Groq API request failed (HTTP ${response.status}). Check the Groq API settings and try again.`;
      return reply({ error: message }, response.status === 429 ? 429 : 502);
    }
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return reply({ error: "Groq returned an empty response." }, 502);
    return reply({ reply: content.trim() });
  } catch (error) { console.error("sajra-chat error", error); return reply({ error: "Chat request process nahin ho saki." }, 500); }
});
