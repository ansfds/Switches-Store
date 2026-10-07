(function () {
  const AUTH_UI_ENABLED = window.SwitchesFeatureFlags?.AUTH_UI_ENABLED !== false;
  window.SwitchesFeatureFlags = {
    ...(window.SwitchesFeatureFlags || {}),
    AUTH_UI_ENABLED,
  };

  const authState = {
    loaded: false,
    user: null,
    menuOpen: false,
  };
  const ordersState = {
    list: null,
    details: new Map(),
    revealedCodes: new Set(),
    copiedOrderNumber: "",
    loading: false,
    error: "",
  };
  let routeGuardInstalled = false;

  function safe(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function currentPath() {
    return `${window.location.pathname}${window.location.search}`;
  }

  function normalizedPath() {
    const path = window.location.pathname.replace(/\/+$/, "");
    return path || "/";
  }

  function safeReturnTo(value = currentPath()) {
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin) return "/";
      const path = `${url.pathname}${url.search}`;
      if (path === "/" || path.startsWith("/gift-cards") || path.startsWith("/checkout") || path.startsWith("/account") || path.startsWith("/favorites")) return path;
      return "/";
    } catch {
      return "/";
    }
  }

  function isOrdersRoute() {
    const path = normalizedPath();
    return path === "/account/orders" || path.startsWith("/account/orders/");
  }

  function routeOrderNumber() {
    const match = normalizedPath().match(/^\/account\/orders\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function formatLYD(value) {
    return `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} د.ل`;
  }

  function formatDate(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("ar-LY", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function paymentStatusLabel(status) {
    return {
      PENDING: "قيد الانتظار",
      PAID: "تم الدفع",
      FAILED: "فشل الدفع",
      REFUNDED: "تم الاسترداد",
    }[status] || status || "غير محدد";
  }

  function orderStatusLabel(status) {
    return {
      PENDING_PAYMENT: "بانتظار الدفع",
      PAID: "تم الدفع",
      PROCESSING: "جاري تجهيز الكرت",
      DELIVERED: "تم التسليم",
      REQUIRES_REVIEW: "قيد المراجعة",
      FAILED: "فشل",
      REFUNDED: "تم الاسترداد",
    }[status] || status || "غير محدد";
  }

  function firstName(user) {
    return String(user?.name || user?.email || "حسابي").trim().split(/\s+/)[0] || "حسابي";
  }

  function authUiEnabled() {
    return window.SwitchesFeatureFlags?.AUTH_UI_ENABLED !== false;
  }

  async function getCurrentUser() {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json();
      authState.user = data.authenticated ? data.user : null;
    } catch {
      authState.user = null;
    }
    authState.loaded = true;
    renderAuthNav();
    renderAccountRouteIfNeeded();
    window.dispatchEvent(new CustomEvent("switches:auth-changed", { detail: { user: authState.user } }));
    return authState.user;
  }

  function getCachedUser() {
    return authState.user;
  }

  function isLoaded() {
    return authState.loaded;
  }

  function loginWithGoogle(returnTo) {
    window.location.href = `/auth/google?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
  }

  function requireAuth(returnTo) {
    if (authState.user) return true;
    loginWithGoogle(returnTo);
    return false;
  }

  async function logout() {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Requested-With": "SwitchesStore" },
    }).catch(() => {});
    authState.user = null;
    authState.menuOpen = false;
    renderAuthNav();
    if (window.location.pathname === "/account") {
      window.history.pushState({ page: "home" }, "", "/");
      window.location.reload();
      return;
    }
    renderAccountRouteIfNeeded();
    window.dispatchEvent(new CustomEvent("switches:auth-changed", { detail: { user: null } }));
  }

  function ensureAuthNav() {
    let root = document.getElementById("authNav");
    if (root) return root;
    const actions = document.querySelector(".header-actions");
    if (!actions) return null;
    root = document.createElement("div");
    root.id = "authNav";
    root.className = "auth-nav";
    actions.insertBefore(root, actions.firstChild);
    return root;
  }

  function renderAuthNav() {
    if (!authUiEnabled()) {
      authState.menuOpen = false;
      document.getElementById("authNav")?.remove();
      return;
    }

    const root = ensureAuthNav();
    if (!root) return;
    const user = authState.user;

    if (!user) {
      root.innerHTML = `
        <button class="auth-login-btn" type="button" data-auth-action="login">
          <i class="fa-brands fa-google" aria-hidden="true"></i>
          <span>تسجيل الدخول</span>
        </button>
      `;
      return;
    }

    root.innerHTML = `
      <div class="auth-user-menu ${authState.menuOpen ? "open" : ""}">
        <button class="auth-user-btn" type="button" data-auth-action="toggle-menu" aria-expanded="${authState.menuOpen}">
          ${user.picture ? `<img src="${safe(user.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="auth-avatar-fallback">${safe(firstName(user).slice(0, 1))}</span>`}
          <span>${safe(firstName(user))}</span>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="auth-dropdown" role="menu">
          <button type="button" data-auth-action="account" role="menuitem">حسابي</button>
          <button type="button" data-auth-action="orders" role="menuitem">طلباتي</button>
          <button type="button" data-auth-action="favorites" role="menuitem">المفضلة</button>
          <button type="button" data-auth-action="logout" role="menuitem">تسجيل الخروج</button>
        </div>
      </div>
    `;
  }

  function ensureAccountPage() {
    let page = document.getElementById("accountPage");
    if (page) return page;
    page = document.createElement("div");
    page.id = "accountPage";
    page.className = "account-page";
    const footer = document.querySelector("footer");
    if (footer) footer.insertAdjacentElement("beforebegin", page);
    else document.body.appendChild(page);
    return page;
  }

  function hideAccountPage({ clear = false } = {}) {
    const page = document.getElementById("accountPage");
    if (!page) return;
    page.classList.remove("active");
    if (clear) page.innerHTML = "";
  }

  function hideOtherPagesForAccount() {
    const main = document.querySelector(".main-content");
    const allProducts = document.getElementById("allProductsPage");
    const giftCards = document.getElementById("giftCardsPage");
    const favorites = document.getElementById("favoritesPage");
    if (main) main.style.display = "none";
    if (allProducts) allProducts.classList.remove("active");
    if (giftCards) giftCards.classList.remove("active");
    if (favorites) favorites.classList.remove("active");
  }

  function showHomeAfterAccount() {
    hideAccountPage({ clear: true });
    const main = document.querySelector(".main-content");
    const allProducts = document.getElementById("allProductsPage");
    const favorites = document.getElementById("favoritesPage");
    if (main && !allProducts?.classList.contains("active") && !favorites?.classList.contains("active")) main.style.display = "block";
  }

  function renderAccountPage() {
    if (!authUiEnabled()) {
      hideAccountPage({ clear: true });
      showHomeAfterAccount();
      return;
    }

    const page = ensureAccountPage();
    hideOtherPagesForAccount();
    page.classList.add("active");

    if (!authState.user) {
      page.innerHTML = `
        <div class="container">
          <section class="account-card">
            <span class="account-kicker">Switches Account</span>
            <h1>سجل دخولك أولًا</h1>
            <p>استخدم حساب Google لإكمال الشراء والوصول إلى حسابك.</p>
            <button class="google-login-large" type="button" data-auth-action="login">
              <i class="fa-brands fa-google" aria-hidden="true"></i>
              المتابعة باستخدام Google
            </button>
          </section>
        </div>
      `;
      return;
    }

    const user = authState.user;
    page.innerHTML = `
      <div class="container">
        <section class="account-card">
          <span class="account-kicker">Switches Account</span>
          <h1>حسابي</h1>
          <div class="account-profile">
            ${user.picture ? `<img src="${safe(user.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="account-profile-fallback">${safe(firstName(user).slice(0, 1))}</span>`}
            <div>
              <strong>${safe(user.name || "مستخدم Google")}</strong>
              <span>${safe(user.email)}</span>
            </div>
          </div>
          <button class="account-shortcut" type="button" data-auth-action="orders">
            <span>
              <strong>طلباتي</strong>
              <small>شاهد جميع مشترياتك وحالة الطلبات</small>
            </span>
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
          </button>
          <button class="gift-buy-btn secondary" type="button" data-auth-action="logout">تسجيل الخروج</button>
        </section>
      </div>
    `;
  }

  function showAccount(push = true) {
    if (!authUiEnabled()) return;
    if (push && window.location.pathname !== "/account") window.history.pushState({ page: "account" }, "", "/account");
    renderAccountPage();
  }

  async function loadOrders() {
    ordersState.loading = true;
    ordersState.error = "";
    renderOrdersPage();
    try {
      const response = await fetch("/api/orders", { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "orders_load_failed");
      ordersState.list = data.orders || [];
    } catch {
      ordersState.error = "تعذر تحميل الطلبات.";
    } finally {
      ordersState.loading = false;
      renderOrdersPage();
    }
  }

  async function loadOrderDetail(orderNumber) {
    ordersState.loading = true;
    ordersState.error = "";
    renderOrderDetailPage(orderNumber);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}`, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "order_load_failed");
      ordersState.details.set(orderNumber, data.order);
    } catch {
      ordersState.error = "تعذر تحميل تفاصيل الطلب.";
    } finally {
      ordersState.loading = false;
      renderOrderDetailPage(orderNumber);
    }
  }

  function orderCard(order) {
    return `
      <button class="order-card" type="button" data-auth-action="order-detail" data-order="${safe(order.order_number)}">
        <span class="order-card-main">
          <strong>${safe(order.product_name_snapshot)}</strong>
          <small>${safe(order.region_name_snapshot)} · ${safe(order.denomination_value)} ${safe(order.denomination_currency)}</small>
          <small>رقم الطلب: ${safe(order.order_number)}</small>
        </span>
        <span class="order-card-side">
          <strong>${formatLYD(order.selling_price_lyd)}</strong>
          <small class="order-status">${safe(orderStatusLabel(order.order_status))}</small>
          <small>${safe(formatDate(order.created_at))}</small>
        </span>
      </button>
    `;
  }

  function renderOrdersPage() {
    if (!authUiEnabled()) {
      hideAccountPage({ clear: true });
      showHomeAfterAccount();
      return;
    }

    const page = ensureAccountPage();
    hideOtherPagesForAccount();
    page.classList.add("active");

    if (!authState.user) {
      page.innerHTML = `
        <div class="container">
          <section class="account-card">
            <span class="account-kicker">Switches Orders</span>
            <h1>سجل دخولك أولًا</h1>
            <p>استخدم حساب Google لعرض طلباتك.</p>
            <button class="google-login-large" type="button" data-auth-action="login">
              <i class="fa-brands fa-google" aria-hidden="true"></i>
              المتابعة باستخدام Google
            </button>
          </section>
        </div>
      `;
      return;
    }

    if (ordersState.loading && !ordersState.list) {
      page.innerHTML = `
        <div class="container">
          <section class="account-card">
            <span class="account-kicker">Switches Orders</span>
            <h1>طلباتي</h1>
            <p>جاري تحميل الطلبات...</p>
          </section>
        </div>
      `;
      return;
    }

    const orders = ordersState.list || [];
    page.innerHTML = `
      <div class="container">
        <section class="account-card account-orders-card">
          <span class="account-kicker">Switches Orders</span>
          <h1>طلباتي</h1>
          ${ordersState.error ? `<p class="account-error">${safe(ordersState.error)}</p>` : ""}
          ${orders.length ? `<div class="orders-list">${orders.map(orderCard).join("")}</div>` : `
            <div class="orders-empty">
              <p>لا توجد طلبات حتى الآن.</p>
              <button class="gift-buy-btn" type="button" data-auth-action="browse-gift-cards">تصفح الكروت الدولية</button>
            </div>
          `}
        </section>
      </div>
    `;
  }

  function eventLabel(event) {
    return {
      ORDER_CREATED: "تم إنشاء الطلب",
      PAYMENT_PAID: "تم الدفع",
      PAYMENT_FAILED: "فشل الدفع",
      PAYMENT_PENDING: "الدفع قيد الانتظار",
      FULFILLMENT_STARTED: "بدأ تجهيز بطاقة الهدايا",
      PROVIDER_CONFIRMED: "تم تأكيد البطاقة من المورد",
      CARD_DELIVERED: "تم تسليم الكود",
      PROVIDER_FAILED: "تعذر تجهيز البطاقة",
      PROVIDER_TIMEOUT: "المورد لم يرد في الوقت المناسب",
      PROVIDER_OUT_OF_STOCK: "البطاقة غير متوفرة لدى المورد",
    }[event.event_type] || event.event_type;
  }

  function renderGiftCardCodeSection(order) {
    if (!order.gift_card_available) return "";
    const isVisible = ordersState.revealedCodes.has(order.order_number);
    const copied = ordersState.copiedOrderNumber === order.order_number;
    return `
      <div class="order-code-box">
        <div class="order-code-head">
          <div>
            <strong>كود بطاقة الهدايا</strong>
            ${order.provider_name === "mock_gift_cards" ? `<small>كود تجريبي غير صالح للاستخدام</small>` : ""}
          </div>
          <button class="gift-buy-btn secondary" type="button" data-auth-action="${isVisible ? "hide-code" : "show-code"}" data-order="${safe(order.order_number)}">
            ${isVisible ? "إخفاء الكود" : "إظهار الكود"}
          </button>
        </div>
        ${isVisible ? `
          <div class="order-code-value">${safe(order.gift_card_code || "")}</div>
          ${order.gift_card_serial ? `<small>Serial: ${safe(order.gift_card_serial)}</small>` : ""}
          <button class="gift-buy-btn" type="button" data-auth-action="copy-code" data-order="${safe(order.order_number)}">نسخ الكود</button>
          ${copied ? `<small class="order-copy-note">تم نسخ الكود ✓</small>` : ""}
        ` : ""}
      </div>
    `;
  }

  function renderOrderDetailPage(orderNumber) {
    if (!authUiEnabled()) {
      hideAccountPage({ clear: true });
      showHomeAfterAccount();
      return;
    }

    const page = ensureAccountPage();
    hideOtherPagesForAccount();
    page.classList.add("active");
    const order = ordersState.details.get(orderNumber);

    if (!authState.user) {
      renderOrdersPage();
      return;
    }

    if (ordersState.loading && !order) {
      page.innerHTML = `
        <div class="container">
          <section class="account-card">
            <button class="account-back" type="button" data-auth-action="orders"><i class="fas fa-arrow-right"></i> طلباتي</button>
            <h1>جاري تحميل تفاصيل الطلب</h1>
          </section>
        </div>
      `;
      return;
    }

    if (!order) {
      page.innerHTML = `
        <div class="container">
          <section class="account-card">
            <button class="account-back" type="button" data-auth-action="orders"><i class="fas fa-arrow-right"></i> طلباتي</button>
            <h1>تعذر العثور على الطلب</h1>
            <p>${safe(ordersState.error || "الطلب غير موجود.")}</p>
          </section>
        </div>
      `;
      return;
    }

    page.innerHTML = `
      <div class="container">
        <section class="account-card account-orders-card">
          <button class="account-back" type="button" data-auth-action="orders"><i class="fas fa-arrow-right"></i> طلباتي</button>
          <span class="account-kicker">Order Details</span>
          <h1>${safe(order.order_number)}</h1>
          <div class="order-detail-grid">
            <div><span>المنتج</span><strong>${safe(order.product_name_snapshot)}</strong></div>
            <div><span>Region</span><strong>${safe(order.region_name_snapshot)}</strong></div>
            <div><span>الفئة</span><strong>${safe(order.denomination_value)} ${safe(order.denomination_currency)}</strong></div>
            <div><span>السعر</span><strong>${formatLYD(order.selling_price_lyd)}</strong></div>
            <div><span>طريقة الدفع</span><strong>${safe(order.payment_method)}</strong></div>
            <div><span>حالة الدفع</span><strong>${safe(paymentStatusLabel(order.payment_status))}</strong></div>
            <div><span>حالة الطلب</span><strong>${safe(orderStatusLabel(order.order_status))}</strong></div>
            <div><span>Delivery Email</span><strong>${safe(order.delivery_email)}</strong></div>
            <div><span>التاريخ</span><strong>${safe(formatDate(order.created_at))}</strong></div>
          </div>
          ${renderGiftCardCodeSection(order)}
          <div class="order-timeline">
            <h2>سجل حالة الطلب</h2>
            ${(order.events || []).map((event) => `
              <div class="order-event">
                <span></span>
                <div>
                  <strong>${safe(eventLabel(event))}</strong>
                  <small>${safe(formatDate(event.created_at))}</small>
                </div>
              </div>
            `).join("")}
          </div>
        </section>
      </div>
    `;
  }

  function showOrders(push = true) {
    if (push && window.location.pathname !== "/account/orders") window.history.pushState({ page: "orders" }, "", "/account/orders");
    renderOrdersPage();
    loadOrders();
  }

  function showOrderDetail(orderNumber, push = true) {
    if (!orderNumber) return;
    const path = `/account/orders/${encodeURIComponent(orderNumber)}`;
    if (push && window.location.pathname !== path) window.history.pushState({ page: "order-detail", orderNumber }, "", path);
    renderOrderDetailPage(orderNumber);
    if (!ordersState.details.has(orderNumber)) loadOrderDetail(orderNumber);
  }

  function renderAccountRouteIfNeeded() {
    if (!authUiEnabled()) {
      hideAccountPage({ clear: true });
      return;
    }

    const path = normalizedPath();
    if (path === "/account") {
      renderAccountPage();
      return;
    }
    if (path === "/account/orders") {
      showOrders(false);
      return;
    }
    const orderNumber = routeOrderNumber();
    if (orderNumber) {
      showOrderDetail(orderNumber, false);
      return;
    }
    hideAccountPage({ clear: true });
  }

  function syncAccountRouteAfterNavigation() {
    window.setTimeout(renderAccountRouteIfNeeded, 0);
  }

  function installRouteGuard() {
    if (routeGuardInstalled) return;
    routeGuardInstalled = true;

    ["pushState", "replaceState"].forEach((method) => {
      const original = window.history[method];
      window.history[method] = function (...args) {
        const result = original.apply(this, args);
        syncAccountRouteAfterNavigation();
        return result;
      };
    });
  }

  function handleAuthAction(target) {
    if (!authUiEnabled()) return;
    const action = target.dataset.authAction;
    if (action === "login") loginWithGoogle(window.location.pathname === "/account" ? "/account" : currentPath());
    if (action === "logout") logout();
    if (action === "toggle-menu") {
      authState.menuOpen = !authState.menuOpen;
      renderAuthNav();
    }
    if (action === "account") {
      authState.menuOpen = false;
      renderAuthNav();
      showAccount();
    }
    if (action === "orders") {
      authState.menuOpen = false;
      renderAuthNav();
      showOrders();
    }
    if (action === "favorites") {
      authState.menuOpen = false;
      renderAuthNav();
      if (typeof window.showFavoritesPage === "function") window.showFavoritesPage();
      else window.location.href = "/account/favorites";
    }
    if (action === "order-detail") showOrderDetail(target.dataset.order);
    if (action === "show-code") {
      ordersState.revealedCodes.add(target.dataset.order);
      renderOrderDetailPage(target.dataset.order);
    }
    if (action === "hide-code") {
      ordersState.revealedCodes.delete(target.dataset.order);
      ordersState.copiedOrderNumber = "";
      renderOrderDetailPage(target.dataset.order);
    }
    if (action === "copy-code") {
      const orderNumber = target.dataset.order;
      const order = ordersState.details.get(orderNumber);
      const code = order?.gift_card_code || "";
      if (code && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code).then(() => {
          ordersState.copiedOrderNumber = orderNumber;
          renderOrderDetailPage(orderNumber);
        }).catch(() => {});
      }
    }
    if (action === "browse-gift-cards") {
      hideAccountPage({ clear: true });
      if (typeof window.showGiftCards === "function") window.showGiftCards();
      else window.location.href = "/gift-cards";
    }
  }

  function showAuthErrorIfPresent() {
    if (!authUiEnabled()) return;
    const params = new URLSearchParams(window.location.search);
    const error = params.get("auth_error");
    if (!error) return;
    const message = error === "missing_google_config"
      ? "لم يتم إعداد Google Login بعد. أضف مفاتيح Google في ملف البيئة ثم أعد تشغيل الخادم."
      : "تعذر إكمال تسجيل الدخول باستخدام Google.";
    window.setTimeout(() => {
      const notice = document.createElement("div");
      notice.className = "auth-error-toast";
      notice.textContent = message;
      document.body.appendChild(notice);
      window.setTimeout(() => notice.remove(), 6500);
    }, 250);
  }

  function installEvents() {
    document.addEventListener("click", (event) => {
      const authAction = event.target.closest("[data-auth-action]");
      if (authAction) {
        event.preventDefault();
        handleAuthAction(authAction);
        return;
      }
      if (!event.target.closest(".auth-user-menu") && authState.menuOpen) {
        authState.menuOpen = false;
        renderAuthNav();
      }
    });

    window.addEventListener("popstate", () => {
      renderAccountRouteIfNeeded();
      if (normalizedPath() === "/") {
        showHomeAfterAccount();
      }
    });
  }

  function install() {
    if (authUiEnabled()) ensureAuthNav();
    renderAuthNav();
    installEvents();
    installRouteGuard();
    showAuthErrorIfPresent();
    getCurrentUser();
  }

  window.SwitchesAuth = {
    getCurrentUser,
    getCachedUser,
    isLoaded,
    loginWithGoogle,
    logout,
    requireAuth,
    showAccount,
    showOrders,
    showOrderDetail,
    safeReturnTo,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
