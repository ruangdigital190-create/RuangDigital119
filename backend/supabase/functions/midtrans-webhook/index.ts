import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY")!;
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
async function sha512(value: string) {
  const digest = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const payload = await req.json();
    const orderId = String(payload.order_id || "");
    const statusCode = String(payload.status_code || "");
    const grossAmount = String(payload.gross_amount || "");
    const signatureKey = String(payload.signature_key || "");
    const expected = await sha512(`${orderId}${statusCode}${grossAmount}${MIDTRANS_SERVER_KEY}`);
    if (!MIDTRANS_SERVER_KEY || expected.toLowerCase() !== signatureKey.toLowerCase()) return json({ error: "Invalid signature" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: payment, error: paymentError } = await admin.from("payments").select("id,order_id,amount,status").eq("provider_order_id", orderId).maybeSingle();
    if (paymentError || !payment) return json({ error: "Payment not found" }, 404);
    if (Number(grossAmount) !== Number(payment.amount)) return json({ error: "Amount mismatch" }, 400);

    const tx = String(payload.transaction_status || "").toLowerCase();
    const fraud = String(payload.fraud_status || "accept").toLowerCase();
    let status = "pending";
    if (tx === "settlement" || (tx === "capture" && fraud === "accept")) status = "paid";
    else if (tx === "expire") status = "expired";
    else if (tx === "deny" || tx === "cancel") status = "failed";

    const update = { status, provider_transaction_id: payload.transaction_id || null, raw_response: payload, paid_at: status === "paid" ? new Date().toISOString() : null };
    const { error: updateError } = await admin.from("payments").update(update).eq("id", payment.id);
    if (updateError) throw updateError;
    const orderUpdate: Record<string, unknown> = { payment_status: status };
    if (status === "paid") orderUpdate.status = "processing";
    if (status === "failed" || status === "expired") orderUpdate.status = "awaiting_payment";
    await admin.from("orders").update(orderUpdate).eq("id", payment.order_id);
    if (status === "paid") {
      const { data: order } = await admin.from("orders").select("user_id,order_number").eq("id", payment.order_id).maybeSingle();
      if (order) await admin.from("notifications").insert({ user_id: order.user_id, title: "Pembayaran berhasil", body: `Pembayaran pesanan ${order.order_number} telah terverifikasi.`, link: "orders" });
    }
    return json({ received: true, status });
  } catch (error) {
    console.error("midtrans-webhook failed", error);
    return json({ error: "Webhook processing failed" }, 500);
  }
});
