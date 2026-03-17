// Cloudflare Worker for Temp Mail (Nebula Mail)
// Handles incoming emails and provides a simple API

export default {
  async email(message, env, ctx) {
    const id = crypto.randomUUID();
    const email = {
      id,
      from: message.from,
      to: message.to,
      subject: message.headers.get("subject") || "(No Subject)",
      date: new Date().toISOString(),
      raw: "",
      html: "",
      text: ""
    };

    // Parse the email body
    const reader = message.raw.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      email.raw += decoder.decode(value);
    }

    // Basic extraction (In a real scenario, use an email parsing library like postal-mime)
    // For simplicity, we'll store the raw content and basic metadata
    email.text = "Nội dung email thô (Xem trong Raw): \n" + email.raw.substring(0, 1000);

    // Filter which address to save (e.g., only for mail.dagtridev.site)
    const recipient = message.to.toLowerCase();
    
    // Store in KV (Key: recipient_timestamp_id)
    // We use a prefix for easy listing
    const key = `mail:${recipient}:${Date.now()}:${id}`;
    await env.MAIL_KV.put(key, JSON.stringify(email), { expirationTtl: 3600 * 24 }); // Expire in 24h
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Endpoint: /messages?email=user@mail.dagtridev.site
    if (url.pathname === "/messages") {
      const targetEmail = url.searchParams.get("email");
      if (!targetEmail) return new Response("Missing email", { status: 400 });

      const list = await env.MAIL_KV.list({ prefix: `mail:${targetEmail.toLowerCase()}:` });
      const messages = [];

      for (const key of list.keys) {
        const val = await env.MAIL_KV.get(key.name);
        if (val) messages.push(JSON.parse(val));
      }

      // Sort by date descending
      messages.sort((a, b) => new Date(b.date) - new Date(a.date));

      return new Response(JSON.stringify(messages), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response("Nebula Mail API is running!", { headers: corsHeaders });
  }
};
