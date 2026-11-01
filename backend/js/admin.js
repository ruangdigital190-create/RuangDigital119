(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const client = () => window.rdSupabase;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const money = value => new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0
  }).format(Number(value || 0));
  const dateText = value => value ? new Date(value).toLocaleString("id-ID") : "—";
  const ACTIVE_WINDOW_MS = 3 * 60 * 1000;
  const IMAGE_BUCKET = "rd190-product-images";

  let usersCache = [], ordersCache = [], productsCache = [];
  let refundsCache = [], warrantyCache = [], auditsCache = [], devicesCache = [];
  let usersTotal = 0, deviceTableReady = true, imageColumnReady = true, toastTimer = null, previewObjectUrl = null, slugEdited = false;
  let currentProfile = null;

  const orderStatuses = ["awaiting_confirmation", "awaiting_payment", "processing", "completed", "cancelled", "failed", "refunded"];
  const requestStatuses = ["waiting_review", "processing", "approved", "rejected", "completed"];
  const labels = {
    awaiting_confirmation: "Menunggu konfirmasi", awaiting_payment: "Menunggu pembayaran",
    processing: "Diproses", completed: "Selesai", cancelled: "Dibatalkan",
    failed: "Gagal", refunded: "Direfund", unpaid: "Belum dibayar",
    pending: "Menunggu", paid: "Lunas", expired: "Kedaluwarsa",
    waiting_review: "Menunggu pemeriksaan", approved: "Disetujui", rejected: "Ditolak",
    available: "Tersedia", limited: "Stok terbatas", out_of_stock: "Habis",
    confirm: "Konfirmasi admin", admin: "Administrator", customer: "Pelanggan"
  };
  const labelStatus = value => labels[value] || value || "—";
  const statusClass = value => {
    if (["paid", "completed", "approved", "available", "processing", "online"].includes(value)) return "good";
    if (["failed", "expired", "cancelled", "rejected", "out_of_stock", "offline"].includes(value)) return "bad";
    if (["admin", "awaiting_payment"].includes(value)) return "neutral";
    return "";
  };

  function notify(message, isError = false) {
    const node = $("toast");
    if (!node) return;
    node.textContent = message;
    node.classList.remove("hidden");
    node.style.borderColor = isError ? "rgba(255,130,149,.45)" : "rgba(97,231,223,.3)";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => node.classList.add("hidden"), 4200);
  }
  function showError(message) {
    const node = $("loginError");
    node.textContent = message;
    node.classList.remove("hidden");
  }
  function clearError() { $("loginError")?.classList.add("hidden"); }
  function setTab(name) {
    const allowed = ["overview", "users", "devices", "orders", "products", "support", "audit"];
    if (!allowed.includes(name)) return;
    document.querySelectorAll(".tab").forEach(el => el.classList.toggle("active", el.id === `tab-${name}`));
    document.querySelectorAll("[data-admin-tab]").forEach(el => el.classList.toggle("active", el.dataset.adminTab === name));
    if (name === "devices") loadDevices().catch(error => notify(error.message, true));
  }
  function activeDevice(row) {
    const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
    return Boolean(row.is_active && lastSeen && Date.now() - lastSeen <= ACTIVE_WINDOW_MS);
  }
  function getUser(userId) {
    return usersCache.find(user => user.id === userId) || null;
  }
  function formatImage(url, title) {
    if (!url) return `<div class="product-thumb" aria-hidden="true">${esc((title || "RD").slice(0, 2).toUpperCase())}</div>`;
    return `<div class="product-thumb" data-fallback="${esc((title || "RD").slice(0, 2).toUpperCase())}"><img src="${esc(url)}" alt="${esc(title || "Gambar produk")}" loading="lazy"></div>`;
  }
  function slugify(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  }
  function validImageUrl(value) {
    const clean = String(value || "").trim();
    if (!clean) return null;
    let parsed;
    try { parsed = new URL(clean); } catch (_) { throw new Error("URL gambar tidak valid."); }
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("URL gambar harus menggunakan HTTPS atau HTTP.");
    return clean;
  }
  function showModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = document.querySelector(".modal.show") ? "hidden" : "";
    if (modal.id === "productModal") {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
  }

  async function requireAdmin() {
    if (!window.rdBackendReady) return false;
    const { data: { session }, error: sessionError } = await client().auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) {
      $("loginView").classList.remove("hidden");
      $("dashboardView").classList.add("hidden");
      $("adminLogout").classList.add("hidden");
      return false;
    }
    const profile = await window.RDAuth.getProfile();
    if (!profile || profile.role !== "admin") {
      await window.RDDeviceTracker?.markInactive?.();
      await client().auth.signOut();
      currentProfile = null;
      showError("Akun ini belum memiliki hak administrator. Role admin hanya dapat ditetapkan oleh pemilik database.");
      return false;
    }
    currentProfile = profile;
    $("adminIdentity").textContent = `ADMIN · @${profile.username}`;
    $("adminLogout").classList.remove("hidden");
    $("loginView").classList.add("hidden");
    $("dashboardView").classList.remove("hidden");
    await refreshAll();
    return true;
  }

  async function login(event) {
    event.preventDefault();
    clearError();
    if (!window.rdBackendReady) {
      showError(window.rdBackendMessage || "Supabase belum dikonfigurasi.");
      return;
    }
    const button = $("adminLoginSubmit");
    button.disabled = true;
    button.textContent = "Memeriksa akun…";
    try {
      await window.RDAuth.login($("adminUsername").value.trim(), $("adminPassword").value, $("adminRemember").checked);
      const profile = await window.RDAuth.getProfile();
      if (!profile || profile.role !== "admin") {
        await window.RDDeviceTracker?.markInactive?.();
        await client().auth.signOut();
        throw new Error("Akun ini belum memiliki role administrator.");
      }
      $("adminPassword").value = "";
      await requireAdmin();
    } catch (error) {
      showError(error.message || "Login admin gagal. Periksa username, password, dan konfigurasi login.");
    } finally {
      button.disabled = false;
      button.textContent = "Masuk ke dashboard →";
    }
  }

  async function loadProductsForAdmin() {
    const withImage = await client().from("products")
      .select("id,brand,title,group_name,category,tag,short_description,description,info,image_url,is_active,sort_order,product_variants(id,name,price,original_price,discount_enabled,stock_status,note,sort_order,is_active)")
      .order("sort_order", { ascending: true });
    if (withImage.error && /image_url/i.test(withImage.error.message || "")) {
      imageColumnReady = false;
      const legacy = await client().from("products")
        .select("id,brand,title,group_name,category,tag,short_description,description,info,is_active,sort_order,product_variants(id,name,price,original_price,discount_enabled,stock_status,note,sort_order,is_active)")
        .order("sort_order", { ascending: true });
      if (!legacy.error) {
        notify("Katalog termuat, tetapi kolom gambar belum aktif. Jalankan admin-enhancements.sql untuk mengaktifkan unggah gambar.");
        return legacy;
      }
    }
    if (!withImage.error) imageColumnReady = true;
    return withImage;
  }

  async function refreshAll() {
    if (!window.rdBackendReady) return;
    const refreshButton = $("refreshAll");
    if (refreshButton) { refreshButton.disabled = true; refreshButton.textContent = "Memuat…"; }
    try {
      const results = await Promise.all([
        client().rpc("admin_dashboard_stats"),
        client().from("profiles").select("id,username,display_name,email,whatsapp,role,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(1000),
        client().from("orders").select("id,order_number,user_id,customer_name,whatsapp,email,total_amount,requires_quote,status,payment_status,created_at,order_items(product_title,variant_name,quantity)").order("created_at", { ascending: false }).limit(300),
        loadProductsForAdmin(),
        client().from("refund_requests").select("id,user_id,order_number,customer_contact,product_details,reason,requested_amount,status,admin_note,created_at").order("created_at", { ascending: false }).limit(200),
        client().from("warranty_claims").select("id,user_id,order_number,customer_contact,product_details,issue_description,status,admin_note,created_at").order("created_at", { ascending: false }).limit(200),
        client().from("audit_logs").select("id,actor_id,action,table_name,record_id,created_at").order("created_at", { ascending: false }).limit(150)
      ]);
      const names = ["statistik", "pengguna", "pesanan", "katalog", "refund", "garansi", "audit"];
      results.forEach((result, index) => {
        if (result.error) throw new Error(`Gagal memuat ${names[index]}: ${result.error.message}`);
      });

      const [statsResult, users, orders, products, refunds, warranties, audits] = results;
      usersCache = users.data || [];
      usersTotal = users.count ?? usersCache.length;
      ordersCache = orders.data || [];
      productsCache = products.data || [];
      refundsCache = refunds.data || [];
      warrantyCache = warranties.data || [];
      auditsCache = audits.data || [];

      const stats = statsResult.data || {};
      $("statUsers").textContent = stats.users_count ?? usersTotal;
      $("statOrders").textContent = stats.orders_count ?? ordersCache.length;
      $("statPending").textContent = stats.pending_orders_count ?? ordersCache.filter(order => !["completed", "cancelled", "refunded"].includes(order.status)).length;
      $("statSales").textContent = money(stats.paid_sales_total ?? 0);
      $("userCountText").textContent = `${usersTotal.toLocaleString("id-ID")} akun terdaftar · ${usersCache.length.toLocaleString("id-ID")} ditampilkan`;
      renderUsers();
      renderOrders();
      renderProducts();
      renderSupport();
      renderAudits(auditsCache);
      renderRecentOrders();
      await loadDevices();
    } catch (error) {
      notify(error.message || "Gagal memuat data dashboard.", true);
      console.error("Dashboard refresh failed:", error);
    } finally {
      if (refreshButton) { refreshButton.disabled = false; refreshButton.textContent = "↻ Perbarui data"; }
    }
  }

  function renderUsers() {
    const q = ($("userSearch")?.value || "").trim().toLowerCase();
    const rows = usersCache.filter(user => [user.username, user.display_name, user.email, user.whatsapp, user.role].join(" ").toLowerCase().includes(q));
    $("usersTable").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Username</th><th>Nama</th><th>Email pemulihan</th><th>WhatsApp</th><th>Role</th><th>Terdaftar</th></tr></thead><tbody>${rows.map(user => `<tr><td><strong>@${esc(user.username)}</strong></td><td>${esc(user.display_name)}</td><td>${esc(user.email)}</td><td>${esc(user.whatsapp || "—")}</td><td><span class="status ${statusClass(user.role)}">${esc(labelStatus(user.role))}</span></td><td>${dateText(user.created_at)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Tidak ada pengguna yang cocok.</div>`;
  }

  function renderOrders() {
    const q = ($("orderSearch")?.value || "").trim().toLowerCase();
    const rows = ordersCache.filter(order => [order.order_number, order.customer_name, order.whatsapp, order.email].join(" ").toLowerCase().includes(q));
    $("ordersTable").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Invoice / waktu</th><th>Pelanggan</th><th>Produk</th><th>Total</th><th>Pembayaran</th><th>Status pesanan</th></tr></thead><tbody>${rows.map(order => {
      const products = (order.order_items || []).map(item => `${esc(item.product_title)} · ${esc(item.variant_name)} ×${item.quantity}`).join("<br>");
      const quote = order.requires_quote ? `<div><input class="table-select" style="width:125px" type="number" min="1" step="1" data-order-final-total="${esc(order.id)}" placeholder="Harga akhir"><button class="mini-btn" data-confirm-order="${esc(order.id)}" type="button">Konfirmasi</button></div>` : money(order.total_amount);
      return `<tr><td><strong>${esc(order.order_number)}</strong><small class="sub">${dateText(order.created_at)}</small></td><td>${esc(order.customer_name)}<small class="sub">${esc(order.whatsapp)}</small></td><td>${products || "—"}</td><td>${quote}</td><td><span class="status ${statusClass(order.payment_status)}">${esc(labelStatus(order.payment_status))}</span></td><td><select class="table-select" data-order-status="${esc(order.id)}">${orderStatuses.map(status => `<option value="${status}" ${order.status === status ? "selected" : ""}>${esc(labelStatus(status))}</option>`).join("")}</select></td></tr>`;
    }).join("")}</tbody></table></div>` : `<div class="empty">Belum ada pesanan online.</div>`;
  }

  function renderRecentOrders() {
    const rows = ordersCache.slice(0, 6);
    $("recentOrders").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Pelanggan</th><th>Total</th><th>Pembayaran</th><th>Status</th></tr></thead><tbody>${rows.map(order => `<tr><td><strong>${esc(order.order_number)}</strong><small class="sub">${dateText(order.created_at)}</small></td><td>${esc(order.customer_name)}</td><td>${order.requires_quote ? "Konfirmasi harga" : money(order.total_amount)}</td><td><span class="status ${statusClass(order.payment_status)}">${esc(labelStatus(order.payment_status))}</span></td><td><span class="status ${statusClass(order.status)}">${esc(labelStatus(order.status))}</span></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Belum ada pesanan. Pesanan online pelanggan akan muncul di sini.</div>`;
  }

  function renderProducts() {
    const q = ($("productSearch")?.value || "").trim().toLowerCase();
    const rows = productsCache.filter(product => [product.id, product.title, product.brand, product.category, product.tag].join(" ").toLowerCase().includes(q));
    $("productsList").innerHTML = rows.length ? rows.map(product => {
      const variants = [...(product.product_variants || [])].sort((a, b) => a.sort_order - b.sort_order);
      const variantMarkup = variants.length ? variants.map(variant => `<div class="variant-line"><div><strong>${esc(variant.name)}</strong><small>${esc(variant.note || (variant.is_active === false ? "Varian nonaktif" : " "))}</small></div><span>${variant.price == null ? "Hubungi admin" : money(variant.price)}</span><span class="status ${statusClass(variant.stock_status)}">${esc(labelStatus(variant.stock_status))} · ${variant.is_active === false ? "Nonaktif" : "Aktif"}</span><button class="mini-btn" type="button" data-edit-variant="${esc(variant.id)}">Edit varian</button></div>`).join("") : `<div class="empty">Belum ada varian. Tambahkan paket pertama untuk produk ini.</div>`;
      return `<article class="product-block">
        <div class="product-line">
          ${formatImage(product.image_url, product.title)}
          <div class="product-meta"><strong>${esc(product.title)}</strong><small>${esc(product.brand)} · ${esc(product.category)} · ID: ${esc(product.id)}<br>${variants.length} varian · ${product.is_active ? "Aktif di toko" : "Nonaktif"}</small></div>
          <div class="toolbar">
            <button class="mini-btn" type="button" data-edit-product="${esc(product.id)}">Edit produk</button>
            <button class="mini-btn" type="button" data-add-variant="${esc(product.id)}">＋ Varian</button>
            <button class="mini-btn" type="button" data-toggle-product="${esc(product.id)}" data-active="${product.is_active}">${product.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
            <button class="mini-btn danger" type="button" data-delete-product="${esc(product.id)}">Hapus</button>
          </div>
        </div>
        <div class="variant-list">${variantMarkup}</div>
      </article>`;
    }).join("") : `<div class="empty">Produk tidak ditemukan. Gunakan tombol Tambah produk untuk membuat katalog baru.</div>`;
  }

  function renderSupport() {
    const renderRequests = (rows, type) => rows.length ? `<div class="table-wrap"><table><thead><tr><th>Invoice / tiket</th><th>Kontak</th><th>Detail</th><th>Dibuat</th><th>Status</th></tr></thead><tbody>${rows.map(row => `<tr><td><strong>${esc(row.order_number)}</strong><small class="sub">${esc(row.id)}</small></td><td>${esc(row.customer_contact)}</td><td>${esc(type === "refund" ? row.reason : row.issue_description)}<small class="sub">${esc(row.product_details || "")}</small></td><td>${dateText(row.created_at)}</td><td><select class="table-select" data-request-status="${esc(row.id)}" data-request-type="${type}">${requestStatuses.map(status => `<option value="${status}" ${row.status === status ? "selected" : ""}>${esc(labelStatus(status))}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Belum ada pengajuan ${type === "refund" ? "refund" : "garansi"} online.</div>`;
    $("refundTable").innerHTML = renderRequests(refundsCache, "refund");
    $("warrantyTable").innerHTML = renderRequests(warrantyCache, "warranty");
  }

  function renderAudits(rows) {
    $("auditTable").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Aksi</th><th>Tabel</th><th>Record</th><th>Actor</th></tr></thead><tbody>${rows.map(row => `<tr><td>${dateText(row.created_at)}</td><td>${esc(row.action)}</td><td>${esc(row.table_name)}</td><td>${esc(row.record_id || "—")}</td><td>${esc(row.actor_id || "system")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Belum ada aktivitas yang tercatat.</div>`;
  }

  async function loadDevices() {
    if (!window.rdBackendReady) return false;
    const { data, error } = await client().from("device_sessions")
      .select("id,user_id,device_id,device_label,platform,user_agent,last_seen_at,is_active,signed_out_at,created_at")
      .order("last_seen_at", { ascending: false }).limit(500);
    if (error) {
      deviceTableReady = false;
      devicesCache = [];
      $("statDevices").textContent = "—";
      $("deviceActiveCount").textContent = "—";
      $("deviceTotalCount").textContent = "—";
      $("deviceUserCount").textContent = "—";
      $("deviceCountText").textContent = "Tabel pemantauan belum tersedia.";
      $("devicesTable").innerHTML = `<div class="empty">Fitur pemantauan perangkat belum diaktifkan pada database. Jalankan <strong>backend/sql/admin-enhancements.sql</strong> di Supabase SQL Editor, lalu perbarui halaman ini.<br><small>${esc(error.message)}</small></div>`;
      $("recentDevices").innerHTML = `<div class="empty">Pemantauan perangkat menunggu migrasi database.</div>`;
      return false;
    }
    deviceTableReady = true;
    devicesCache = data || [];
    renderDevices();
    return true;
  }

  function renderDevices() {
    const activeRows = devicesCache.filter(activeDevice);
    const uniqueUsers = new Set(devicesCache.map(row => row.user_id));
    $("statDevices").textContent = activeRows.length.toLocaleString("id-ID");
    $("deviceActiveCount").textContent = activeRows.length.toLocaleString("id-ID");
    $("deviceTotalCount").textContent = devicesCache.length.toLocaleString("id-ID");
    $("deviceUserCount").textContent = uniqueUsers.size.toLocaleString("id-ID");
    $("deviceCountText").textContent = `${devicesCache.length.toLocaleString("id-ID")} perangkat/browser tercatat`;
    const q = ($("deviceSearch")?.value || "").trim().toLowerCase();
    const filtered = devicesCache.filter(row => {
      const user = getUser(row.user_id);
      return [user?.username, user?.display_name, row.device_label, row.platform, row.user_agent].join(" ").toLowerCase().includes(q);
    });
    const tableRows = filtered.map(row => {
      const user = getUser(row.user_id);
      const online = activeDevice(row);
      return `<tr><td><strong>@${esc(user?.username || "akun tidak ditemukan")}</strong><small class="sub">${esc(user?.display_name || row.user_id)}</small></td><td>${esc(row.device_label || "Perangkat tidak dikenal")}<small class="sub">${esc(row.platform || "Platform tidak diketahui")}</small></td><td><span class="status ${online ? "good" : "bad"}">${online ? "Aktif" : "Tidak aktif"}</span></td><td>${dateText(row.last_seen_at)}</td><td>${dateText(row.created_at)}</td></tr>`;
    }).join("");
    $("devicesTable").innerHTML = tableRows ? `<div class="table-wrap"><table><thead><tr><th>Akun</th><th>Perangkat / browser</th><th>Status</th><th>Aktivitas terakhir</th><th>Pertama tercatat</th></tr></thead><tbody>${tableRows}</tbody></table></div>` : `<div class="empty">Belum ada perangkat yang cocok.</div>`;
    const recent = activeRows.slice(0, 5).map(row => {
      const user = getUser(row.user_id);
      return `<tr><td><strong>@${esc(user?.username || "—")}</strong></td><td>${esc(row.device_label || "Perangkat")}</td><td>${dateText(row.last_seen_at)}</td><td><span class="status good">Aktif</span></td></tr>`;
    }).join("");
    $("recentDevices").innerHTML = recent ? `<div class="table-wrap"><table><thead><tr><th>Akun</th><th>Perangkat</th><th>Terakhir aktif</th><th>Status</th></tr></thead><tbody>${recent}</tbody></table></div>` : `<div class="empty">Tidak ada perangkat dengan aktivitas dalam 3 menit terakhir.</div>`;
  }

  async function updateOrder(id, status) {
    const { error } = await client().from("orders").update({ status }).eq("id", id);
    if (error) throw error;
    notify("Status pemenuhan pesanan berhasil diperbarui.");
    await refreshAll();
  }
  async function updateRequest(id, type, status) {
    const table = type === "refund" ? "refund_requests" : "warranty_claims";
    const note = window.prompt("Catatan admin (opsional):", "");
    const { error } = await client().from(table).update({ status, admin_note: note || null }).eq("id", id);
    if (error) throw error;
    notify("Status pengajuan berhasil diperbarui.");
    await refreshAll();
  }

  function openProduct(id) {
    const product = id ? productsCache.find(item => item.id === id) : null;
    slugEdited = false;
    $("productForm").reset();
    $("productId").value = product?.id || "";
    $("productSlug").value = product?.id || "";
    $("productSlug").disabled = Boolean(product);
    $("productBrand").value = product?.brand || "";
    $("productTitle").value = product?.title || "";
    $("productGroup").value = product?.group_name || "apps";
    $("productCategory").value = product?.category || "";
    $("productTag").value = product?.tag || "";
    $("productSortOrder").value = product?.sort_order ?? (productsCache.length ? Math.max(...productsCache.map(item => Number(item.sort_order || 0))) + 1 : 1);
    $("productShort").value = product?.short_description || "";
    $("productDescription").value = product?.description || "";
    $("productInfo").value = product?.info || "";
    $("productActive").value = String(product?.is_active ?? true);
    $("productImageUrl").value = product?.image_url || "";
    $("productImageFile").value = "";
    setImagePreview(product?.image_url || "");
    $("productModalTitle").textContent = product ? "Edit informasi produk" : "Tambah produk baru";
    $("productDeleteButton").classList.toggle("hidden", !product);
    showModal("productModal");
  }

  function setImagePreview(url) {
    const box = $("productImagePreview");
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
    if (url) box.innerHTML = `<img src="${esc(url)}" alt="Preview gambar produk">`;
    else box.textContent = "Preview gambar";
  }

  function openVariant(id, productId) {
    const variant = id ? productsCache.flatMap(product => product.product_variants || []).find(item => item.id === id) : null;
    const parent = variant ? productsCache.find(product => (product.product_variants || []).some(item => item.id === variant.id)) : productsCache.find(product => product.id === productId);
    if (!parent) { notify("Produk induk tidak ditemukan.", true); return; }
    $("variantForm").reset();
    $("variantId").value = variant?.id || "";
    $("variantProductId").value = parent.id;
    $("variantName").value = variant?.name || "";
    $("variantPrice").value = variant?.price ?? "";
    $("variantOriginalPrice").value = variant?.original_price ?? "";
    $("variantStock").value = variant?.stock_status || "confirm";
    $("variantDiscount").value = String(variant?.discount_enabled ?? false);
    const currentVariantOrders = (parent.product_variants || []).map(item => Number(item.sort_order || 0));
    $("variantSortOrder").value = variant?.sort_order ?? (Math.max(0, ...currentVariantOrders) + 1);
    $("variantActive").value = String(variant?.is_active ?? true);
    $("variantNote").value = variant?.note || "";
    $("variantModalTitle").textContent = variant ? `Edit varian · ${parent.title}` : `Tambah varian · ${parent.title}`;
    $("variantDeleteButton").classList.toggle("hidden", !variant);
    showModal("variantModal");
  }

  async function uploadProductImage(file, productId) {
    if (!file) return null;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) throw new Error("Format gambar harus JPG, PNG, WEBP, atau AVIF.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 5 MB.");
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[file.type];
    const path = `products/${productId}/${Date.now()}.${extension}`;
    const { error } = await client().storage.from(IMAGE_BUCKET).upload(path, file, {
      cacheControl: "3600", upsert: true, contentType: file.type
    });
    if (error) throw new Error(`Gagal mengunggah gambar: ${error.message}. Pastikan migrasi Storage sudah dijalankan.`);
    const { data } = client().storage.from(IMAGE_BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function saveProduct(event) {
    event.preventDefault();
    const button = $("productSaveButton");
    button.disabled = true;
    button.textContent = "Menyimpan…";
    let newImageUrl = null;
    try {
      const existingId = $("productId").value.trim();
      const title = $("productTitle").value.trim();
      const id = existingId || slugify($("productSlug").value.trim() || title);
      if (!id || !/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) throw new Error("ID produk minimal 2 karakter dan hanya boleh berisi huruf kecil, angka, _ atau -.");
      const sortOrder = Number($("productSortOrder").value || 0);
      if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) throw new Error("Urutan katalog harus berupa bilangan bulat positif atau nol.");
      newImageUrl = validImageUrl($("productImageUrl").value);
      const file = $("productImageFile").files?.[0];
      if (file) newImageUrl = await uploadProductImage(file, id);
      const payload = {
        id,
        brand: $("productBrand").value.trim(),
        title,
        group_name: $("productGroup").value,
        category: $("productCategory").value.trim(),
        tag: $("productTag").value.trim() || null,
        short_description: $("productShort").value.trim() || null,
        description: $("productDescription").value.trim() || null,
        info: $("productInfo").value.trim() || null,
        sort_order: sortOrder,
        is_active: $("productActive").value === "true"
      };
      if (imageColumnReady) payload.image_url = newImageUrl;
      else if (file || $("productImageUrl").value.trim()) {
        throw new Error("Kolom gambar belum tersedia. Jalankan backend/sql/admin-enhancements.sql terlebih dahulu.");
      }
      if (!payload.brand || !payload.title || !payload.category) throw new Error("Brand, nama produk, dan kategori wajib diisi.");
      const result = existingId
        ? await client().from("products").update(payload).eq("id", existingId)
        : await client().from("products").insert(payload);
      if (result.error) throw result.error;
      closeModal($("productModal"));
      notify(existingId ? "Produk berhasil diperbarui." : "Produk baru berhasil ditambahkan.");
      await refreshAll();
    } catch (error) {
      notify(error.message || "Produk gagal disimpan.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Simpan produk";
    }
  }

  async function saveVariant(event) {
    event.preventDefault();
    const button = $("variantSaveButton");
    button.disabled = true;
    button.textContent = "Menyimpan…";
    try {
      const id = $("variantId").value.trim();
      const productId = $("variantProductId").value.trim();
      const priceText = $("variantPrice").value.trim();
      const originalText = $("variantOriginalPrice").value.trim();
      const sortOrder = Number($("variantSortOrder").value || 0);
      if (!productId) throw new Error("Produk induk belum dipilih.");
      if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) throw new Error("Urutan varian harus bilangan bulat positif atau nol.");
      const price = priceText === "" ? null : Number(priceText);
      const original = originalText === "" ? null : Number(originalText);
      if (price !== null && (!Number.isSafeInteger(price) || price < 0)) throw new Error("Harga jual tidak valid.");
      if (original !== null && (!Number.isSafeInteger(original) || original < 0)) throw new Error("Harga normal tidak valid.");
      const payload = {
        product_id: productId,
        name: $("variantName").value.trim(),
        price,
        original_price: original,
        stock_status: $("variantStock").value,
        discount_enabled: $("variantDiscount").value === "true",
        note: $("variantNote").value.trim() || null,
        sort_order: sortOrder,
        is_active: $("variantActive").value === "true"
      };
      if (!payload.name) throw new Error("Nama varian wajib diisi.");
      const result = id
        ? await client().from("product_variants").update(payload).eq("id", id)
        : await client().from("product_variants").insert(payload);
      if (result.error) throw result.error;
      closeModal($("variantModal"));
      notify(id ? "Varian berhasil diperbarui." : "Varian baru berhasil ditambahkan.");
      await refreshAll();
    } catch (error) {
      notify(error.message || "Varian gagal disimpan.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Simpan varian";
    }
  }

  async function deleteProduct(id) {
    const product = productsCache.find(item => item.id === id);
    if (!product) return;
    if (!window.confirm(`Hapus produk "${product.title}"? Produk yang sudah tercantum dalam riwayat pesanan akan dinonaktifkan agar data transaksi tetap utuh.`)) return;
    const { count, error: countError } = await client().from("order_items").select("id", { count: "exact", head: true }).eq("product_id", id);
    if (countError) throw countError;
    if ((count || 0) > 0) {
      const { error } = await client().from("products").update({ is_active: false }).eq("id", id);
      if (error) throw error;
      notify("Produk memiliki riwayat transaksi, jadi dinonaktifkan dan tidak dihapus permanen.");
    } else {
      const { error } = await client().from("products").delete().eq("id", id);
      if (error) throw error;
      notify("Produk berhasil dihapus.");
    }
    closeModal($("productModal"));
    await refreshAll();
  }

  async function deleteVariant(id) {
    const variant = productsCache.flatMap(product => product.product_variants || []).find(item => item.id === id);
    if (!variant || !window.confirm(`Hapus varian "${variant.name}"? Riwayat pesanan tetap menyimpan nama dan harga saat transaksi.`)) return;
    const { error } = await client().from("product_variants").delete().eq("id", id);
    if (error) throw error;
    closeModal($("variantModal"));
    notify("Varian berhasil dihapus.");
    await refreshAll();
  }

  async function toggleProduct(id, currentActive) {
    const { error } = await client().from("products").update({ is_active: !currentActive }).eq("id", id);
    if (error) throw error;
    notify(currentActive ? "Produk disembunyikan dari katalog pelanggan." : "Produk diaktifkan kembali.");
    await refreshAll();
  }

  function exportUsers() {
    const header = ["username", "display_name", "email", "whatsapp", "role", "created_at"];
    const csv = [header.join(","), ...usersCache.map(row => header.map(key => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ruangdigital190-pengguna.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function wire() {
    $("adminLoginForm")?.addEventListener("submit", login);
    $("adminLogout")?.addEventListener("click", async () => {
      try {
        await window.RDDeviceTracker?.markInactive?.();
        await client().auth.signOut();
        location.reload();
      } catch (error) { notify(error.message || "Logout gagal.", true); }
    });
    $("refreshAll")?.addEventListener("click", refreshAll);
    $("refreshDevices")?.addEventListener("click", () => loadDevices().then(ok => {
      if (ok) notify("Data perangkat diperbarui.");
      else notify("Pemantauan perangkat belum aktif. Jalankan admin-enhancements.sql.", true);
    }).catch(error => notify(error.message, true)));
    $("exportUsers")?.addEventListener("click", exportUsers);
    $("addProductBtn")?.addEventListener("click", () => openProduct(null));
    $("userSearch")?.addEventListener("input", renderUsers);
    $("orderSearch")?.addEventListener("input", renderOrders);
    $("productSearch")?.addEventListener("input", renderProducts);
    $("deviceSearch")?.addEventListener("input", renderDevices);

    $("productForm")?.addEventListener("submit", saveProduct);
    $("variantForm")?.addEventListener("submit", saveVariant);
    $("productDeleteButton")?.addEventListener("click", () => deleteProduct($("productId").value).catch(error => notify(error.message, true)));
    $("variantDeleteButton")?.addEventListener("click", () => deleteVariant($("variantId").value).catch(error => notify(error.message, true)));

    $("productImageFile")?.addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = URL.createObjectURL(file);
      $("productImagePreview").innerHTML = `<img src="${previewObjectUrl}" alt="Preview gambar produk">`;
    });
    $("productImageUrl")?.addEventListener("input", event => {
      if (!$("productImageFile").files?.length) setImagePreview(event.target.value.trim());
    });
    $("productSlug")?.addEventListener("input", () => { slugEdited = true; });
    $("productTitle")?.addEventListener("input", () => {
      if (!$("productId").value && !slugEdited) $("productSlug").value = slugify($("productTitle").value);
    });

    document.addEventListener("click", event => {
      const tab = event.target.closest("[data-admin-tab]");
      if (tab) { setTab(tab.dataset.adminTab); return; }

      const editProduct = event.target.closest("[data-edit-product]");
      if (editProduct) { openProduct(editProduct.dataset.editProduct); return; }

      const addVariant = event.target.closest("[data-add-variant]");
      if (addVariant) { openVariant(null, addVariant.dataset.addVariant); return; }

      const editVariant = event.target.closest("[data-edit-variant]");
      if (editVariant) { openVariant(editVariant.dataset.editVariant); return; }

      const toggle = event.target.closest("[data-toggle-product]");
      if (toggle) {
        toggle.disabled = true;
        toggleProduct(toggle.dataset.toggleProduct, toggle.dataset.active === "true")
          .catch(error => notify(error.message || "Status produk gagal diperbarui.", true))
          .finally(() => { toggle.disabled = false; });
        return;
      }

      const deleteProductButton = event.target.closest("[data-delete-product]");
      if (deleteProductButton) {
        deleteProduct(deleteProductButton.dataset.deleteProduct).catch(error => notify(error.message || "Produk gagal dihapus.", true));
        return;
      }

      if (event.target.matches("[data-close-modal]")) {
        closeModal(event.target.closest(".modal"));
      }
    });

    document.querySelectorAll(".modal").forEach(modal => {
      modal.addEventListener("click", event => {
        if (event.target === modal) closeModal(modal);
      });
    });

    $("ordersTable")?.addEventListener("change", event => {
      const select = event.target.closest("[data-order-status]");
      if (select) updateOrder(select.dataset.orderStatus, select.value).catch(error => notify(error.message, true));
    });
    document.addEventListener("change", event => {
      const select = event.target.closest("[data-request-status]");
      if (select) updateRequest(select.dataset.requestStatus, select.dataset.requestType, select.value).catch(error => notify(error.message, true));
    });

    $("productsList")?.addEventListener("error", event => {
      if (event.target.matches(".product-thumb img")) {
        const box = event.target.closest(".product-thumb");
        if (box) box.textContent = box.dataset.fallback || "RD";
      }
    }, true);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        const open = document.querySelector(".modal.show");
        if (open) closeModal(open);
      }
    });
  }

  async function init() {
    wire();
    if (!window.rdBackendReady) {
      $("backendNotice").textContent = window.rdBackendMessage || "Backend belum dikonfigurasi. Isi backend/config.json dengan URL dan anon key Supabase.";
      $("backendNotice").classList.add("error");
      $("adminLoginSubmit").disabled = true;
      return;
    }
    $("backendNotice").textContent = "Koneksi Supabase siap. Login menggunakan username dan password akun yang memiliki role admin.";
    try { await requireAdmin(); }
    catch (error) { console.warn("Admin session check:", error); }
    window.setInterval(() => {
      if (!$("dashboardView").classList.contains("hidden")) {
        loadDevices().catch(error => console.warn("Device refresh:", error));
      }
    }, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
