(function () {
  let GIFT_CARD_PLATFORMS = [];
  let STORE_VISUALS = {};
  const GIFT_CATALOG_URL = "/data/gift-cards.json";
  const STORE_VISUALS_URL = "/data/store-visuals.json";
  let catalogLoadError = false;
  let giftCatalogSource = "fallback";

  const PAYMENT_METHODS = [
    { id: "bank-card", name: "البطاقة المصرفية", status: "available" },
  ];
  const LIVE_GIFT_PLATFORMS = new Set(["playstation", "xbox"]);
  const GIFT_STATIC_REGION = { id: "us", name: "United States", label: "أمريكي", flag: "🇺🇸", currency: "USD", available: true };
  const GIFT_DENOMINATION_VALUES = {
    playstation: [25, 30, 40, 50, 60, 70, 75, 80, 90, 100, 125, 150, 175, 200, 225, 250],
    xbox: [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100],
  };
  const DEFAULT_HIGHLIGHT_VALUE = "50";
  const WHATSAPP_PURCHASE_PHONE = "218931853169";

  class MockPaymentProvider {
    process({ result = "success", payload = {} } = {}) {
      return new Promise((resolve) => {
        window.setTimeout(() => {
          const normalizedResult = ["success", "failed", "pending"].includes(result) ? result : "success";
          resolve({
            status: normalizedResult,
            provider: "mock",
            reference: `MOCK-${Date.now()}`,
            payload,
          });
        }, 850);
      });
    }
  }

  const detailState = {};
  const checkoutState = {
    selectedPaymentMethod: "bank-card",
    mockResult: "success",
    processing: false,
    form: {},
    card: {},
    acceptedTerms: false,
    activeTermsModal: "",
    securityHintVisible: false,
    references: {},
    errors: {},
    result: null,
    successOrder: null,
    loadingOrderNumber: "",
    pollingOrderNumber: "",
    pollCount: 0,
    pollTimer: 0,
    accountPrefillSub: "",
  };
  const paymentProvider = new MockPaymentProvider();
  let originalShowAllProducts = null;
  let originalShowMainPage = null;
  let waveObserver = null;

  function safe(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pickValue(source, ...keys) {
    const object = source && typeof source === "object" ? source : {};
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(object, key)) return object[key];
    }
    return undefined;
  }

  function publicSettings() {
    return window.SwitchesStoreSettings && typeof window.SwitchesStoreSettings === "object" ? window.SwitchesStoreSettings : {};
  }

  function validRemoteImageUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    try {
      const url = new URL(trimmed);
      return url.protocol === "http:" || url.protocol === "https:" ? trimmed : "";
    } catch {
      return "";
    }
  }

  function validFallbackImageUrl(value) {
    const trimmed = String(value || "").trim();
    if (/^\/(assets|data)\//.test(trimmed)) return trimmed;
    return validRemoteImageUrl(trimmed);
  }

  function visualValue(...keys) {
    let current = STORE_VISUALS;
    for (const key of keys) {
      if (!current || typeof current !== "object") return "";
      current = current[key];
    }
    return validFallbackImageUrl(current);
  }

  function giftCardImageKey(platformId) {
    return `gift_card_image_${String(platformId || "").replace(/-/g, "_")}`;
  }

  function modeButtonFallbackImage(mode) {
    return mode === "products"
      ? visualValue("modeButtons", "products", "backgroundUrl")
      : visualValue("modeButtons", "giftCards", "backgroundUrl");
  }

  function modeButtonImage(mode) {
    const settings = publicSettings();
    if (mode === "products") {
      return validRemoteImageUrl(pickValue(settings, "mode_button_pc_background_url", "modeButtonPcBackgroundUrl"))
        || modeButtonFallbackImage(mode);
    }
    return validRemoteImageUrl(pickValue(settings, "mode_button_gift_background_url", "modeButtonGiftBackgroundUrl"))
      || modeButtonFallbackImage(mode);
  }

  function platformFallbackImageSource(platform) {
    return validFallbackImageUrl(platform.imageUrl) || visualValue("giftCards", platform.id, "imageUrl");
  }

  function platformImageSource(platform) {
    if (platform?.managedGiftCard) return validFallbackImageUrl(platform.imageUrl) || platformFallbackImageSource(platform);
    const settings = publicSettings();
    const nested = settings.gift_card_images && typeof settings.gift_card_images === "object" ? settings.gift_card_images[platform.id] : "";
    const camelNested = settings.giftCardImages && typeof settings.giftCardImages === "object" ? settings.giftCardImages[platform.id] : "";
    return validRemoteImageUrl(pickValue(settings, giftCardImageKey(platform.id)))
      || validRemoteImageUrl(nested)
      || validRemoteImageUrl(camelNested)
      || platformFallbackImageSource(platform);
  }

  function cssUrlValue(url) {
    return `url("${String(url || "").replace(/["\\]/g, "\\$&")}")`;
  }

  function modeButtonStyle(mode) {
    const image = modeButtonImage(mode);
    const fallback = modeButtonFallbackImage(mode) || image;
    if (!image && !fallback) return "";
    return ` style="--store-mode-bg:${safe(cssUrlValue(image || fallback))};--store-mode-fallback-bg:${safe(cssUrlValue(fallback || image))}"`;
  }

  async function loadGiftCatalog() {
    if (window.SwitchesSupabaseStore?.configured?.() && typeof window.SwitchesSupabaseStore.loadGiftCards === "function") {
      try {
        const platforms = await window.SwitchesSupabaseStore.loadGiftCards();
        if (Array.isArray(platforms) && platforms.length) {
          GIFT_CARD_PLATFORMS = platforms;
          catalogLoadError = false;
          giftCatalogSource = "supabase";
          return;
        }
      } catch (error) {
        console.warn("Switches Store: Supabase Gift Cards unavailable; using fallback catalog.", error);
      }
    }

    try {
      const response = await fetch(GIFT_CATALOG_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("catalog_load_failed");
      const catalog = await response.json();
      GIFT_CARD_PLATFORMS = Array.isArray(catalog.platforms) ? catalog.platforms : [];
      catalogLoadError = !GIFT_CARD_PLATFORMS.length;
      giftCatalogSource = "fallback";
    } catch {
      GIFT_CARD_PLATFORMS = [];
      catalogLoadError = true;
      giftCatalogSource = "fallback";
    }
  }

  async function loadStoreVisuals() {
    try {
      const response = await fetch(STORE_VISUALS_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("visuals_load_failed");
      const visuals = await response.json();
      STORE_VISUALS = visuals && typeof visuals === "object" ? visuals : {};
    } catch {
      STORE_VISUALS = {};
    }
  }

  function authService() {
    return window.SwitchesAuth || null;
  }

  function authUiEnabled() {
    return window.SwitchesFeatureFlags?.AUTH_UI_ENABLED !== false;
  }

  function currentAuthUser() {
    return authService()?.getCachedUser?.() || null;
  }

  function checkoutAuthPending() {
    const service = authService();
    return Boolean(service?.isLoaded && !service.isLoaded());
  }

  function safeInternalReturnPath(value) {
    try {
      const url = new URL(value || "/", window.location.origin);
      if (url.origin !== window.location.origin) return "/";
      const path = `${url.pathname}${url.search}`;
      if (path === "/" || path.startsWith("/gift-cards") || path.startsWith("/checkout") || path.startsWith("/account")) return path;
    } catch {
      return "/";
    }
    return "/";
  }

  function loginForCheckout(returnTo) {
    if (!authUiEnabled()) return;
    const path = safeInternalReturnPath(returnTo);
    const service = authService();
    if (service?.loginWithGoogle) {
      service.loginWithGoogle(path);
      return;
    }
    window.location.href = `/auth/google?returnTo=${encodeURIComponent(path)}`;
  }

  function normalizedPath() {
    const path = window.location.pathname.replace(/\/+$/, "");
    return path || "/";
  }

  function isCheckoutRoute() {
    const path = normalizedPath();
    return path === "/checkout" || path === "/checkout/success" || window.location.hash.startsWith("#/checkout");
  }

  function isCheckoutSuccessRoute() {
    const path = normalizedPath();
    return path === "/checkout/success" || window.location.hash.startsWith("#/checkout/success");
  }

  function isGiftCardsRoute() {
    return normalizedPath() === "/gift-cards" || normalizedPath().startsWith("/gift-cards/") || window.location.hash.startsWith("#/gift-cards");
  }

  function routePlatformId() {
    const path = normalizedPath();
    if (path.startsWith("/gift-cards/")) return decodeURIComponent(path.slice("/gift-cards/".length)).split("/")[0];
    if (window.location.hash.startsWith("#/gift-cards/")) return decodeURIComponent(window.location.hash.slice("#/gift-cards/".length)).split("/")[0];
    return "";
  }

  function activeModeFromRoute() {
    return isGiftCardsRoute() || isCheckoutRoute() ? "gift-cards" : "products";
  }

  function findPlatform(id) {
    return GIFT_CARD_PLATFORMS.find((platform) => platform.id === id) || null;
  }

  function isLiveGiftPlatform(platformOrId) {
    const id = typeof platformOrId === "string" ? platformOrId : platformOrId?.id;
    const platform = typeof platformOrId === "string" ? findPlatform(platformOrId) : platformOrId;
    if (platform?.managedGiftCard) return platform.status === "AVAILABLE";
    return LIVE_GIFT_PLATFORMS.has(id);
  }

  function giftPriceLYD(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    if (amount <= 15) return amount * 10.8;
    if (amount <= 25) return amount * 10.7;
    if (amount <= 50) return amount * 10.5;
    if (amount <= 100) return amount * 10.3;
    return amount * 10.25;
  }

  function liveDenominations(platformId) {
    const platform = typeof platformId === "string" ? findPlatform(platformId) : platformId;
    if (platform?.managedGiftCard) {
      return (platform.regions?.[0]?.denominations || []).map((item) => ({
        ...item,
        available: item.available !== false && item.isAvailable !== false,
      }));
    }
    const id = typeof platformId === "string" ? platformId : platformId?.id;
    return (GIFT_DENOMINATION_VALUES[id] || []).map((value) => ({
      value,
      sellingPriceLYD: giftPriceLYD(value),
      available: true,
    }));
  }

  function giftHighlightSettings() {
    const settings = publicSettings();
    return {
      enabled: pickValue(settings, "gift_card_highlight_enabled", "giftCardHighlightEnabled") !== false && String(pickValue(settings, "gift_card_highlight_enabled", "giftCardHighlightEnabled") ?? "1") !== "0",
      playstation: String(pickValue(settings, "gift_card_highlight_playstation", "giftCardHighlightPlaystation") || DEFAULT_HIGHLIGHT_VALUE),
      xbox: String(pickValue(settings, "gift_card_highlight_xbox", "giftCardHighlightXbox") || DEFAULT_HIGHLIGHT_VALUE),
    };
  }

  function isHighlightedDenomination(platformId, value) {
    const platform = findPlatform(platformId);
    if (platform?.managedGiftCard) {
      const denomination = liveDenominations(platform).find((item) => denominationKey(item) === String(value));
      return denomination?.highlightEffect === "flame";
    }
    const settings = giftHighlightSettings();
    if (!settings.enabled) return false;
    return String(value) === String(settings[platformId] || DEFAULT_HIGHLIGHT_VALUE);
  }

  function whatsappPurchaseNumber() {
    const configured = String(pickValue(publicSettings(), "gift_cards_whatsapp_purchase_number", "giftCardsWhatsappPurchaseNumber") || "").replace(/[^\d]/g, "");
    return configured || WHATSAPP_PURCHASE_PHONE;
  }

  function availableRegions(platform) {
    return (platform?.regions || []).filter((region) => region.available);
  }

  function currencyLabel(currency) {
    return ({ USD: "$", GBP: "£" })[currency] || currency;
  }

  function formatDenomination(denomination, currency) {
    const symbol = currencyLabel(currency);
    if (symbol === "$" || symbol === "£") return `${symbol}${denomination.value}`;
    return `${denomination.value} ${symbol}`;
  }

  function formatLYD(value) {
    return `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} د.ل`;
  }

  function denominationKey(denomination) {
    return String(denomination.value);
  }

  function findPaymentMethod(methodId) {
    return PAYMENT_METHODS.find((method) => method.id === methodId) || null;
  }

  function isPaymentSelectable(method) {
    return method?.status === "available";
  }

  function checkoutParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      platformId: params.get("product") || params.get("platform") || "",
      regionId: params.get("region") || "",
      value: params.get("value") || "",
      methodId: params.get("method") || "",
      reference: params.get("ref") || "",
      orderNumber: params.get("order") || "",
    };
  }

  function checkoutSelection() {
    const params = checkoutParams();
    const platform = findPlatform(params.platformId);
    const region = platform?.regions.find((item) => item.id === params.regionId && item.available) || null;
    const denomination = region?.denominations.find((item) => denominationKey(item) === String(params.value) && item.available) || null;
    return {
      ...params,
      platform,
      region,
      denomination,
      valid: Boolean(platform?.available && region && denomination),
    };
  }

  function checkoutPath(selection) {
    const query = new URLSearchParams();
    query.set("product", selection.platformId);
    query.set("region", selection.regionId);
    query.set("value", selection.value);
    return `/checkout?${query.toString()}`;
  }

  function prefillCheckoutFromAccount() {
    const user = currentAuthUser();
    if (!user) return;

    const userKey = user.sub || user.email || "google";
    if (checkoutState.accountPrefillSub === userKey) return;

    const hadPreviousAccountPrefill = Boolean(checkoutState.accountPrefillSub);
    if ((hadPreviousAccountPrefill || !String(checkoutState.form.fullName || "").trim()) && user.name) {
      checkoutState.form.fullName = user.name;
    }
    if ((hadPreviousAccountPrefill || !String(checkoutState.form.email || "").trim()) && user.email) {
      checkoutState.form.email = user.email;
    }
    checkoutState.accountPrefillSub = userKey;
  }

  function checkoutSuccessPath(selection, orderNumber) {
    const query = new URLSearchParams();
    query.set("product", selection.platformId);
    query.set("region", selection.regionId);
    query.set("value", selection.value);
    query.set("order", orderNumber);
    return `/checkout/success?${query.toString()}`;
  }

  function detailPath(selection) {
    const query = new URLSearchParams();
    if (selection.regionId) query.set("region", selection.regionId);
    if (selection.value) query.set("value", selection.value);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return `/gift-cards/${selection.platformId}${suffix}`;
  }

  function checkoutTotals(selection) {
    const subtotal = Number(selection.denomination?.sellingPriceLYD || 0);
    const paymentFee = 0;
    const discount = 0;
    return {
      subtotal,
      paymentFee,
      discount,
      finalTotal: subtotal + paymentFee - discount,
    };
  }

  function isDevelopmentCheckout() {
    return ["127.0.0.1", "localhost", ""].includes(window.location.hostname);
  }

  function selectionKey(selection) {
    return [selection.platformId, selection.regionId, selection.value].join(":");
  }

  function generateCheckoutReference() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(12);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 255); });
    return `GSH${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
  }

  function generateCheckoutAttemptId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function checkoutAttemptStorageKey(selection) {
    return `switches_checkout_attempt:${selectionKey(selection)}`;
  }

  function getCheckoutAttemptId(selection) {
    const key = checkoutAttemptStorageKey(selection);
    try {
      let attemptId = window.sessionStorage.getItem(key);
      if (!attemptId) {
        attemptId = generateCheckoutAttemptId();
        window.sessionStorage.setItem(key, attemptId);
      }
      return attemptId;
    } catch {
      return generateCheckoutAttemptId();
    }
  }

  function clearCheckoutAttempt(selection) {
    try {
      window.sessionStorage.removeItem(checkoutAttemptStorageKey(selection));
    } catch {}
  }

  function getCheckoutReference(selection) {
    const params = checkoutParams();
    if (/^GSH[A-Z0-9]{8,18}$/.test(params.reference)) return params.reference;
    const key = selectionKey(selection);
    if (!checkoutState.references[key]) checkoutState.references[key] = generateCheckoutReference();
    return checkoutState.references[key];
  }

  function formatCardNumber(value) {
    return String(value || "")
      .replace(/\D/g, "")
      .slice(0, 19)
      .replace(/(.{4})/g, "$1 ")
      .trim();
  }

  function cardDigits() {
    return String(checkoutState.card.cardNumber || "").replace(/\D/g, "");
  }

  function currentYear() {
    return new Date().getFullYear();
  }

  function monthOptions() {
    return Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
  }

  function yearOptions() {
    const year = currentYear();
    return Array.from({ length: 12 }, (_, index) => String(year + index));
  }

  function checkoutMockResult() {
    const result = new URLSearchParams(window.location.search).get("mockResult") || checkoutState.mockResult;
    return isDevelopmentCheckout() && ["success", "failed", "pending"].includes(result) ? result : "success";
  }

  function orderResultStatus(order) {
    if (!order) return "failed";
    if (order.payment_status === "PAID") return "success";
    if (order.payment_status === "FAILED") return "failed";
    return "pending";
  }

  async function createOrder(selection) {
    const response = await fetch("/api/orders", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "SwitchesStore",
      },
      body: JSON.stringify({
        product_id: selection.platformId,
        region_id: selection.regionId,
        denomination_value: selection.value,
        customer_name: checkoutState.form.fullName,
        customer_phone: checkoutState.form.phone,
        delivery_email: checkoutState.form.email,
        payment_method: "bank_card",
        checkout_attempt_id: getCheckoutAttemptId(selection),
        mock_result: checkoutMockResult(),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.order) {
      const error = new Error(data.error || "order_create_failed");
      error.details = data;
      throw error;
    }
    return data.order;
  }

  async function fetchOrder(orderNumber) {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.order) throw new Error(data.error || "order_load_failed");
    return data.order;
  }

  function checkoutReady() {
    if (!currentAuthUser()) return false;

    const form = checkoutState.form;
    const card = checkoutState.card;
    const phone = String(form.phone || "").replace(/[\s-]/g, "");
    const email = String(form.email || "");
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const year = Number(card.expYear || 0);
    const month = Number(card.expMonth || 0);
    const now = new Date();
    const isFutureExpiry = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);

    return Boolean(
      String(form.fullName || "").trim().length >= 3 &&
      /^\+?\d{8,15}$/.test(phone) &&
      emailPattern.test(email) &&
      /^\d{12,19}$/.test(cardDigits()) &&
      month >= 1 &&
      month <= 12 &&
      year >= now.getFullYear() &&
      isFutureExpiry &&
      /^\d{3,4}$/.test(String(card.cvv || "")) &&
      checkoutState.acceptedTerms
    );
  }

  const TERMS_CONTENT = {
    gift: {
      title: "شروط وأحكام بطاقة الهدايا",
      body: "سيتم إضافة المحتوى قريبًا.",
    },
    general: {
      title: "الشروط والأحكام العامة",
      body: "سيتم إضافة المحتوى قريبًا.",
    },
    privacy: {
      title: "سياسة الخصوصية",
      body: "سيتم إضافة المحتوى قريبًا.",
    },
  };

  function switchHtml() {
    const active = activeModeFromRoute();
    return `
      <div class="store-mode-switch" role="tablist" aria-label="التنقل بين أقسام المتجر">
        <button type="button" class="store-mode-card store-mode-gift ${active === "gift-cards" ? "active" : ""}" data-store-mode="gift-cards" role="tab" aria-selected="${active === "gift-cards"}"${modeButtonStyle("gift-cards")}>
          <span class="store-mode-icon"><i class="fa-brands fa-playstation" aria-hidden="true"></i></span>
          <span class="store-mode-label">Gift Card</span>
        </button>
        <button type="button" class="store-mode-card store-mode-products ${active === "products" ? "active" : ""}" data-store-mode="products" role="tab" aria-selected="${active === "products"}"${modeButtonStyle("products")}>
          <span class="store-mode-icon"><i class="fas fa-microchip" aria-hidden="true"></i></span>
          <span class="store-mode-label">PC PARTS</span>
        </button>
      </div>
    `;
  }

  function syncSwitchActive() {
    const active = activeModeFromRoute();
    document.querySelectorAll(".store-mode-switch").forEach((switcher) => {
      switcher.querySelectorAll("[data-store-mode]").forEach((button) => {
        const isActive = button.dataset.storeMode === active;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      });
    });
  }

  function refreshModeSwitches() {
    ["homeStoreModeSwitch", "allProductsStoreModeSwitch", "giftCardsTopSwitch"].forEach((id) => {
      const holder = document.getElementById(id);
      if (holder) holder.innerHTML = switchHtml();
    });
    syncSwitchActive();
  }

  function refreshVisualSettings() {
    refreshModeSwitches();
    if (!GIFT_CARD_PLATFORMS.length && !catalogLoadError) return;
    if (isCheckoutRoute()) renderCheckoutRoute();
    else if (isGiftCardsRoute()) renderGiftCardsPage();
  }

  function ensureModeSwitches() {
    const features = document.querySelector(".features");
    if (features && !document.getElementById("homeStoreModeSwitch")) {
      const holder = document.createElement("div");
      holder.id = "homeStoreModeSwitch";
      holder.innerHTML = switchHtml();
      features.insertAdjacentElement("afterend", holder);
    }

    const pageHeader = document.querySelector("#allProductsPage .page-header");
    if (pageHeader && !document.getElementById("allProductsStoreModeSwitch")) {
      const holder = document.createElement("div");
      holder.id = "allProductsStoreModeSwitch";
      holder.innerHTML = switchHtml();
      pageHeader.insertAdjacentElement("afterend", holder);
    }

    syncSwitchActive();
  }

  function ensureGiftCardsPage() {
    let page = document.getElementById("giftCardsPage");
    if (page) return page;

    page = document.createElement("div");
    page.id = "giftCardsPage";
    page.className = "gift-cards-page";
    page.innerHTML = `
      <div class="container">
        <div id="giftCardsTopSwitch">${switchHtml()}</div>
        <div id="giftCardsContent"></div>
      </div>
    `;

    const footer = document.querySelector("footer");
    if (footer) footer.insertAdjacentElement("beforebegin", page);
    else document.body.appendChild(page);
    return page;
  }

  function hideGiftCardsPage() {
    document.getElementById("giftCardsPage")?.classList.remove("active");
  }

  function renderGiftHeader() {
    return `
      <section class="gift-head">
        <h1 class="gift-title">Pick a card!</h1>
      </section>
    `;
  }

  function currencySymbol(currency) {
    return {
      USD: "$",
      GBP: "£",
      EUR: "€",
      AED: "د.إ ",
      SAR: "ر.س ",
    }[currency] || `${currency} `;
  }

  function platformPriceRange(platform) {
    if (isLiveGiftPlatform(platform)) {
      const denominations = liveDenominations(platform).filter((item) => item.available !== false);
      const values = denominations.map((item) => Number(item.value)).filter(Number.isFinite);
      if (values.length) {
        const currency = denominations[0]?.currency || platform.currency || "USD";
        const symbol = currencySymbol(currency);
        return `${symbol}${Math.min(...values)} - ${symbol}${Math.max(...values)}`;
      }
    }
    const values = [];
    (platform.regions || []).forEach((region) => {
      (region.denominations || []).forEach((denomination) => {
        const value = Number(denomination.value);
        if (!Number.isNaN(value)) values.push({ value, currency: region.currency || "USD" });
      });
    });

    const usdValues = values.filter((item) => item.currency === "USD");
    const selected = usdValues.length ? usdValues : values;
    if (!selected.length) return "Coming soon";

    const min = Math.min(...selected.map((item) => item.value));
    const max = Math.max(...selected.map((item) => item.value));
    const symbol = currencySymbol(selected[0].currency);
    return `${symbol}${min} - ${symbol}${max}`;
  }

  function platformCardTitle(platform) {
    return ({
      playstation: "PSN Gift Cards",
      steam: "Steam Gift Cards",
      apple: "Apple Gift Cards",
      "google-play": "Google Play Gift Cards",
      xbox: "Xbox Gift Cards",
      amazon: "Amazon Gift Cards",
    }[platform.id] || `${platform.shortName || platform.name} Gift Cards`);
  }

  function giftPlatformsForDisplay() {
    const preferredOrder = ["steam", "playstation", "xbox", "apple", "amazon", "google-play"];
    return [...GIFT_CARD_PLATFORMS].filter((platform) => platform.status !== "HIDDEN").sort((a, b) => {
      const order = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
      if (order) return order;
      const aIndex = preferredOrder.indexOf(a.id);
      const bIndex = preferredOrder.indexOf(b.id);
      return (aIndex === -1 ? preferredOrder.length : aIndex) - (bIndex === -1 ? preferredOrder.length : bIndex);
    });
  }

  function giftPlatformStatus(platform) {
    if (!platform?.managedGiftCard) return isLiveGiftPlatform(platform) ? "AVAILABLE" : "COMING_SOON";
    return platform.status || "AVAILABLE";
  }

  function giftPlatformStatusLabel(platform) {
    return ({
      AVAILABLE: "متوفر",
      COMING_SOON: "قريبًا",
      UNAVAILABLE: "غير متوفر",
      HIDDEN: "مخفي",
    })[giftPlatformStatus(platform)] || "متوفر";
  }

  function renderCardArt(platform, modifier = "") {
    const imageSrc = platformImageSource(platform);
    const fallbackSrc = platformFallbackImageSource(platform);
    return `
      <div class="gift-platform-art gift-brand-${safe(platform.id)} ${imageSrc ? "has-image" : ""} ${modifier}" aria-hidden="true">
        ${imageSrc ? `
          <img class="gift-platform-image" src="${safe(imageSrc)}" data-fallback-src="${safe(fallbackSrc)}" alt="" loading="lazy">
        ` : `
          <span class="gift-art-glow"></span>
          <div class="gift-platform-mark">
            <i class="${safe(platform.iconClass)}"></i>
          </div>
          <span class="gift-platform-name">${safe(platform.shortName || platform.name)}</span>
        `}
      </div>
    `;
  }

  function renderGiftCard(platform, index) {
    const delay = (index % 4) * 65;
    const live = isLiveGiftPlatform(platform);
    const status = giftPlatformStatus(platform);
    const disabled = !live;
    const title = live ? `عرض تفاصيل ${platform.name}` : `${platform.name} ${giftPlatformStatusLabel(platform)}`;
    return `
      <article class="gift-platform-card gift-wave-item ${disabled ? "coming-soon" : ""} ${status === "UNAVAILABLE" ? "unavailable" : ""}" ${live ? `role="button" tabindex="0" data-gift-action="open-platform" data-platform="${safe(platform.id)}"` : `aria-disabled="true"`} aria-label="${safe(title)}" title="${live ? "" : giftPlatformStatusLabel(platform)}" style="--gift-accent:${safe(platform.accent)};--wave-delay:${delay}ms">
        ${live ? "" : `<span class="gift-coming-soon-badge">${safe(giftPlatformStatusLabel(platform))}</span>`}
        ${renderCardArt(platform)}
        <div class="gift-card-copy">
          <h3>${safe(platformCardTitle(platform))}</h3>
          <p class="gift-card-range">${live ? safe(platformPriceRange(platform)) : safe(giftPlatformStatusLabel(platform))}</p>
        </div>
      </article>
    `;
  }

  function primaryGiftRegion(platform) {
    if (!platform?.managedGiftCard) return GIFT_STATIC_REGION;
    return availableRegions(platform)[0] || platform.regions?.[0] || {
      id: String(platform.regionCode || "US").toLowerCase(),
      name: platform.regionLabel || "ريجن أمريكي",
      label: platform.regionLabel || "ريجن أمريكي",
      flag: "",
      currency: platform.currency || "USD",
      available: platform.status === "AVAILABLE",
      denominations: platform.denominations || [],
    };
  }

  function selectionFor(platform) {
    const params = new URLSearchParams(window.location.search);
    const stored = detailState[platform.id] || {};
    if (isLiveGiftPlatform(platform)) {
      let value = stored.value || params.get("value") || "";
      const liveRegion = primaryGiftRegion(platform);
      const denominations = liveDenominations(platform);
      const denomination = denominations.find((item) => denominationKey(item) === String(value) && item.available) || null;
      value = denomination ? denominationKey(denomination) : "";
      return {
        regionId: liveRegion.id,
        value,
        region: { ...liveRegion, denominations },
        denomination,
        notice: stored.notice || "",
      };
    }

    let regionId = stored.regionId || params.get("region") || "";
    let value = stored.value || params.get("value") || "";
    const regions = platform.regions || [];
    const hasRegion = regions.some((region) => region.id === regionId && region.available);
    if (!hasRegion) regionId = availableRegions(platform)[0]?.id || "";

    const region = regions.find((item) => item.id === regionId) || null;
    const denomination = region?.denominations.find((item) => denominationKey(item) === String(value) && item.available) || null;
    value = denomination ? denominationKey(denomination) : "";
    return { regionId, value, region, denomination, notice: stored.notice || "" };
  }

  function updateDetailRoute(platform, selection) {
    const query = new URLSearchParams();
    if (selection.regionId) query.set("region", selection.regionId);
    if (selection.value) query.set("value", selection.value);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    window.history.replaceState({ page: "gift-card-detail", platform: platform.id }, "", `/gift-cards/${platform.id}${suffix}`);
  }

  function renderRegionButtons(platform, selection) {
    return (platform.regions || []).map((region) => `
      <button class="gift-option-btn ${selection.regionId === region.id ? "active" : ""}" type="button" data-gift-action="select-region" data-platform="${safe(platform.id)}" data-region="${safe(region.id)}" ${region.available ? "" : "disabled"} aria-pressed="${selection.regionId === region.id}">
        <span>${safe(region.flag)} ${safe(region.label)}</span>
        <small>${safe(region.currency)}</small>
      </button>
    `).join("");
  }

  function renderDenominationButtons(platform, selection) {
    if (!selection.region) {
      return `<div class="gift-option-placeholder">الفئات غير متاحة حاليًا.</div>`;
    }

    return selection.region.denominations.map((denomination) => {
      const key = denominationKey(denomination);
      const active = selection.value === key;
      const flame = denomination.highlightEffect === "flame" || isHighlightedDenomination(platform.id, key);
      const mostPopular = denomination.isMostPopular === true || (!platform?.managedGiftCard && flame);
      const available = denomination.available !== false && denomination.isAvailable !== false;
      return `
        <button class="gift-denomination-btn ${active ? "active" : ""} ${flame ? "highlighted flame-highlight" : ""}" type="button" data-gift-action="select-denomination" data-platform="${safe(platform.id)}" data-region="${safe(selection.region.id)}" data-value="${safe(key)}" ${available ? "" : "disabled"} aria-pressed="${active}">
          <strong>${safe(formatDenomination(denomination, selection.region.currency))}</strong>
          ${mostPopular ? `<span class="gift-hot-label">الأكثر طلبًا</span>` : ""}
          ${available ? "" : `<span class="gift-unavailable-label">غير متوفر</span>`}
        </button>
      `;
    }).join("");
  }

  function renderCurrentGiftPrice(selection) {
    if (!selection.denomination) {
      return `
        <div class="gift-current-price pending" aria-live="polite">
          <span>السعر الحالي</span>
          <strong>اختر الفئة</strong>
        </div>
      `;
    }
    return `
      <div class="gift-current-price" aria-live="polite">
        <span>السعر الحالي</span>
        <strong>${formatLYD(selection.denomination.sellingPriceLYD)}</strong>
      </div>
    `;
  }

  function giftWhatsappMessage(platform, selection) {
    const denominationText = selection.denomination ? formatDenomination(selection.denomination, selection.region.currency) : "";
    const priceText = selection.denomination ? formatLYD(selection.denomination.sellingPriceLYD) : "";
    return [
      "السلام عليكم",
      `أريد شراء كرت ${platform.name}`,
      "",
      `الريجن: ${selection.region?.label || GIFT_STATIC_REGION.label}`,
      `الفئة: ${denominationText}`,
      `السعر الحالي: ${priceText}`,
      "",
      "أريد إتمام الطلب",
    ].join("\n");
  }

  function giftWhatsappUrl(platform, selection) {
    const message = encodeURIComponent(giftWhatsappMessage(platform, selection));
    const number = whatsappPurchaseNumber();
    return `https://wa.me/${number}?text=${message}`;
  }

  function openWhatsappPurchase(platformId) {
    const platform = findPlatform(platformId);
    if (!platform) return;
    const selection = selectionFor(platform);
    if (!selection.denomination) {
      window.alert("اختر الفئة أولًا");
      return;
    }
    window.open(giftWhatsappUrl(platform, selection), "_blank", "noopener");
  }

  function renderGiftNotes() {
    return `
      <div class="gift-direct-notes">
        <p><i class="fas fa-circle-info" aria-hidden="true"></i> السعر يتغير كل لحظة ويتم احتساب السعر النهائي وقت الشراء فقط</p>
        <p><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> إتمام عملية الشراء تتم داخل واتساب المتجر فقط حسب طريقة الدفع ( حوالة - كاش )</p>
      </div>
    `;
  }

  function renderGiftDetail(platform) {
    const selection = selectionFor(platform);
    const canBuy = Boolean(isLiveGiftPlatform(platform) && platform.available !== false && selection.region && selection.denomination);
    const background = validFallbackImageUrl(platform.backgroundUrl);
    const detailStyle = `--gift-accent:${safe(platform.accent)}${background ? `;--gift-detail-bg:${safe(cssUrlValue(background))}` : ""}`;
    return `
      <section class="gift-detail-view" style="${detailStyle}">
        <nav class="gift-breadcrumb" aria-label="مسار التنقل">
          <button type="button" data-gift-action="back-to-gift-cards"><i class="fas fa-arrow-right"></i> العودة للكروت الدولية</button>
          <span>الكروت الدولية</span>
          <span>${safe(platform.shortName || platform.name)}</span>
        </nav>

        <div class="gift-detail-layout">
          <div class="gift-detail-visual gift-detail-motion">
            ${renderCardArt(platform, "large")}
            <div class="gift-fixed-region">${safe(selection.region?.label || GIFT_STATIC_REGION.label)}</div>
            ${renderCurrentGiftPrice(selection)}
            ${renderGiftNotes()}
            <button class="gift-buy-btn gift-whatsapp-buy ${canBuy ? "" : "pending"}" type="button" data-gift-action="open-whatsapp-purchase" data-platform="${safe(platform.id)}">
              <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
              الشراء
            </button>
          </div>

          <article class="gift-detail-panel gift-detail-motion">
            <span class="gift-status ${canBuy ? "available" : "unavailable"}">${safe(giftPlatformStatusLabel(platform))}</span>
            <h1>${safe(platform.name)}</h1>

            <section class="gift-choice-block">
              <div class="gift-choice-head">
                <h2>الفئات المتوفرة</h2>
              </div>
              <div class="gift-denomination-grid">${renderDenominationButtons(platform, selection)}</div>
            </section>
          </article>
        </div>
      </section>
    `;
  }

  function renderPlatformComingSoon(platform) {
    const statusLabel = giftPlatformStatusLabel(platform);
    const message = giftPlatformStatus(platform) === "UNAVAILABLE"
      ? "هذا الكرت غير متوفر حاليًا ولا يمكن شراؤه."
      : "هذا الكرت قريبًا وغير متاح للشراء حاليًا.";
    return `
      <section class="gift-not-found gift-platform-coming-soon">
        <h1>${safe(platformCardTitle(platform))}</h1>
        <p>${safe(message)}</p>
        <span class="gift-status unavailable">${safe(statusLabel)}</span>
        <button class="gift-buy-btn secondary" type="button" data-gift-action="back-to-gift-cards">العودة للكروت الدولية</button>
      </section>
    `;
  }

  function renderNotFound(platformId) {
    return `
      <section class="gift-not-found">
        <h1>الكرت غير موجود</h1>
        <p>لم نتمكن من العثور على "${safe(platformId)}" ضمن الكروت الدولية الحالية.</p>
        <button class="gift-buy-btn secondary" type="button" data-gift-action="back-to-gift-cards">العودة إلى الكروت الدولية</button>
      </section>
    `;
  }

  function renderCheckoutInvalid() {
    return `
      <section class="gift-not-found gift-checkout-invalid">
        <h1>تعذر العثور على المنتج أو الاختيار المطلوب.</h1>
        <p>تحقق من رابط المنتج أو ارجع إلى الكروت الدولية واختر الكرت والمنطقة والفئة مرة أخرى.</p>
        <button class="gift-buy-btn secondary" type="button" data-gift-action="back-to-gift-cards">العودة إلى الكروت الدولية</button>
      </section>
    `;
  }

  function renderCatalogError() {
    return `
      <section class="gift-not-found">
        <h1>تعذر تحميل الكروت الدولية</h1>
        <p>حاول تحديث الصفحة بعد لحظات.</p>
      </section>
    `;
  }

  function checkoutField({ name, label, type = "text", placeholder = "", autocomplete = "" }) {
    const id = `giftCheckout${name}`;
    const errorId = `${id}Error`;
    const error = checkoutState.errors[name] || "";
    return `
      <div class="gift-checkout-field">
        <label for="${id}">${label}</label>
        <input
          id="${id}"
          name="${name}"
          type="${type}"
          value="${safe(checkoutState.form[name] || "")}"
          placeholder="${safe(placeholder)}"
          ${autocomplete ? `autocomplete="${safe(autocomplete)}"` : ""}
          required
          aria-invalid="${error ? "true" : "false"}"
          aria-describedby="${errorId}"
        >
        <span class="gift-field-error" id="${errorId}" role="alert">${safe(error)}</span>
      </div>
    `;
  }

  function renderMonthOptions() {
    return `<option value="">الشهر</option>${monthOptions().map((month) => `<option value="${month}" ${checkoutState.card.expMonth === month ? "selected" : ""}>${month}</option>`).join("")}`;
  }

  function renderYearOptions() {
    return `<option value="">السنة</option>${yearOptions().map((year) => `<option value="${year}" ${checkoutState.card.expYear === year ? "selected" : ""}>${year}</option>`).join("")}`;
  }

  function cardFieldError(name) {
    return safe(checkoutState.errors[name] || "");
  }

  function renderBankCardFields() {
    const card = checkoutState.card;
    return `
      <section class="gift-bank-card-box" aria-label="بيانات البطاقة المصرفية">
        <div class="gift-card-brand-row">
          <span class="gift-card-chip" aria-hidden="true"></span>
          <strong>البطاقة المصرفية</strong>
        </div>

        <div class="gift-checkout-field full">
          <label for="giftCardNumber">رقم البطاقة *</label>
          <input
            id="giftCardNumber"
            name="cardNumber"
            inputmode="numeric"
            autocomplete="cc-number"
            value="${safe(card.cardNumber || "")}"
            placeholder="من فضلك أدخل رقم البطاقة"
            aria-invalid="${checkoutState.errors.cardNumber ? "true" : "false"}"
            aria-describedby="giftCardNumberError"
            required
          >
          <span class="gift-field-error" id="giftCardNumberError" role="alert">${cardFieldError("cardNumber")}</span>
        </div>

        <div class="gift-card-row">
          <div class="gift-checkout-field">
            <label>تاريخ انتهاء الصلاحية *</label>
            <div class="gift-expiry-grid">
              <select name="expMonth" aria-label="شهر انتهاء الصلاحية" aria-invalid="${checkoutState.errors.expiry ? "true" : "false"}" required>
                ${renderMonthOptions()}
              </select>
              <select name="expYear" aria-label="سنة انتهاء الصلاحية" aria-invalid="${checkoutState.errors.expiry ? "true" : "false"}" required>
                ${renderYearOptions()}
              </select>
            </div>
            <span class="gift-field-error" role="alert">${cardFieldError("expiry")}</span>
          </div>

          <div class="gift-checkout-field">
            <label for="giftCardCvv">رمز الأمن *</label>
            <input
              id="giftCardCvv"
              name="cvv"
              inputmode="numeric"
              autocomplete="cc-csc"
              value="${safe(card.cvv || "")}"
              placeholder="3 إلى 4 أرقام"
              aria-invalid="${checkoutState.errors.cvv ? "true" : "false"}"
              aria-describedby="giftCardCvvError"
              required
            >
            <button class="gift-inline-link" type="button" data-gift-action="toggle-security-code-help">ما هو رمز الأمن؟</button>
            <span class="gift-field-error" id="giftCardCvvError" role="alert">${cardFieldError("cvv")}</span>
            ${checkoutState.securityHintVisible ? `<p class="gift-security-hint">هو الرقم المكوّن من 3 أو 4 أرقام الموجود على البطاقة.</p>` : ""}
          </div>
        </div>

        <label class="gift-check-option muted">
          <input type="checkbox" name="rememberCard" ${checkoutState.card.rememberCard ? "checked" : ""} disabled>
          <span>تذكر هذه البطاقة لاستخدامها لاحقًا</span>
        </label>
        <p class="gift-card-note">ستتوفر هذه الخاصية بعد ربط بوابة الدفع.</p>
      </section>
    `;
  }

  function renderTermsAgreement() {
    return `
      <div class="gift-terms-box">
        <label class="gift-check-option">
          <input type="checkbox" name="acceptedTerms" ${checkoutState.acceptedTerms ? "checked" : ""} aria-describedby="giftTermsError" required>
          <span>
            لقد قرأت، وفهمت، وأوافق على
            <button type="button" class="gift-terms-link" data-gift-action="open-terms-modal" data-terms="gift">شروط وأحكام بطاقة الهدايا</button>
            و
            <button type="button" class="gift-terms-link" data-gift-action="open-terms-modal" data-terms="general">الشروط والأحكام</button>
            و
            <button type="button" class="gift-terms-link" data-gift-action="open-terms-modal" data-terms="privacy">سياسة الخصوصية</button>
            لشركة سويتشز ستور
          </span>
        </label>
        <span class="gift-field-error" id="giftTermsError" role="alert">${safe(checkoutState.errors.acceptedTerms || "")}</span>
      </div>
    `;
  }

  function renderTermsModal() {
    const modal = TERMS_CONTENT[checkoutState.activeTermsModal];
    if (!modal) return "";
    return `
      <div class="gift-terms-modal-backdrop" role="presentation">
        <section class="gift-terms-modal" role="dialog" aria-modal="true" aria-labelledby="giftTermsModalTitle">
          <button class="gift-terms-close" type="button" data-gift-action="close-terms-modal" aria-label="إغلاق">×</button>
          <h2 id="giftTermsModalTitle">${safe(modal.title)}</h2>
          <div class="gift-terms-modal-body">
            <p>${safe(modal.body)}</p>
          </div>
          <button class="gift-buy-btn secondary" type="button" data-gift-action="close-terms-modal">إغلاق</button>
        </section>
      </div>
    `;
  }

  function renderCheckoutResultNotice() {
    const result = checkoutState.result;
    if (!result || result.status === "success") return "";
    if (result.status === "failed") {
      return `
        <div class="gift-checkout-alert error" role="alert">
          <strong>تعذر إتمام عملية الدفع.</strong>
          <p>${result.order?.order_number ? `رقم الطلب: ${safe(result.order.order_number)}.` : "يمكنك المحاولة مرة أخرى بدون فقدان اختيار المنتج."}</p>
          <button class="gift-buy-btn secondary" type="button" data-gift-action="retry-payment">المحاولة مرة أخرى</button>
        </div>
      `;
    }

    return `
      <div class="gift-checkout-alert pending" role="status">
        <strong>عملية الدفع قيد المراجعة.</strong>
        <p>${result.order?.order_number ? `رقم الطلب: ${safe(result.order.order_number)}. ` : ""}سنراجع العملية ونبلغك عند اكتمالها.</p>
      </div>
    `;
  }

  function renderCheckoutSummary(selection) {
    const totals = checkoutTotals(selection);
    return `
      <aside class="gift-checkout-summary-panel" aria-label="ملخص الطلب">
        <div class="gift-checkout-summary-copy">
          <h2>ملخص الطلب</h2>
          <div><span>رقم الطلب</span><strong class="gift-reference">يصدر بعد تأكيد الدفع</strong></div>
          <div><span>المنتج</span><strong>${safe(selection.platform.name)}</strong></div>
          <div><span>المنطقة</span><strong>${safe(selection.region.label)}</strong></div>
          <div><span>الفئة</span><strong>${safe(formatDenomination(selection.denomination, selection.region.currency))}</strong></div>
          <div class="gift-checkout-total"><span>إجمالي السعر</span><strong>${formatLYD(totals.finalTotal)}</strong></div>
        </div>
        <button class="gift-edit-selection" type="button" data-gift-action="checkout-back-to-product">
          <i class="fas fa-arrow-right"></i>
          العودة لتعديل الكرت
        </button>
      </aside>
    `;
  }

  function renderCheckoutAuthShell(selection, body) {
    return `
      <section class="gift-checkout-view" style="--gift-accent:${safe(selection.platform.accent)}">
        <nav class="gift-breadcrumb" aria-label="مسار التنقل">
          <button type="button" data-gift-action="checkout-back-to-product"><i class="fas fa-arrow-right"></i> العودة لتعديل الكرت</button>
          <span>الكروت الدولية</span>
          <span>إتمام الطلب</span>
        </nav>

        <div class="gift-checkout-login-layout">
          ${body}
          ${renderCheckoutSummary(selection)}
        </div>
      </section>
    `;
  }

  function renderCheckoutAuthLoading(selection) {
    return renderCheckoutAuthShell(selection, `
      <section class="gift-login-required gift-auth-loading" aria-live="polite">
        <span class="gift-login-icon" aria-hidden="true"><i class="fas fa-circle-notch fa-spin"></i></span>
        <div>
          <span class="gift-kicker">Switches Account</span>
          <h1>جاري التحقق من تسجيل الدخول</h1>
          <p>نجهز صفحة الدفع المرتبطة بحسابك.</p>
        </div>
      </section>
    `);
  }

  function renderCheckoutLoginPrompt(selection) {
    const returnTo = checkoutPath(selection);
    return renderCheckoutAuthShell(selection, `
      <section class="gift-login-required">
        <span class="gift-login-icon" aria-hidden="true"><i class="fa-brands fa-google"></i></span>
        <div class="gift-login-copy">
          <span class="gift-kicker">Switches Account</span>
          <h1>سجل دخولك لإكمال الشراء</h1>
          <p>سنرجعك إلى نفس اختيار الكرت بعد تسجيل الدخول.</p>
        </div>
        <div class="gift-login-actions">
          <button class="gift-google-btn" type="button" data-gift-action="login-for-checkout" data-return-to="${safe(returnTo)}">
            <i class="fa-brands fa-google" aria-hidden="true"></i>
            المتابعة باستخدام Google
          </button>
          <button class="gift-buy-btn secondary" type="button" data-gift-action="checkout-back-to-product">العودة لتعديل الكرت</button>
        </div>
      </section>
    `);
  }

  function renderCheckoutPage() {
    const selection = checkoutSelection();
    if (!selection.valid) return renderCheckoutInvalid();
    if (!authUiEnabled()) return renderCheckoutInvalid();

    if (checkoutAuthPending()) return renderCheckoutAuthLoading(selection);
    if (!currentAuthUser()) return renderCheckoutLoginPrompt(selection);

    prefillCheckoutFromAccount();
    checkoutState.selectedPaymentMethod = "bank-card";
    const canSubmit = checkoutReady();

    return `
      <section class="gift-checkout-view" style="--gift-accent:${safe(selection.platform.accent)}">
        <nav class="gift-breadcrumb" aria-label="مسار التنقل">
          <button type="button" data-gift-action="checkout-back-to-product"><i class="fas fa-arrow-right"></i> العودة لتعديل الكرت</button>
          <span>الكروت الدولية</span>
          <span>إتمام الطلب</span>
        </nav>

        <section class="gift-checkout-head">
          <span class="gift-kicker">Switches Checkout</span>
          <h1>إتمام الطلب</h1>
        </section>

        <div class="gift-checkout-layout">
          <form class="gift-checkout-main" id="giftCheckoutForm" novalidate>
            ${renderCheckoutResultNotice()}

            <section class="gift-checkout-panel">
              <div class="gift-checkout-panel-head">
                <h2>بيانات التواصل</h2>
              </div>
              <div class="gift-checkout-fields">
                ${checkoutField({ name: "fullName", label: "الاسم الكامل", placeholder: "اكتب اسمك الكامل", autocomplete: "name" })}
                ${checkoutField({ name: "phone", label: "رقم الهاتف", type: "tel", placeholder: "مثال: 0912345678", autocomplete: "tel" })}
                ${checkoutField({ name: "email", label: "البريد الإلكتروني لاستلام Gift Card", type: "email", placeholder: "name@example.com", autocomplete: "email" })}
              </div>
            </section>

            <section class="gift-checkout-panel">
              <div class="gift-checkout-panel-head">
                <h2>طريقة الدفع</h2>
              </div>
              ${renderBankCardFields()}
            </section>

            ${renderTermsAgreement()}

            <div class="gift-checkout-actions" aria-live="polite">
              <button class="gift-pay-btn" type="submit" ${checkoutState.processing || !canSubmit ? "disabled" : ""}>
                ${checkoutState.processing ? `<span class="gift-spinner" aria-hidden="true"></span> جارٍ معالجة الدفع...` : "إكمال الدفع"}
              </button>
            </div>
          </form>

          ${renderCheckoutSummary(selection)}
        </div>
        ${renderTermsModal()}
      </section>
    `;
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

  function successTitle(order) {
    if (order.order_status === "DELIVERED") return "تم الدفع بنجاح";
    if (order.order_status === "PROCESSING") return "جاري تجهيز كرتك...";
    if (order.order_status === "REQUIRES_REVIEW") return "طلبك قيد المراجعة";
    return "تم تأكيد الطلب";
  }

  function successSubtitle(order) {
    if (order.order_status === "DELIVERED") return "تم تجهيز الكرت وتسليمه داخل تفاصيل الطلب.";
    if (order.order_status === "PROCESSING") return "نعمل على تجهيز بطاقة الهدايا الآن.";
    if (order.order_status === "REQUIRES_REVIEW") return "تم الدفع، ويحتاج تجهيز الكرت إلى مراجعة من الفريق.";
    return "";
  }

  function scheduleSuccessPoll(order) {
    const terminalStates = ["DELIVERED", "REQUIRES_REVIEW", "FAILED", "REFUNDED"];
    if (!order || terminalStates.includes(order.order_status)) return;
    if (checkoutState.pollingOrderNumber !== order.order_number) {
      checkoutState.pollingOrderNumber = order.order_number;
      checkoutState.pollCount = 0;
      window.clearTimeout(checkoutState.pollTimer);
    }
    if (checkoutState.pollCount >= 10 || checkoutState.pollTimer) return;
    checkoutState.pollCount += 1;
    checkoutState.pollTimer = window.setTimeout(async () => {
      checkoutState.pollTimer = 0;
      try {
        checkoutState.successOrder = await fetchOrder(order.order_number);
      } catch {}
      renderCheckoutRoute();
    }, 2500);
  }

  async function loadSuccessOrder(orderNumber) {
    if (!orderNumber || checkoutState.loadingOrderNumber === orderNumber) return;
    checkoutState.loadingOrderNumber = orderNumber;
    try {
      checkoutState.successOrder = await fetchOrder(orderNumber);
    } catch {
      checkoutState.successOrder = null;
      checkoutState.result = { status: "failed" };
    } finally {
      checkoutState.loadingOrderNumber = "";
      renderCheckoutRoute();
    }
  }

  function renderCheckoutSuccessPage() {
    const params = checkoutParams();
    const selection = checkoutSelection();
    const order = checkoutState.result?.order?.order_number === params.orderNumber
      ? checkoutState.result.order
      : checkoutState.successOrder?.order_number === params.orderNumber
        ? checkoutState.successOrder
        : null;

    if (!params.orderNumber) return renderCheckoutInvalid();

    if (!order) {
      loadSuccessOrder(params.orderNumber);
      return `
        <section class="gift-checkout-success">
          <div class="gift-success-card">
            <span class="gift-success-icon" aria-hidden="true"><i class="fas fa-circle-notch fa-spin"></i></span>
            <h1>جاري تحميل تفاصيل الطلب</h1>
          </div>
        </section>
      `;
    }

    scheduleSuccessPoll(order);
    return `
      <section class="gift-checkout-success" style="--gift-accent:${safe(selection.platform?.accent || "var(--primary-color)")};">
        <div class="gift-success-card">
          <span class="gift-success-icon" aria-hidden="true"><i class="fas fa-check"></i></span>
          <h1>${safe(successTitle(order))}</h1>
          ${successSubtitle(order) ? `<p>${safe(successSubtitle(order))}</p>` : ""}
          <div class="gift-success-summary">
            <div><span>رقم الطلب</span><strong>${safe(order.order_number)}</strong></div>
            <div><span>الكرت</span><strong>${safe(order.product_name_snapshot)}</strong></div>
            <div><span>المنطقة</span><strong>${safe(order.region_name_snapshot)}</strong></div>
            <div><span>الفئة</span><strong>${safe(order.denomination_value)} ${safe(order.denomination_currency)}</strong></div>
            <div><span>المبلغ</span><strong>${formatLYD(order.selling_price_lyd)}</strong></div>
            <div><span>وسيلة الدفع</span><strong>${safe(findPaymentMethod("bank-card")?.name || order.payment_method)}</strong></div>
            <div><span>الحالة</span><strong>${safe(orderStatusLabel(order.order_status))}</strong></div>
          </div>
          <div class="gift-success-actions">
            <button class="gift-buy-btn secondary" type="button" data-gift-action="view-order" data-order="${safe(order.order_number)}">تفاصيل الطلب</button>
            <button class="gift-buy-btn" type="button" data-gift-action="view-orders">طلباتي</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderGiftCardsPage() {
    const root = document.getElementById("giftCardsContent");
    if (!root) return;
    if (catalogLoadError) {
      root.innerHTML = renderCatalogError();
      return;
    }
    const platformId = routePlatformId();
    const platform = platformId ? findPlatform(platformId) : null;

    if (platformId) {
      root.innerHTML = platform ? (isLiveGiftPlatform(platform) ? renderGiftDetail(platform) : renderPlatformComingSoon(platform)) : renderNotFound(platformId);
      return;
    }

    root.innerHTML = `
      ${renderGiftHeader()}
      <section class="gift-grid" aria-label="منصات الكروت الدولية">
        ${giftPlatformsForDisplay().map(renderGiftCard).join("")}
      </section>
    `;
    observeWaveItems(root);
  }

  function showGiftCards(options = {}) {
    ensureModeSwitches();
    const page = ensureGiftCardsPage();
    const main = document.querySelector(".main-content");
    const allProducts = document.getElementById("allProductsPage");
    const favorites = document.getElementById("favoritesPage");
    const targetPlatform = options.platformId || "";

    if (main) main.style.display = "none";
    if (allProducts) allProducts.classList.remove("active");
    if (favorites) favorites.classList.remove("active");
    page.classList.add("active");

    if (options.push !== false) {
      const targetPath = targetPlatform ? `/gift-cards/${targetPlatform}` : "/gift-cards";
      if (normalizedPath() !== targetPath) window.history.pushState({ page: "gift-cards", platform: targetPlatform }, "", targetPath);
    }

    syncSwitchActive();
    renderGiftCardsPage();
    if (options.scroll !== false) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showProducts() {
    if (isGiftCardsRoute() || isCheckoutRoute()) window.history.pushState({ page: "products" }, "", "/");
    hideGiftCardsPage();
    syncSwitchActive();
    if (typeof window.showAllProducts === "function") window.showAllProducts("جميع المنتجات");
  }

  function renderCheckoutRoute() {
    const root = document.getElementById("giftCardsContent");
    if (!root) return;
    if (catalogLoadError) {
      root.innerHTML = renderCatalogError();
      return;
    }
    root.innerHTML = isCheckoutSuccessRoute() && currentAuthUser() ? renderCheckoutSuccessPage() : renderCheckoutPage();
  }

  function showCheckout(options = {}) {
    ensureModeSwitches();
    const page = ensureGiftCardsPage();
    const main = document.querySelector(".main-content");
    const allProducts = document.getElementById("allProductsPage");
    const favorites = document.getElementById("favoritesPage");

    if (main) main.style.display = "none";
    if (allProducts) allProducts.classList.remove("active");
    if (favorites) favorites.classList.remove("active");
    page.classList.add("active");

    if (options.path && options.push !== false && `${window.location.pathname}${window.location.search}` !== options.path) {
      window.history.pushState({ page: "gift-card-checkout" }, "", options.path);
    }

    syncSwitchActive();
    renderCheckoutRoute();
    if (options.scroll !== false) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function captureCheckoutForm() {
    const form = document.getElementById("giftCheckoutForm");
    if (!form) return;
    const data = new FormData(form);
    checkoutState.form = {
      fullName: String(data.get("fullName") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      email: String(data.get("email") || "").trim(),
    };
    checkoutState.card = {
      cardNumber: formatCardNumber(data.get("cardNumber") || ""),
      expMonth: String(data.get("expMonth") || ""),
      expYear: String(data.get("expYear") || ""),
      cvv: String(data.get("cvv") || "").replace(/\D/g, "").slice(0, 4),
      rememberCard: false,
    };
    checkoutState.acceptedTerms = data.get("acceptedTerms") === "on";
  }

  function validateCheckoutForm() {
    const errors = {};
    const fullName = checkoutState.form.fullName || "";
    const phone = checkoutState.form.phone || "";
    const email = checkoutState.form.email || "";
    const compactPhone = phone.replace(/[\s-]/g, "");
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cardNumber = cardDigits();
    const month = Number(checkoutState.card.expMonth || 0);
    const year = Number(checkoutState.card.expYear || 0);
    const cvv = String(checkoutState.card.cvv || "");
    const now = new Date();
    const isFutureExpiry = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);

    if (fullName.length < 3) errors.fullName = "اكتب الاسم الكامل بشكل واضح.";
    if (!/^\+?\d{8,15}$/.test(compactPhone)) errors.phone = "اكتب رقم هاتف صحيحًا من 8 إلى 15 رقمًا.";
    if (!emailPattern.test(email)) errors.email = "اكتب بريدًا إلكترونيًا صحيحًا.";
    if (!/^\d{12,19}$/.test(cardNumber)) errors.cardNumber = "اكتب رقم بطاقة صحيحًا بالأرقام فقط.";
    if (!(month >= 1 && month <= 12 && year >= now.getFullYear() && isFutureExpiry)) errors.expiry = "اختر تاريخ انتهاء صلاحية صحيحًا.";
    if (!/^\d{3,4}$/.test(cvv)) errors.cvv = "رمز الأمن يجب أن يكون 3 أو 4 أرقام.";
    if (!checkoutState.acceptedTerms) errors.acceptedTerms = "يجب الموافقة على الشروط قبل إكمال الدفع.";

    checkoutState.errors = errors;
    return Object.keys(errors).length === 0;
  }

  function openCheckout(platformId, regionId, value) {
    const platform = findPlatform(platformId);
    const region = platform?.regions.find((item) => item.id === regionId && item.available) || null;
    const denomination = region?.denominations.find((item) => denominationKey(item) === String(value) && item.available) || null;
    if (!platform?.available || !region || !denomination) return;

    checkoutState.processing = false;
    checkoutState.result = null;
    checkoutState.errors = {};
    checkoutState.selectedPaymentMethod = "bank-card";
    showCheckout({
      path: checkoutPath({ platformId, regionId, value }),
    });
  }

  function backToCheckoutProduct() {
    const selection = checkoutSelection();
    if (!selection.platform) {
      showGiftCards();
      return;
    }

    const path = detailPath(selection);
    window.history.pushState({ page: "gift-card-detail", platform: selection.platformId }, "", path);
    showGiftCards({ platformId: selection.platformId, push: false });
  }

  function selectPaymentMethod(methodId) {
    captureCheckoutForm();
    const method = findPaymentMethod(methodId);
    if (!isPaymentSelectable(method)) return;
    checkoutState.selectedPaymentMethod = method.id;
    checkoutState.errors.paymentMethod = "";
    checkoutState.result = null;
    renderCheckoutRoute();
  }

  function retryPayment() {
    const selection = checkoutSelection();
    if (selection.valid && checkoutState.result?.status === "failed") clearCheckoutAttempt(selection);
    captureCheckoutForm();
    checkoutState.processing = false;
    checkoutState.result = null;
    renderCheckoutRoute();
  }

  function syncCheckoutSubmitState() {
    const form = document.getElementById("giftCheckoutForm");
    if (!form) return;
    const payButton = form.querySelector(".gift-pay-btn");
    if (!payButton) return;
    captureCheckoutForm();
    payButton.disabled = checkoutState.processing || !checkoutReady();
  }

  function handleCheckoutInput(event) {
    const target = event.target;
    if (!target?.closest?.("#giftCheckoutForm")) return;

    if (target.name === "cardNumber") {
      const cursorAtEnd = target.selectionStart === target.value.length;
      target.value = formatCardNumber(target.value);
      if (cursorAtEnd) target.setSelectionRange(target.value.length, target.value.length);
    }

    if (target.name === "cvv") target.value = target.value.replace(/\D/g, "").slice(0, 4);
    syncCheckoutSubmitState();
  }

  function openTermsModal(termsKey) {
    if (!TERMS_CONTENT[termsKey]) return;
    captureCheckoutForm();
    checkoutState.activeTermsModal = termsKey;
    renderCheckoutRoute();
  }

  function closeTermsModal() {
    captureCheckoutForm();
    checkoutState.activeTermsModal = "";
    renderCheckoutRoute();
  }

  function toggleSecurityCodeHelp() {
    captureCheckoutForm();
    checkoutState.securityHintVisible = !checkoutState.securityHintVisible;
    renderCheckoutRoute();
  }

  async function handleCheckoutSubmit(event) {
    event.preventDefault();
    if (checkoutState.processing) return;

    const selection = checkoutSelection();
    captureCheckoutForm();
    checkoutState.result = null;
    if (!currentAuthUser()) {
      renderCheckoutRoute();
      return;
    }
    if (!selection.valid || !validateCheckoutForm()) {
      renderCheckoutRoute();
      return;
    }

    checkoutState.processing = true;
    renderCheckoutRoute();

    try {
      const order = await createOrder(selection);
      const result = {
        status: orderResultStatus(order),
        provider: "mock",
        reference: order.order_number,
        order,
      };

      checkoutState.processing = false;
      checkoutState.result = result;
      checkoutState.successOrder = order;

      if (result.status === "success") {
        checkoutState.card = {};
        clearCheckoutAttempt(selection);
        window.history.pushState({ page: "gift-card-checkout-success" }, "", checkoutSuccessPath(selection, order.order_number));
        renderCheckoutRoute();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      renderCheckoutRoute();
    } catch (error) {
      checkoutState.processing = false;
      checkoutState.result = { status: "failed", provider: "mock", error };
      renderCheckoutRoute();
    }
  }

  function observeWaveItems(root) {
    if (waveObserver) waveObserver.disconnect();
    const items = root.querySelectorAll(".gift-wave-item");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    waveObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        waveObserver.unobserve(entry.target);
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });

    items.forEach((item, index) => {
      if (!item.style.getPropertyValue("--wave-delay")) {
        item.style.setProperty("--wave-delay", `${(index % 4) * 65}ms`);
      }
      waveObserver.observe(item);
    });
  }

  function installFunctionHooks() {
    if (window.__SWITCHES_GIFT_CARD_TASK_TWO_HOOKS__) return;
    window.__SWITCHES_GIFT_CARD_TASK_TWO_HOOKS__ = true;

    originalShowAllProducts = window.showAllProducts;
    originalShowMainPage = window.showMainPage;

    window.showAllProducts = function (...args) {
      hideGiftCardsPage();
      if (isGiftCardsRoute() || isCheckoutRoute()) window.history.pushState({ page: "products" }, "", "/");
      const result = typeof originalShowAllProducts === "function" ? originalShowAllProducts.apply(this, args) : undefined;
      syncSwitchActive();
      return result;
    };

    window.showMainPage = function (...args) {
      hideGiftCardsPage();
      if (isGiftCardsRoute() || isCheckoutRoute()) window.history.pushState({ page: "home" }, "", "/");
      const result = typeof originalShowMainPage === "function" ? originalShowMainPage.apply(this, args) : undefined;
      syncSwitchActive();
      return result;
    };

    window.showGiftCards = showGiftCards;
    window.showGiftCardCheckout = showCheckout;
  }

  function selectRegion(platformId, regionId) {
    const platform = findPlatform(platformId);
    const region = platform?.regions.find((item) => item.id === regionId && item.available);
    if (!platform || !region) return;
    detailState[platformId] = { regionId, value: "", notice: "" };
    updateDetailRoute(platform, detailState[platformId]);
    renderGiftCardsPage();
  }

  function selectDenomination(platformId, regionId, value) {
    const platform = findPlatform(platformId);
    if (isLiveGiftPlatform(platform)) {
      const liveRegion = primaryGiftRegion(platform);
      const denominations = liveDenominations(platform);
      const denomination = denominations.find((item) => denominationKey(item) === String(value) && item.available);
      if (!denomination) return;
      detailState[platformId] = { regionId: liveRegion.id, value: denominationKey(denomination), notice: "" };
      updateDetailRoute(platform, detailState[platformId]);
      renderGiftCardsPage();
      return;
    }
    const region = platform?.regions.find((item) => item.id === regionId && item.available);
    const denomination = region?.denominations.find((item) => denominationKey(item) === String(value) && item.available);
    if (!platform || !region || !denomination) return;
    detailState[platformId] = { regionId, value: denominationKey(denomination), notice: "" };
    updateDetailRoute(platform, detailState[platformId]);
    renderGiftCardsPage();
  }

  function showFutureBuyNotice(platformId) {
    const platform = findPlatform(platformId);
    if (!platform) return;
    const selection = selectionFor(platform);
    if (!selection.region || !selection.denomination || !platform.available) return;
    detailState[platformId] = {
      regionId: selection.regionId,
      value: selection.value,
      notice: "سيتم تجهيز صفحة الدفع في المرحلة القادمة.",
    };
    renderGiftCardsPage();
  }

  function activateAction(target) {
    const action = target.dataset.giftAction;
    if (action === "open-platform") showGiftCards({ platformId: target.dataset.platform });
    if (action === "back-to-gift-cards") showGiftCards();
    if (action === "select-region") selectRegion(target.dataset.platform, target.dataset.region);
    if (action === "select-denomination") selectDenomination(target.dataset.platform, target.dataset.region, target.dataset.value);
    if (action === "open-whatsapp-purchase") openWhatsappPurchase(target.dataset.platform);
    if (action === "open-checkout") openCheckout(target.dataset.platform, target.dataset.region, target.dataset.value);
    if (action === "login-for-checkout") loginForCheckout(target.dataset.returnTo);
    if (action === "checkout-back-to-product") backToCheckoutProduct();
    if (action === "select-payment-method") selectPaymentMethod(target.dataset.method);
    if (action === "retry-payment") retryPayment();
    if (action === "view-orders") window.SwitchesAuth?.showOrders?.();
    if (action === "view-order") window.SwitchesAuth?.showOrderDetail?.(target.dataset.order);
    if (action === "open-terms-modal") openTermsModal(target.dataset.terms);
    if (action === "close-terms-modal") closeTermsModal();
    if (action === "toggle-security-code-help") toggleSecurityCodeHelp();
    if (action === "future-buy") showFutureBuyNotice(target.dataset.platform);
  }

  function installEvents() {
    document.addEventListener("click", (event) => {
      if (event.target.classList?.contains("gift-terms-modal-backdrop")) {
        closeTermsModal();
        return;
      }

      const modeButton = event.target.closest("[data-store-mode]");
      if (modeButton) {
        if (modeButton.dataset.storeMode === "gift-cards") showGiftCards();
        else showProducts();
        return;
      }

      const giftAction = event.target.closest("[data-gift-action]");
      if (giftAction && !giftAction.disabled) activateAction(giftAction);
    });

    document.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      const giftAction = event.target.closest("[data-gift-action]");
      if (!giftAction || giftAction.disabled) return;
      event.preventDefault();
      activateAction(giftAction);
    });

    document.addEventListener("submit", (event) => {
      if (event.target?.id === "giftCheckoutForm") handleCheckoutSubmit(event);
    });

    document.addEventListener("input", handleCheckoutInput);
    document.addEventListener("change", handleCheckoutInput);

    document.addEventListener("change", (event) => {
      if (!event.target?.matches("[data-gift-mock-result]")) return;
      captureCheckoutForm();
      checkoutState.mockResult = event.target.value;
    });

    document.addEventListener("error", (event) => {
      const image = event.target;
      if (!image?.matches?.(".gift-platform-image")) return;
      const fallback = image.dataset.fallbackSrc || "";
      if (fallback && image.dataset.fallbackApplied !== "1") {
        image.dataset.fallbackApplied = "1";
        image.src = fallback;
        return;
      }
      image.closest(".gift-platform-art")?.classList.remove("has-image");
      image.remove();
    }, true);

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !checkoutState.activeTermsModal) return;
      closeTermsModal();
    });

    window.addEventListener("popstate", () => {
      if (isCheckoutRoute()) {
        showCheckout({ push: false, scroll: false });
        return;
      }

      if (isGiftCardsRoute()) {
        showGiftCards({ push: false, scroll: false });
        return;
      }

      hideGiftCardsPage();
      syncSwitchActive();
      const allProducts = document.getElementById("allProductsPage");
      const favorites = document.getElementById("favoritesPage");
      const main = document.querySelector(".main-content");
      if (main && !allProducts?.classList.contains("active") && !favorites?.classList.contains("active") && !["/favorites", "/account/favorites"].includes(normalizedPath())) main.style.display = "block";
    });

    window.addEventListener("switches:auth-changed", () => {
      if (!isCheckoutRoute()) return;
      captureCheckoutForm();
      renderCheckoutRoute();
    });
  }

  async function install() {
    await Promise.all([loadGiftCatalog(), loadStoreVisuals()]);
    ensureModeSwitches();
    refreshModeSwitches();
    ensureGiftCardsPage();
    installFunctionHooks();
    installEvents();

    if (isCheckoutRoute()) {
      showCheckout({ push: false, scroll: false });
    } else if (isGiftCardsRoute()) {
      showGiftCards({ push: false, scroll: false });
    } else {
      syncSwitchActive();
    }
  }

  window.addEventListener("switches:settings-changed", refreshVisualSettings);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();

