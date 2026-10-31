import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY")!;
const MIDTRANS_IS_PRODUCTION = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_ORIGIN") || "https://ruangdigital190-create.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: corsHeaders }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  if (!MIDTRANS_SERVER_KEY) return response({ error: "Payment gateway is not configured" }, 503);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return response({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) return response({ error: "Unauthorized" }, 401);

    const { order_number } = await req.json();
    if (typeof order_number !== "string" || !/^RD\d{6}-[A-F0-9]{8}$/.test(order_number)) return response({ error: "Invalid order number" }, 400);
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: order, error: orderError } = await admin.from("orders").select("id,order_number,user_id,total_amount,requires_quote,payment_status,customer_name,email,whatsapp").eq("order_number", order_number).eq("user_id", user.id).maybeSingle();
    if (orderError || !order) return response({ error: "Order not found" }, 404);
    if (order.payment_status === "paid") return response({ error: "Order already paid" }, 409);
    if (order.status !== "awaiting_payment") return response({ error: "Order must be confirmed by admin before QRIS payment" }, 409);
    if (order.requires_quote || !order.total_amount || order.total_amount <= 0) return response({ error: "This order requires admin price confirmation" }, 409);

    const { data: existingPayment } = await admin.from("payments").select("status,qr_code_url,expires_at,amount").eq("order_id", order.id).maybeSingle();
    if (existingPayment?.status === "pending" && existingPayment.qr_code_url && (!existingPayment.expires_at || new Date(existingPayment.expires_at).getTime() > Date.now())) {
      return response({ order_number: order.order_number, amount: Number(existingPayment.amount), qr_code_url: existingPayment.qr_code_url, expires_at: existingPayment.expires_at, payment_status: "pending" });
    }
    if (existingPayment) return response({ error: "Payment session has expired or failed. Contact admin to issue a new invoice." }, 409);

    const baseUrl = MIDTRANS_IS_PRODUCTION ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
    const basic = btoa(`${MIDTRANS_SERVER_KEY}:`);
    const midtrans = await fetch(`${baseUrl}/v2/charge`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        payment_type: "qris",
        transaction_details: { order_id: order.order_number, gross_amount: Number(order.total_amount) },
        customer_details: { first_name: order.customer_name, email: order.email || undefined, phone: order.whatsapp },
        qris: { acquirer: "gopay" }
      })
    });
    const result = await midtrans.json();
    if (!midtrans.ok) { console.error("Midtrans charge error", result); return response({ error: "Payment gateway rejected the request" }, 502); }
    const qrAction = (result.actions || []).find((action: { name?: string }) => action.name === "generate-qr-code");
    if (!qrAction?.url) return response({ error: "QRIS image URL was not returned" }, 502);

    const expiresAt = result.expiry_time ? new Date(result.expiry_time).toISOString() : null;
    const { error: saveError } = await admin.from("payments").upsert({
      order_id: order.id, provider: "midtrans", provider_order_id: order.order_number,
      provider_transaction_id: result.transaction_id || null, payment_type: "qris",
      amount: Number(order.total_amount), status: "pending", qr_code_url: qrAction.url,
      expires_at: expiresAt, raw_response: result
    }, { onConflict: "order_id" });
    if (saveError) { console.error("Payment save failed", saveError); return response({ error: "Could not save payment session" }, 500); }
    await admin.from("orders").update({ payment_status: "pending", status: "awaiting_payment" }).eq("id", order.id);
    return response({ order_number: order.order_number, amount: Number(order.total_amount), qr_code_url: qrAction.url, expires_at: expiresAt, payment_status: "pending" });
  } catch (error) {
    console.error("create-qris-payment failed", error);
    return response({ error: "Could not create QRIS payment" }, 500);
  }
});
