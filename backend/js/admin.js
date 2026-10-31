(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const client = () => window.rdSupabase;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
  const dateText = value => value ? new Date(value).toLocaleString("id-ID") : "—";
  let usersCache = [], ordersCache = [], productsCache = [], refundsCache = [], warrantyCache = [];

  function notify(message, error = false) {
    const node = $("toast"); node.textContent = message; node.classList.remove("hidden");
    node.style.borderColor = error ? "rgba(255,119,141,.4)" : "rgba(82,228,223,.25)";
    window.setTimeout(() => node.classList.add("hidden"), 3600);
  }
  function showError(message) { const node = $("loginError"); node.textContent = message; node.classList.remove("hidden"); }
  function clearError() { $("loginError").classList.add("hidden"); }
  function setTab(name) {
    document.querySelectorAll(".tab").forEach(el => el.classList.toggle("active", el.id === `tab-${name}`));
    document.querySelectorAll("[data-admin-tab]").forEach(el => el.classList.toggle("active", el.dataset.adminTab === name));
  }
  function statusClass(value) {
    return ["paid", "completed", "approved", "available", "processing"].includes(value) ? "good" : ["failed", "expired", "cancelled", "rejected", "out_of_stock"].includes(value) ? "bad" : "";
  }
  const orderStatuses = ["awaiting_confirmation", "awaiting_payment", "processing", "completed", "cancelled", "failed", "refunded"];
  const requestStatuses = ["waiting_review", "processing", "approved", "rejected", "completed"];
  const labelStatus = value => ({ awaiting_confirmation: "Menunggu konfirmasi", awaiting_payment: "Menunggu pembayaran", processing: "Diproses", completed: "Selesai", cancelled: "Dibatalkan", failed: "Gagal", refunded: "Direfund", unpaid: "Belum dibayar", pending: "Menunggu", paid: "Lunas", expired: "Kedaluwarsa", waiting_review: "Menunggu pemeriksaan", approved: "Disetujui", rejected: "Ditolak", available: "Tersedia", limited: "Terbatas", out_of_stock: "Habis", confirm: "Konfirmasi admin" }[value] || value);

  async function requireAdmin() {
    if (!window.rdBackendReady) return false;
    const { data: { session } } = await client().auth.getSession();
    if (!session) return false;
    const profile = await window.RDAuth.getProfile();
    if (!profile || profile.role !== "admin") {
      await client().auth.signOut();
      showError("Akun ini belum memiliki hak administrator. Hubungi pemilik toko untuk penetapan role admin.");
      return false;
    }
    $("adminIdentity").textContent = `ADMIN · @${profile.username}`;
    $("adminLogout").classList.remove("hidden");
    $("loginView").classList.add("hidden");
    $("dashboardView").classList.remove("hidden");
    await refreshAll();
    return true;
  }

  async function login(event) {
    event.preventDefault(); clearError();
    if (!window.rdBackendReady) { showError("Supabase belum dikonfigurasi. Isi backend/config.json terlebih dahulu."); return; }
    const button = $("adminLoginSubmit"); button.disabled = true; button.textContent = "Memeriksa akun…";
    try {
      await window.RDAuth.login($("adminUsername").value.trim(), $("adminPassword").value, $("adminRemember").checked);
      const profile = await window.RDAuth.getProfile();
      if (!profile || profile.role !== "admin") {
        await client().auth.signOut();
        throw new Error("Akun ini bukan administrator. Role admin hanya dapat ditetapkan oleh pemilik database.");
      }
      await requireAdmin();
    } catch (error) { showError(error.message || "Login admin gagal."); }
    finally { button.disabled = false; button.textContent = "Masuk ke dashboard"; }
  }

  async function refreshAll() {
    if (!window.rdBackendReady) return;
    try {
      const [statsResult, users, orders, products, refunds, warranties, audits] = await Promise.all([
        client().rpc("admin_dashboard_stats"),
        client().from("profiles").select("id,username,display_name,email,whatsapp,role,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(1000),
        client().from("orders").select("id,order_number,user_id,customer_name,whatsapp,email,total_amount,requires_quote,status,payment_status,created_at,order_items(product_title,variant_name,quantity)").order("created_at", { ascending: false }).limit(300),
        client().from("products").select("id,brand,title,group_name,category,tag,short_description,description,info,is_active,sort_order,product_variants(id,name,price,original_price,discount_enabled,stock_status,note,sort_order)").order("sort_order", { ascending: true }),
        client().from("refund_requests").select("id,user_id,order_number,customer_contact,product_details,reason,requested_amount,status,admin_note,created_at").order("created_at", { ascending: false }).limit(200),
        client().from("warranty_claims").select("id,user_id,order_number,customer_contact,product_details,issue_description,status,admin_note,created_at").order("created_at", { ascending: false }).limit(200),
        client().from("audit_logs").select("id,actor_id,action,table_name,record_id,created_at").order("created_at", { ascending: false }).limit(100)
      ]);
      for (const [name, result] of [["statistik", statsResult], ["pengguna", users], ["pesanan", orders], ["produk", products], ["refund", refunds], ["garansi", warranties], ["audit", audits]]) {
        if (result.error) throw new Error(`Gagal memuat ${name}: ${result.error.message}`);
      }
      usersCache = users.data || []; ordersCache = orders.data || []; productsCache = products.data || [];
      refundsCache = refunds.data || []; warrantyCache = warranties.data || [];
      const stats = statsResult.data || {};
      $("statUsers").textContent = stats.users_count ?? users.count ?? usersCache.length;
      $("statOrders").textContent = stats.orders_count ?? ordersCache.length;
      $("statPending").textContent = stats.pending_orders_count ?? ordersCache.filter(order => !["completed", "cancelled", "refunded"].includes(order.status)).length;
      $("statSales").textContent = money(stats.paid_sales_total ?? 0);
      $("userCountText").textContent = `${usersCache.length} akun ditampilkan · seluruh pendaftaran tersimpan di database`;
      renderUsers(); renderOrders(); renderProducts(); renderSupport(); renderAudits(audits.data || []); renderRecentOrders();
    } catch (error) { notify(error.message || "Gagal memuat data dashboard.", true); console.error(error); }
  }

  function renderUsers() {
    const q = ($("userSearch").value || "").toLowerCase();
    const rows = usersCache.filter(user => [user.username, user.display_name, user.email, user.whatsapp].join(" ").toLowerCase().includes(q));
    $("usersTable").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Username</th><th>Nama</th><th>Email pemulihan</th><th>WhatsApp</th><th>Role</th><th>Terdaftar</th></tr></thead><tbody>${rows.map(user => `<tr><td><strong>@${esc(user.username)}</strong></td><td>${esc(user.display_name)}</td><td>${esc(user.email)}</td><td>${esc(user.whatsapp || "—")}</td><td><span class="status ${user.role === "admin" ? "good" : ""}">${esc(user.role)}</span></td><td>${dateText(user.created_at)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Tidak ada pengguna yang cocok.</div>`;
  }

  function renderOrders() {
    const q = ($("orderSearch").value || "").toLowerCase();
    const rows = ordersCache.filter(order => [order.order_number, order.customer_name, order.whatsapp, order.email].join(" ").toLowerCase().includes(q));
    $("ordersTable").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Invoice / Waktu</th><th>Pelanggan</th><th>Produk</th><th>Total</th><th>Pembayaran</th><th>Status pesanan</th></tr></thead><tbody>${rows.map(order => {
      const products = (order.order_items || []).map(item => `${esc(item.product_title)} · ${esc(item.variant_name)} ×${item.quantity}`).join("<br>");
      return `<tr><td><strong>${esc(order.order_number)}</strong><small class="sub">${dateText(order.created_at)}</small></td><td>${esc(order.customer_name)}<small class="sub">${esc(order.whatsapp)}</small></td><td>${products || "—"}</td><td>${order.requires_quote ? `<input class="table-select" style="width:118px" type="number" min="1" step="1" data-order-final-total="${esc(order.id)}" placeholder="Harga akhir"><button class="mini-btn" data-confirm-order="${esc(order.id)}">Konfirmasi</button>` : money(order.total_amount)}</td><td><span class="status ${statusClass(order.payment_status)}">${labelStatus(order.payment_status)}</span></td><td><select class="table-select" data-order-status="${esc(order.id)}">${orderStatuses.map(status => `<option value="${status}" ${order.status === status ? "selected" : ""}>${labelStatus(status)}</option>`).join("")}</select></td></tr>`;
    }).join("")}</tbody></table></div>` : `<div class="empty">Belum ada pesanan online.</div>`;
  }

  function renderRecentOrders() {
    const rows = ordersCache.slice(0, 6);
    $("recentOrders").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Pelanggan</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows.map(order => `<tr><td><strong>${esc(order.order_number)}</strong><small class="sub">${dateText(order.created_at)}</small></td><td>${esc(order.customer_name)}</td><td>${order.requires_quote ? "Konfirmasi" : money(order.total_amount)}</td><td><span class="status ${statusClass(order.status)}">${labelStatus(order.status)}</span></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Belum ada pesanan. Pesanan online pelanggan akan muncul di sini.</div>`;
  }

  function renderProducts() {
    const q = ($("productSearch").value || "").toLowerCase();
    const rows = productsCache.filter(product => `${product.title} ${product.brand} ${product.category}`.toLowerCase().includes(q));
    $("productsList").innerHTML = rows.length ? rows.map(product => `<article class="product-block"><div class="product-line"><div><strong>${esc(product.title)}</strong><small class="sub">${esc(product.category)} · ${product.product_variants?.length || 0} varian · ${product.is_active ? "Aktif" : "Nonaktif"}</small></div><div class="toolbar"><button class="mini-btn" data-edit-product="${esc(product.id)}">Edit deskripsi</button><button class="mini-btn" data-toggle-product="${esc(product.id)}" data-active="${product.is_active}">${product.is_active ? "Nonaktifkan" : "Aktifkan"}</button></div></div><div class="variant-list">${(product.product_variants || []).sort((a,b)=>a.sort_order-b.sort_order).map(variant => `<div class="variant-line"><span><strong>${esc(variant.name)}</strong><small class="sub">${esc(variant.note || "")}</small></span><span>${variant.price == null ? "Hubungi Admin" : money(variant.price)}</span><span><small class="status ${statusClass(variant.stock_status)}">${labelStatus(variant.stock_status)}</small></span><button class="mini-btn" data-edit-variant="${esc(variant.id)}">Edit harga/stok</button></div>`).join("")}</div></article>`).join("") : `<div class="empty">Produk tidak ditemukan.</div>`;
  }

  function renderSupport() {
    const renderRequests = (rows, type) => rows.length ? `<div class="table-wrap"><table><thead><tr><th>Nomor tiket / invoice</th><th>Kontak</th><th>Detail</th><th>Dibuat</th><th>Status</th></tr></thead><tbody>${rows.map(row => `<tr><td><strong>${esc(row.order_number)}</strong><small class="sub">${esc(row.id)}</small></td><td>${esc(row.customer_contact)}</td><td>${esc(type === "refund" ? row.reason : row.issue_description)}<small class="sub">${esc(row.product_details || "")}</small></td><td>${dateText(row.created_at)}</td><td><select class="table-select" data-request-status="${esc(row.id)}" data-request-type="${type}">${requestStatuses.map(status => `<option value="${status}" ${row.status === status ? "selected" : ""}>${labelStatus(status)}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Belum ada pengajuan ${type === "refund" ? "refund" : "garansi"} online.</div>`;
    $("refundTable").innerHTML = renderRequests(refundsCache, "refund");
    $("warrantyTable").innerHTML = renderRequests(warrantyCache, "warranty");
  }

  function renderAudits(rows) {
    $("auditTable").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Aksi</th><th>Tabel</th><th>Record</th><th>Actor</th></tr></thead><tbody>${rows.map(row => `<tr><td>${dateText(row.created_at)}</td><td>${esc(row.action)}</td><td>${esc(row.table_name)}</td><td>${esc(row.record_id || "—")}</td><td>${esc(row.actor_id || "system")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Belum ada aktivitas yang tercatat.</div>`;
  }

  async function updateOrder(id, status) {
    const { error } = await client().from("orders").update({ status }).eq("id", id);
    if (error) throw error;
    notify("Status pesanan berhasil diperbarui."); await refreshAll();
  }
  async function updateRequest(id, type, status) {
    const table = type === "refund" ? "refund_requests" : "warranty_claims";
    const note = window.prompt("Catatan admin (opsional):", "");
    const { error } = await client().from(table).update({ status, admin_note: note || null }).eq("id", id);
    if (error) throw error;
    notify("Status pengajuan berhasil diperbarui."); await refreshAll();
  }

  function openVariant(id) {
    const variant = productsCache.flatMap(product => product.product_variants || []).find(item => item.id === id);
    if (!variant) return;
    $("variantId").value = variant.id; $("variantName").value = variant.name;
    $("variantPrice").value = variant.price ?? ""; $("variantOriginalPrice").value = variant.original_price ?? "";
    $("variantStock").value = variant.stock_status; $("variantDiscount").value = String(variant.discount_enabled);
    $("variantNote").value = variant.note || ""; $("variantModal").classList.add("show");
  }
  function openProduct(id) {
    const product = productsCache.find(item => item.id === id); if (!product) return;
    $("productId").value = product.id; $("productTitle").value = product.title;
    $("productShort").value = product.short_description || ""; $("productDescription").value = product.description || "";
    $("productInfo").value = product.info || ""; $("productActive").value = String(product.is_active);
    $("productModal").classList.add("show");
  }

  function wire() {
    $("adminLoginForm").addEventListener("submit", login);
    $("adminLogout").addEventListener("click", async () => { await client().auth.signOut(); location.reload(); });
    $("refreshAll").addEventListener("click", refreshAll);
    document.querySelectorAll("[data-admin-tab]").forEach(button => button.addEventListener("click", () => setTab(button.dataset.adminTab)));
    $("userSearch").addEventListener("input", renderUsers); $("orderSearch").addEventListener("input", renderOrders); $("productSearch").addEventListener("input", renderProducts);
    document.addEventListener("click", event => {
      const confirmOrder = event.target.closest("[data-confirm-order]");
      if (confirmOrder) {
        const id = confirmOrder.dataset.confirmOrder;
        const input = document.querySelector(`[data-order-final-total="${CSS.escape(id)}"]`);
        const amount = Number(input?.value);
        if (!Number.isSafeInteger(amount) || amount <= 0) { notify("Masukkan total akhir dalam Rupiah yang valid.", true); return; }
        confirmOrder.disabled = true;
        client().from("orders").update({ total_amount: amount, requires_quote: false, status: "awaiting_payment" }).eq("id", id)
          .then(({ error }) => error ? notify(error.message, true) : (notify("Harga final disimpan. Pesanan siap dibayar melalui QRIS jika gateway aktif."), refreshAll()));
      }
      const variant = event.target.closest("[data-edit-variant]"); if (variant) openVariant(variant.dataset.editVariant);
      const product = event.target.closest("[data-edit-product]"); if (product) openProduct(product.dataset.editProduct);
      const toggle = event.target.closest("[data-toggle-product]"); if (toggle) {
        const isActive = toggle.dataset.active === "true";
        client().from("products").update({ is_active: !isActive }).eq("id", toggle.dataset.toggleProduct).then(({ error }) => error ? notify(error.message, true) : (notify("Status produk diperbarui."), refreshAll()));
      }
      if (event.target.matches("[data-close-modal]")) document.querySelectorAll(".modal.show").forEach(modal => modal.classList.remove("show"));
      const shortcut = event.target.closest("[data-admin-tab]"); if (shortcut && shortcut.classList.contains("mini-btn")) setTab(shortcut.dataset.adminTab);
    });
    $("ordersTable").addEventListener("change", event => { const select = event.target.closest("[data-order-status]"); if (select) updateOrder(select.dataset.orderStatus, select.value).catch(error => notify(error.message, true)); });
    document.addEventListener("change", event => { const select = event.target.closest("[data-request-status]"); if (select) updateRequest(select.dataset.requestStatus, select.dataset.requestType, select.value).catch(error => notify(error.message, true)); });
    $("variantForm").addEventListener("submit", async event => {
      event.preventDefault(); const price = $("variantPrice").value.trim(); const original = $("variantOriginalPrice").value.trim();
      const update = { price: price === "" ? null : Number(price), original_price: original === "" ? null : Number(original), stock_status: $("variantStock").value, discount_enabled: $("variantDiscount").value === "true", note: $("variantNote").value.trim() || null };
      const { error } = await client().from("product_variants").update(update).eq("id", $("variantId").value);
      if (error) { notify(error.message, true); return; }
      $("variantModal").classList.remove("show"); notify("Harga dan stok varian diperbarui."); await refreshAll();
    });
    $("productForm").addEventListener("submit", async event => {
      event.preventDefault(); const update = { title: $("productTitle").value.trim(), short_description: $("productShort").value.trim(), description: $("productDescription").value.trim(), info: $("productInfo").value.trim(), is_active: $("productActive").value === "true" };
      const { error } = await client().from("products").update(update).eq("id", $("productId").value);
      if (error) { notify(error.message, true); return; }
      $("productModal").classList.remove("show"); notify("Informasi produk diperbarui."); await refreshAll();
    });
    $("exportUsers").addEventListener("click", () => {
      const header = ["username","display_name","email","whatsapp","role","created_at"];
      const csv = [header.join(","), ...usersCache.map(row => header.map(key => `"${String(row[key] ?? "").replace(/"/g,'""')}"`).join(","))].join("\n");
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "ruangdigital190-pengguna.csv"; a.click(); URL.revokeObjectURL(url);
    });
  }

  async function init() {
    wire();
    if (!window.rdBackendReady) {
      $("backendNotice").textContent = window.rdBackendMessage || "Backend belum dikonfigurasi.";
      $("adminLoginSubmit").disabled = true;
      return;
    }
    $("backendNotice").textContent = "Koneksi Supabase siap. Login admin menggunakan username dan password.";
    try { await requireAdmin(); } catch (error) { console.warn("No existing admin session", error); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
