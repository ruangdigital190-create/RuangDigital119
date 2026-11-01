(function () {
  "use strict";
  const money = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const client = () => window.rdSupabase;

  async function syncCatalog() {
    if (!window.rdBackendReady || !window.RD_PRODUCTS || !client()) return false;

    const baseSelect = "id,brand,title,group_name,category,tag,short_description,description,info,sort_order,product_variants(id,name,price,original_price,discount_enabled,stock_status,note,sort_order,is_active)";
    let result = await client().from("products")
      .select("id,brand,title,group_name,category,tag,short_description,description,info,image_url,sort_order,product_variants(id,name,price,original_price,discount_enabled,stock_status,note,sort_order,is_active)")
      .eq("is_active", true)
      .eq("product_variants.is_active", true)
      .order("sort_order", { ascending: true })
      .order("sort_order", { ascending: true, foreignTable: "product_variants" });

    // Existing deployments can continue to display the embedded logos until the image migration is run.
    if (result.error && /image_url|column/i.test(result.error.message || "")) {
      result = await client().from("products")
        .select(baseSelect)
        .eq("is_active", true)
        .eq("product_variants.is_active", true)
        .order("sort_order", { ascending: true })
        .order("sort_order", { ascending: true, foreignTable: "product_variants" });
    }
    const { data, error } = result;
    if (error) { console.warn("Catalog database sync failed; static catalog remains active.", error); return false; }
    if (!Array.isArray(data) || !data.length) return false;

    const logos = window.RD_LOGOS || {};
    const mapped = data.map(product => ({
      id: product.id,
      brand: product.brand,
      title: product.title,
      group: product.group_name,
      category: product.category,
      tag: product.tag,
      logo: product.image_url || logos[product.id] || logos.brand || "",
      fallback: logos[product.id] || logos.brand || "",
      short: product.short_description || "",
      description: product.description || "",
      info: product.info || "",
      variants: (product.product_variants || []).map(variant => ({
        id: variant.id,
        backendVariantId: variant.id,
        name: variant.name,
        price: variant.price,
        originalPrice: variant.original_price,
        discountEnabled: variant.discount_enabled,
        stock: variant.stock_status,
        note: variant.note || ""
      }))
    }));
    if (!mapped.length) return false;
    window.RD_PRODUCTS.splice(0, window.RD_PRODUCTS.length, ...mapped);
    window.RD_REFRESH_CATALOG?.();
    console.info(`RUANGDIGITAL190: ${mapped.length} produk berhasil disinkronkan dari database.`);
    return true;
  }


  // Live catalog: edits made in the admin dashboard refresh visitors' open pages.
  let catalogChannel = null;
  let catalogRefreshTimer = null;
  let catalogSyncRunning = false;
  let catalogSyncQueued = false;

  function scheduleCatalogRefresh() {
    if (catalogRefreshTimer) window.clearTimeout(catalogRefreshTimer);
    catalogRefreshTimer = window.setTimeout(async () => {
      catalogRefreshTimer = null;
      if (catalogSyncRunning) {
        catalogSyncQueued = true;
        return;
      }
      catalogSyncRunning = true;
      try {
        await syncCatalog();
      } catch (error) {
        console.warn("RUANGDIGITAL190 live catalog refresh failed:", error);
      } finally {
        catalogSyncRunning = false;
        if (catalogSyncQueued) {
          catalogSyncQueued = false;
          scheduleCatalogRefresh();
        }
      }
    }, 280);
  }

  function subscribeCatalogChanges() {
    if (!window.rdBackendReady || !client() || catalogChannel) return false;
    catalogChannel = client().channel("rd190-public-catalog-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, scheduleCatalogRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_variants" }, scheduleCatalogRefresh)
      .subscribe(status => {
        if (status === "SUBSCRIBED") console.info("RUANGDIGITAL190: live catalog subscription active.");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("RUANGDIGITAL190: live catalog subscription status:", status);
        }
      });
    return true;
  }

  window.addEventListener("beforeunload", () => {
    if (catalogChannel && client()) client().removeChannel(catalogChannel);
  });

  async function createOrder({ name, phone, email, note, items }) {
    if (!window.rdBackendReady) throw new Error("Backend belum aktif.");
    const { data, error } = await client().rpc("create_store_order", {
      p_customer_name: name, p_whatsapp: phone, p_email: email || null,
      p_note: note || null, p_items: items
    });
    if (error) throw error;
    return data;
  }

  async function loadOrders() {
    if (!window.rdBackendReady) return [];
    const { data: { session } } = await client().auth.getSession();
    if (!session) return [];
    const { data, error } = await client().from("orders")
      .select("id,order_number,created_at,status,payment_status,total_amount,requires_quote,order_items(product_title,variant_name,quantity,unit_price,subtotal)")
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    const box = document.getElementById("orderHistoryList");
    if (box && data) {
      const localOrders = JSON.parse(localStorage.getItem("rd190-commerce-orders-v1") || "[]");
      const onlineHtml = data.map(order => {
        const lines = (order.order_items || []).map(item => `${esc(item.product_title)} — ${esc(item.variant_name)} × ${item.quantity}`).join("<br>");
        const canPay = order.status === "awaiting_payment" && ["unpaid", "failed"].includes(order.payment_status) && !order.requires_quote && Number(order.total_amount) > 0;
        return `<article class="order-card"><div class="order-card-top"><div><strong>${esc(order.order_number)}</strong><br><small>${new Date(order.created_at).toLocaleString("id-ID")}</small></div><span class="status-pill">${esc(order.status)}</span></div><p>${lines}<br><strong>Total: ${order.requires_quote ? "Konfirmasi admin" : money(order.total_amount)}</strong><br>Pembayaran: ${esc(order.payment_status)}</p><div class="online-order-actions">${canPay ? `<button class="btn btn-primary btn-sm" type="button" data-pay-order="${esc(order.order_number)}">Bayar QRIS</button>` : ""}<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${whatsappLink(`Halo Admin RUANGDIGITAL190, saya ingin menanyakan pesanan ${order.order_number}. Mohon bantu cek statusnya.`)}">Tanya Admin</a></div></article>`;
      }).join("");
      const localHtml = localOrders.filter(order => !data.some(item => item.order_number === order.invoice)).map(order => `<article class="order-card"><div class="order-card-top"><div><strong>${esc(order.invoice)}</strong><br><small>${new Date(order.createdAt).toLocaleString("id-ID")}</small></div><span class="status-pill">Lokal</span></div><p>Invoice ini tersimpan di perangkat saat checkout tamu.</p></article>`).join("");
      box.innerHTML = (onlineHtml || "") + (localHtml || "") || `<div class="cart-empty">Belum ada pesanan pada akun ini.</div>`;
    }
    return data || [];
  }

  function whatsappLink(message) {
    const number = window.RD_CONFIG?.whatsappNumber || window.RD_STORE_CONFIG?.whatsappNumber || "6285725423328";
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  }

  async function createQrisPayment(orderNumber) {
    const { data, error } = await client().functions.invoke("create-qris-payment", { body: { order_number: orderNumber } });
    if (error || !data?.qr_code_url) throw new Error("QRIS belum tersedia. Pastikan Edge Function dan MIDTRANS_SERVER_KEY telah dikonfigurasi.");
    const modal = document.getElementById("paymentModal");
    document.getElementById("paymentOrderNumber").textContent = data.order_number;
    document.getElementById("paymentAmount").textContent = money(data.amount);
    document.getElementById("paymentQrImage").src = data.qr_code_url;
    document.getElementById("paymentExpiry").textContent = data.expires_at ? `Berlaku sampai ${new Date(data.expires_at).toLocaleString("id-ID")}` : "Selesaikan pembayaran sebelum kedaluwarsa.";
    modal.classList.add("show"); modal.setAttribute("aria-hidden", "false"); document.body.classList.add("modal-open");
    return data;
  }

  async function submitSupport({ type, invoice, contact, product, detail }) {
    const table = type === "refund" ? "refund_requests" : "warranty_claims";
    const payload = type === "refund" ? {
      order_number: invoice, customer_contact: contact, product_details: product || null, reason: detail
    } : {
      order_number: invoice, customer_contact: contact, product_details: product || null, issue_description: detail
    };
    const { data, error } = await client().from(table).insert(payload).select("id,status,created_at").single();
    if (error) throw error;
    return data;
  }

  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-pay-order]");
    if (button) {
      button.disabled = true; button.textContent = "Membuat QRIS…";
      try { await createQrisPayment(button.dataset.payOrder); }
      catch (error) { window.toast?.(error.message || "QRIS belum dapat dibuat.", true); button.disabled = false; button.textContent = "Bayar QRIS"; }
    }
  });
  document.getElementById("paymentClose")?.addEventListener("click", () => {
    const modal = document.getElementById("paymentModal"); modal.classList.remove("show"); modal.setAttribute("aria-hidden", "true"); document.body.classList.toggle("modal-open", Boolean(document.querySelector(".feature-modal.show, #cartOverlay.show, #productModal.show")));
  });
  document.getElementById("paymentRefresh")?.addEventListener("click", async () => {
    try { await loadOrders(); window.toast?.("Status diperbarui. Pembayaran hanya berubah setelah webhook gateway memverifikasi transaksi."); }
    catch (error) { window.toast?.("Belum dapat memeriksa status pembayaran.", true); }
  });

  window.RDStoreBackend = {
    get ready() { return Boolean(window.rdBackendReady); },
    syncCatalog, subscribeCatalogChanges, createOrder, loadOrders, createQrisPayment, submitSupport
  };
  if (window.rdBackendReady) {
    syncCatalog()
      .catch(error => console.warn("Initial catalog sync failed:", error))
      .finally(() => subscribeCatalogChanges());
  }
})();
