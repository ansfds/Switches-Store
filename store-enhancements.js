(function () {
  const CATEGORY_META = [
    { key: "gpu", label: "كروت الشاشة", icon: "fa-microchip", description: "GPU و RTX و Radeon", aliases: ["gpu", "graphics", "كرت شاشة", "كروت الشاشة"] },
    { key: "cpu", label: "معالجات", icon: "fa-microchip", description: "Intel و AMD Ryzen", aliases: ["cpu", "processor", "معالج", "معالجات"] },
    { key: "motherboard", label: "لوحات أم", icon: "fa-server", description: "AM5 و LGA و B/Z/X", aliases: ["motherboard", "لوحة", "لوحات أم"] },
    { key: "ram", label: "رامات", icon: "fa-memory", description: "DDR4 و DDR5", aliases: ["ram", "memory", "ذاكرة", "رام"] },
    { key: "storage", label: "التخزين", icon: "fa-hard-drive", description: "SSD و NVMe و HDD", aliases: ["storage", "ssd", "nvme", "تخزين"] },
    { key: "cooling", label: "التبريد", icon: "fa-fan", description: "AIO و مراوح و مشتتات", aliases: ["cooling", "cooler", "مبرد", "تبريد"] },
    { key: "psu", label: "مزودات الطاقة", icon: "fa-plug", description: "Power Supply و 80+", aliases: ["psu", "power", "مزود", "باور"] },
    { key: "case", label: "الكيسات", icon: "fa-computer", description: "Gaming cases", aliases: ["case", "كيس", "كيسات"] },
    { key: "monitor", label: "الشاشات", icon: "fa-desktop", description: "Gaming monitors", aliases: ["monitor", "screen", "شاشة", "شاشات"] },
    { key: "combo", label: "الكومبوهات", icon: "fa-layer-group", description: "CPU + Motherboard + قطع مختارة", aliases: ["combo", "bundle", "build", "تجميعة", "كومبو"] },
    { key: "digital-cards", label: "الكروت الإلكترونية", icon: "fa-ticket", description: "Google Play و Steam و PSN", aliases: ["digital", "gift card", "google play", "steam", "playstation", "xbox", "netflix", "spotify", "apple"] },
    { key: "accessories", label: "الإكسسوارات", icon: "fa-keyboard", description: "لوحات مفاتيح و ماوسات و ملحقات", aliases: ["accessories", "keyboard", "mouse", "headset", "إكسسوارات"] },
  ];

  const categoryMap = new Map(CATEGORY_META.map((item) => [item.key, item]));
  const categoryOrder = new Map(CATEGORY_META.map((item, index) => [item.key, index]));
  const storeState = {
    activeCategory: "all",
    onlyAvailable: false,
    sort: "default",
    search: "",
  };

  const mainOffer = {
    id: "b850-9900x-liquid",
    title: "MSI B850 GAMING PLUS WIFI6E + AMD RYZEN 9 9900X + COOLER MASTER ELITE LIQUID 240",
    shortTitle: "B850 + Ryzen 9 + Liquid 240",
    price: 620,
    oldPrice: 669,
    badge: "عرض خاص",
    productIds: [66, 65, 64],
  };

  function safeText(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getAllProducts() {
    try {
      if (typeof allProducts !== "undefined" && Array.isArray(allProducts)) return allProducts;
    } catch {}
    return [];
  }

  function getSortedProducts() {
    try {
      if (typeof sortedProducts !== "undefined" && Array.isArray(sortedProducts)) return sortedProducts;
    } catch {}
    return getAllProducts();
  }

  function callGlobal(name, ...args) {
    const fn = window[name];
    if (typeof fn === "function") return fn(...args);
    return undefined;
  }

  function money(value) {
    const n = Number(value || 0);
    return `${Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0"}$`;
  }

  function isAvailable(product) {
    return String(product?.availability || "").trim() === "available";
  }

  function productText(product) {
    const specs = product?.specs && typeof product.specs === "object" ? Object.values(product.specs).join(" ") : "";
    return normalize([product?.name, product?.brand, product?.category, product?.description, specs, (product?.tags || []).join(" ")].join(" "));
  }

  function includesAny(text, terms) {
    return terms.some((term) => text.includes(normalize(term)));
  }

  function inferCategoryKey(product) {
    const text = productText(product);
    const category = normalize(product?.category);
    const brand = normalize(product?.brand);

    if (includesAny(text, ["google play", "steam", "playstation card", "psn", "xbox", "netflix", "spotify", "apple gift", "بطاقة", "كرت الكتروني"])) return "digital-cards";
    if (includesAny(text, ["combo", "bundle", "gaming pc build", "تجميعه", "تجميعة", " + "]) || brand === "combo" || category.includes("تجميعه")) return "combo";
    if (includesAny(text, ["rtx", "gtx", "geforce", "radeon", "rx ", "graphics card", "gddr", "كرت شاشه", "كروت الشاشه"])) return "gpu";
    if (includesAny(text, ["ryzen", "core i", "intel core", "processor", "cpu", "معالج"])) return "cpu";
    if (includesAny(text, ["motherboard", "b850", "b650", "b550", "z790", "x670", "lga", "am5", "am4", "لوحه ام", "لوحة ام"])) return "motherboard";
    if (includesAny(text, ["ddr4", "ddr5", "ram", "memory", "ذاكره", "رام"])) return "ram";
    if (includesAny(text, ["ssd", "nvme", "hdd", "hard", "sn850", "t705", "تخزين"])) return "storage";
    if (includesAny(text, ["aio", "cooler", "liquid", "fan", "radiator", "مبرد", "تبريد", "مروحه"])) return "cooling";
    if (includesAny(text, ["psu", "power supply", "w 80", "1000w", "650w", "مزود", "باور"])) return "psu";
    if (includesAny(text, ["case", "fish tank", "chassis", "كيس"])) return "case";
    if (category.includes("شاشات") || includesAny(text, ["monitor", "ultragear", "omen", "nitro", "m27", "screen", "شاشه"])) return "monitor";
    return "accessories";
  }

  function annotateProducts() {
    const seen = new Set();
    [...getAllProducts(), ...getSortedProducts()].forEach((product) => {
      if (!product || seen.has(product)) return;
      seen.add(product);
      const key = product.categoryKey || inferCategoryKey(product);
      product.categoryKey = key;
      product.categoryLabel = categoryMap.get(key)?.label || product.category || "منتجات";
      if (!Array.isArray(product.tags)) product.tags = [];
    });
  }

  function categoryFromValue(value) {
    const normalized = normalize(value);
    if (!normalized) return "all";
    const direct = categoryMap.get(value);
    if (direct) return direct.key;
    const matched = CATEGORY_META.find((item) => normalize(item.label) === normalized || item.aliases.some((alias) => normalize(alias) === normalized));
    return matched ? matched.key : value;
  }

  function categoryProducts(key) {
    annotateProducts();
    return getSortedProducts().filter((product) => product.categoryKey === key);
  }

  function originalIndex(product) {
    try {
      if (typeof productOriginalOrder !== "undefined" && productOriginalOrder instanceof Map) {
        return productOriginalOrder.get(product.id) ?? Number.MAX_SAFE_INTEGER;
      }
    } catch {}
    return Number(product.id || 0) * -1;
  }

  function sortProducts(products, sortMode = storeState.sort) {
    const list = [...products];
    if (sortMode === "price-low") return list.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    if (sortMode === "price-high") return list.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    if (sortMode === "newest") return list.sort((a, b) => Number(b.createdAt || b.id || 0) - Number(a.createdAt || a.id || 0));
    if (sortMode === "best") {
      return list.sort((a, b) => {
        const aScore = Number((a.tags || []).includes("bestSelling")) + Number((a.tags || []).includes("featured"));
        const bScore = Number((b.tags || []).includes("bestSelling")) + Number((b.tags || []).includes("featured"));
        return bScore - aScore || originalIndex(a) - originalIndex(b);
      });
    }
    return list.sort((a, b) => {
      const categoryDiff = (categoryOrder.get(a.categoryKey) ?? 99) - (categoryOrder.get(b.categoryKey) ?? 99);
      if (categoryDiff) return categoryDiff;
      const orderDiff = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
      if (orderDiff) return orderDiff;
      if (isAvailable(a) !== isAvailable(b)) return isAvailable(a) ? -1 : 1;
      return originalIndex(a) - originalIndex(b);
    });
  }

  function availabilityLabel(product) {
    if (product.availability === "comingSoon") return "قريباً";
    if (!isAvailable(product)) return "غير متوفر حالياً";
    return "أضف للسلة";
  }

  function renderBadges(product) {
    const badges = [];
    if (product.oldPrice) {
      const discount = Math.max(1, Math.round(((Number(product.oldPrice) - Number(product.price)) / Number(product.oldPrice)) * 100));
      badges.push(`<span class="product-badge badge-discount">خصم ${discount}%</span>`);
    }
    if ((product.tags || []).includes("bestSelling")) badges.push(`<span class="product-badge badge-new">الأكثر طلباً</span>`);
    if ((product.tags || []).includes("newArrival") || Number(product.id || 0) > 60) badges.push(`<span class="product-badge badge-new">جديد</span>`);
    if (product.availability === "comingSoon") badges.push(`<span class="product-badge badge-soon">قريباً</span>`);
    if (!isAvailable(product) && product.availability !== "comingSoon") badges.push(`<span class="product-badge badge-unavailable">غير متوفر</span>`);
    return badges.join("");
  }

  function productImage(product) {
    return safeText((product.images && product.images[0]) || "images/favicon.png");
  }

  function renderProductCard(product) {
    const unavailable = !isAvailable(product);
    return `
      <article class="product-card ${unavailable ? "is-unavailable" : ""}" data-id="${safeText(product.id)}" tabindex="0">
        <div class="product-badges-container">${renderBadges(product)}</div>
        <div class="product-image-container">
          <img src="${productImage(product)}" alt="${safeText(product.name)}" class="product-image" loading="lazy">
        </div>
        <div class="product-content">
          <div class="product-category-line">
            <span class="product-category-pill">${safeText(product.categoryLabel || "منتجات")}</span>
            <span>${isAvailable(product) ? "متوفر" : product.availability === "comingSoon" ? "قريباً" : "غير متوفر"}</span>
          </div>
          <h3 class="product-title" dir="auto">${safeText(product.name)}</h3>
          <div class="product-meta">
            <span class="product-brand">${safeText(product.brand || "Switches")}</span>
            <span class="product-condition">${safeText(product.condition || "جديد")}</span>
          </div>
          <div class="product-price">
            <span class="current-price">${money(product.price)}</span>
            ${product.oldPrice ? `<span class="old-price">${money(product.oldPrice)}</span>` : ""}
          </div>
          <div class="product-actions">
            <button type="button" class="btn-details" data-action="details"><i class="fas fa-eye"></i> عرض التفاصيل</button>
            <button type="button" class="btn-add-cart" data-action="cart" ${unavailable ? "disabled" : ""}>
              <i class="fas fa-cart-plus"></i> ${availabilityLabel(product)}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function emptyState(message = "لا توجد منتجات مطابقة حالياً") {
    return `<div class="empty-state-premium"><div><i class="fas fa-box-open"></i><h3>${safeText(message)}</h3></div></div>`;
  }

  function attachProductEvents(rootSelector) {
    document.querySelectorAll(`${rootSelector} .product-card`).forEach((card) => {
      const id = Number(card.dataset.id);
      card.addEventListener("click", (event) => {
        const action = event.target.closest("[data-action]");
        if (action) {
          event.stopPropagation();
          if (action.dataset.action === "cart") callGlobal("addToCart", id);
          else callGlobal("showProductModal", id);
          return;
        }
        callGlobal("showProductModal", id);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter") callGlobal("showProductModal", id);
      });
    });
  }

  function premiumRenderProductsGrid(gridId, products) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const list = sortProducts((products || []).filter(Boolean)).slice(0, gridId === "allProductsGrid" ? 999 : 5);
    grid.innerHTML = list.length ? list.map(renderProductCard).join("") : emptyState("لا توجد منتجات في هذا القسم حالياً");
    attachProductEvents(`#${gridId}`);
  }

  function getHomepageProducts(canonicalKey, fallback) {
    try {
      if (typeof getHomepageSectionProducts === "function") {
        const configured = getHomepageSectionProducts(canonicalKey);
        if (configured && configured.length) return configured;
      }
    } catch {}
    return fallback;
  }

  function setSectionTitle(gridId, title, icon, subtitle) {
    const section = document.getElementById(gridId)?.closest(".products-section");
    if (!section) return;
    const titleEl = section.querySelector(".section-title");
    if (titleEl) titleEl.innerHTML = `<i class="fas ${icon} section-icon"></i>${safeText(title)}`;
    let sub = section.querySelector(".premium-section-subtitle");
    if (!sub) {
      sub = document.createElement("p");
      sub.className = "premium-section-subtitle";
      titleEl?.insertAdjacentElement("afterend", sub);
    }
    sub.textContent = subtitle || "";
  }

  function renderPremiumNavbar() {
    const header = document.querySelector(".header-container");
    const logo = document.querySelector(".logo");
    if (!header || !logo || document.getElementById("premiumNav")) return;

    const menuBtn = document.createElement("button");
    menuBtn.className = "premium-menu-btn";
    menuBtn.type = "button";
    menuBtn.innerHTML = '<i class="fas fa-bars"></i>';
    menuBtn.setAttribute("aria-label", "فتح القائمة");

    const nav = document.createElement("nav");
    nav.className = "premium-nav";
    nav.id = "premiumNav";
    nav.innerHTML = `
      <button type="button" data-nav="home" class="active">الرئيسية</button>
      <button type="button" data-nav="products">المنتجات</button>
      <button type="button" data-nav="combo">الكومبوهات</button>
      <button type="button" data-nav="offers">العروض</button>
      <button type="button" data-nav="digital-cards">الكروت الإلكترونية</button>
      <button type="button" data-nav="contact">تواصل معنا</button>
    `;
    logo.insertAdjacentElement("afterend", nav);
    nav.insertAdjacentElement("beforebegin", menuBtn);

    menuBtn.addEventListener("click", () => nav.classList.toggle("open"));
    nav.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-nav]");
      if (!button) return;
      nav.classList.remove("open");
      nav.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
      const target = button.dataset.nav;
      if (target === "home") return callGlobal("showMainPage");
      if (target === "products") return premiumShowAllProducts("جميع المنتجات", "all");
      if (target === "combo") return premiumShowAllProducts("الكومبوهات", "combo");
      if (target === "digital-cards") return premiumShowAllProducts("الكروت الإلكترونية", "digital-cards");
      if (target === "offers") return document.getElementById("premiumOffersStage")?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (target === "contact") return document.querySelector(".support-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function productsForMainOffer() {
    const list = getSortedProducts();
    const exact = mainOffer.productIds.map((id) => list.find((product) => Number(product.id) === id)).filter(Boolean);
    if (exact.length >= 3) return exact;
    return [
      categoryProducts("motherboard")[0],
      categoryProducts("cpu")[0],
      categoryProducts("cooling")[0],
    ].filter(Boolean);
  }

  function renderOfferStage() {
    const notices = document.querySelector(".site-notices");
    if (!notices) return;
    let stage = document.getElementById("premiumOffersStage");
    if (!stage) {
      stage = document.createElement("section");
      stage.id = "premiumOffersStage";
      stage.className = "premium-offers-stage";
      notices.insertAdjacentElement("afterend", stage);
    }

    const parts = productsForMainOffer();
    const images = parts.slice(0, 3).map((product) => `<img src="${productImage(product)}" alt="${safeText(product.name)}" loading="lazy">`).join("");
    const comboProducts = categoryProducts("combo").filter(isAvailable);
    const discounted = getSortedProducts().filter((product) => product.oldPrice).sort((a, b) => Number(b.oldPrice || 0) - Number(b.price || 0) - (Number(a.oldPrice || 0) - Number(a.price || 0)));
    const miniProducts = [...comboProducts, ...discounted, ...categoryProducts("gpu")].filter(Boolean).slice(0, 3);

    stage.innerHTML = `
      <div class="premium-offer-grid">
        <article class="premium-offer-main" tabindex="0" data-offer="${mainOffer.id}">
          <div class="premium-offer-copy">
            <span class="premium-offer-badge"><i class="fas fa-bolt"></i>${safeText(mainOffer.badge)}</span>
            <h1 dir="auto">${safeText(mainOffer.shortTitle)}</h1>
            <p>كومبو مختار لمن يريد منصة AM5 قوية، أداء إنتاج وألعاب عالي، وتبريد مائي جاهز.</p>
            <ul class="premium-offer-parts">
              ${parts.map((product) => `<li dir="auto">${safeText(product.name)}</li>`).join("")}
            </ul>
            <div class="premium-offer-pricing">
              <strong class="premium-offer-price">${money(mainOffer.price)}</strong>
              <span class="premium-offer-old">${money(mainOffer.oldPrice)}</span>
              <span class="premium-offer-save">توفير ${money(mainOffer.oldPrice - mainOffer.price)}</span>
            </div>
            <div class="premium-offer-actions">
              <button type="button" class="premium-btn" data-offer-action="details"><i class="fas fa-eye"></i> عرض التفاصيل</button>
              <a class="premium-btn secondary" href="${buildOfferWhatsAppLink(mainOffer, parts)}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> طلب العرض</a>
            </div>
          </div>
          <div class="premium-offer-visual">
            <div class="premium-offer-images">${images}</div>
          </div>
        </article>
        <div class="premium-mini-stack">
          ${miniProducts.map((product) => `
            <article class="premium-mini-offer" tabindex="0" data-product="${safeText(product.id)}">
              <img src="${productImage(product)}" alt="${safeText(product.name)}" loading="lazy">
              <div>
                <span class="premium-card-kicker">${safeText(product.categoryLabel || "عرض")}</span>
                <h3 dir="auto">${safeText(product.name)}</h3>
                <p><strong>${money(product.price)}</strong>${product.oldPrice ? ` <span class="old-price">${money(product.oldPrice)}</span>` : ""}</p>
              </div>
            </article>
          `).join("")}
        </div>
      </div>
    `;

    stage.querySelector("[data-offer]")?.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      showOfferDetails(mainOffer.id);
    });
    stage.querySelector("[data-offer]")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") showOfferDetails(mainOffer.id);
    });
    stage.querySelectorAll("[data-product]").forEach((card) => {
      const id = Number(card.dataset.product);
      card.addEventListener("click", () => callGlobal("showProductModal", id));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter") callGlobal("showProductModal", id);
      });
    });
  }

  function buildOfferWhatsAppLink(offer, parts) {
    const message = [
      "مرحبا، مهتم بعرض:",
      offer.title,
      "",
      `السعر: ${money(offer.price)}`,
      "القطع:",
      ...parts.map((product) => `- ${product.name}`),
      "",
      window.location.href.split("#")[0],
    ].join("\n");
    return `https://wa.me/218931853169?text=${encodeURIComponent(message)}`;
  }

  function showOfferDetails() {
    const parts = productsForMainOffer();
    const modalContent = document.getElementById("productModalContent");
    if (!modalContent) {
      window.open(buildOfferWhatsAppLink(mainOffer, parts), "_blank", "noopener");
      return;
    }
    modalContent.innerHTML = `
      <div class="modal-product-images">
        <img src="${productImage(parts[0] || {})}" alt="${safeText(mainOffer.title)}" class="main-product-image">
      </div>
      <div class="modal-product-details">
        <span class="premium-offer-badge">${safeText(mainOffer.badge)}</span>
        <h2 dir="auto">${safeText(mainOffer.title)}</h2>
        <div class="modal-price">${money(mainOffer.price)}</div>
        <p class="modal-description">عرض كومبو مستقل يضم أكثر من قطعة، ويمكن طلبه مباشرة عبر واتساب.</p>
        <div class="offer-modal-products">
          ${parts.map((product) => `
            <div class="offer-modal-product">
              <img src="${productImage(product)}" alt="${safeText(product.name)}">
              <strong dir="auto">${safeText(product.name)}</strong>
              <span>${money(product.price)}</span>
            </div>
          `).join("")}
        </div>
        <div class="modal-actions">
          <a class="btn-modal btn-primary" href="${buildOfferWhatsAppLink(mainOffer, parts)}" target="_blank" rel="noopener">
            <i class="fab fa-whatsapp"></i> طلب العرض
          </a>
          <button class="btn-modal btn-secondary" onclick="closeModal('productModal')"><i class="fas fa-times"></i> إغلاق</button>
        </div>
      </div>
    `;
    callGlobal("openModal", "productModal");
  }

  function renderCatalogNav() {
    const stage = document.getElementById("premiumOffersStage");
    if (!stage) return;
    let nav = document.getElementById("premiumCatalogNav");
    if (!nav) {
      nav = document.createElement("section");
      nav.id = "premiumCatalogNav";
      nav.className = "premium-catalog-nav";
      stage.insertAdjacentElement("afterend", nav);
    }
    nav.innerHTML = `
      <div class="premium-catalog-head">
        <div>
          <span class="premium-section-kicker">الأقسام</span>
          <h2>تسوق حسب نوع القطعة</h2>
        </div>
        <button class="premium-btn secondary" type="button" data-show-all>عرض الكل</button>
      </div>
      <div class="premium-category-grid">
        ${CATEGORY_META.map((cat) => `
          <button class="premium-category-tile" type="button" data-category="${cat.key}">
            <i class="fas ${cat.icon}"></i>
            <strong>${safeText(cat.label)}</strong>
            <span>${safeText(cat.description)}</span>
          </button>
        `).join("")}
      </div>
    `;
    nav.querySelector("[data-show-all]")?.addEventListener("click", () => premiumShowAllProducts("جميع المنتجات", "all"));
    nav.querySelectorAll("[data-category]").forEach((button) => {
      button.addEventListener("click", () => {
        const cat = categoryMap.get(button.dataset.category);
        premiumShowAllProducts(cat?.label || "جميع المنتجات", button.dataset.category);
      });
    });
  }

  function renderSmartCategorySections() {
    const bottom = document.querySelector(".bottom-image-bar");
    if (!bottom) return;
    let wrapper = document.getElementById("smartCategorySections");
    if (!wrapper) {
      wrapper = document.createElement("section");
      wrapper.id = "smartCategorySections";
      wrapper.className = "smart-category-catalog";
      bottom.insertAdjacentElement("beforebegin", wrapper);
    }

    const sections = CATEGORY_META
      .map((cat) => ({ cat, products: sortProducts(categoryProducts(cat.key)).slice(0, 5) }))
      .filter((section) => section.products.length || section.cat.key === "digital-cards");

    wrapper.innerHTML = sections.map(({ cat, products }) => `
      <article class="smart-category-section" id="category-${cat.key}">
        <div class="smart-category-head">
          <div>
            <span class="category-kicker">${safeText(cat.description)}</span>
            <h2>${safeText(cat.label)}</h2>
          </div>
          <button class="premium-btn secondary" type="button" data-category-more="${cat.key}">عرض الكل</button>
        </div>
        <div class="category-products-row" id="categoryRow-${cat.key}">
          ${products.length ? products.map(renderProductCard).join("") : `<div class="category-empty">سيظهر هذا القسم بمجرد إضافة منتجاته من لوحة التحكم.</div>`}
        </div>
      </article>
    `).join("");

    wrapper.querySelectorAll("[data-category-more]").forEach((button) => {
      const cat = categoryMap.get(button.dataset.categoryMore);
      button.addEventListener("click", () => premiumShowAllProducts(cat?.label || "جميع المنتجات", button.dataset.categoryMore));
    });
    CATEGORY_META.forEach((cat) => attachProductEvents(`#categoryRow-${cat.key}`));
  }

  function fillSelect(select, options, firstLabel) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">${safeText(firstLabel)}</option>${options.map((option) => `<option value="${safeText(option.value)}">${safeText(option.label)}</option>`).join("")}`;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  function populateFilters() {
    const products = getAllProducts();
    const brandOptions = [...new Set(products.map((product) => product.brand).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), "en"))
      .map((brand) => ({ value: brand, label: brand }));
    const conditionOptions = [...new Set(products.map((product) => product.condition).filter(Boolean))]
      .map((condition) => ({ value: condition, label: condition }));
    const categoryOptions = CATEGORY_META.map((cat) => ({ value: cat.key, label: cat.label }));

    fillSelect(document.getElementById("categoryFilter"), categoryOptions, "جميع الأقسام");
    fillSelect(document.getElementById("allProductsCategoryFilter"), categoryOptions, "جميع الأقسام");
    fillSelect(document.getElementById("brandFilter"), brandOptions, "جميع الماركات");
    fillSelect(document.getElementById("allProductsBrandFilter"), brandOptions, "جميع الماركات");
    fillSelect(document.getElementById("conditionFilter"), conditionOptions, "جميع الحالات");
    fillSelect(document.getElementById("allProductsConditionFilter"), conditionOptions, "جميع الحالات");
  }

  function ensureAllProductsToolbar() {
    const filters = document.querySelector("#allProductsPage .filters-section");
    if (!filters || document.getElementById("premiumAllToolbar")) return;
    const toolbar = document.createElement("div");
    toolbar.id = "premiumAllToolbar";
    toolbar.className = "premium-all-toolbar";
    toolbar.innerHTML = `
      <div class="premium-chip-row" id="premiumCategoryChips">
        <button class="premium-chip active" type="button" data-category-chip="all">الكل</button>
        ${CATEGORY_META.map((cat) => `<button class="premium-chip" type="button" data-category-chip="${cat.key}">${safeText(cat.label)}</button>`).join("")}
      </div>
      <div class="premium-filter-tools">
        <label class="available-toggle"><input id="availableOnlyToggle" type="checkbox"> عرض المتوفر فقط</label>
        <select id="premiumSortSelect" class="filter-select sort-select" aria-label="ترتيب المنتجات">
          <option value="default">الترتيب الذكي</option>
          <option value="newest">الأحدث</option>
          <option value="price-low">السعر من الأقل للأعلى</option>
          <option value="price-high">السعر من الأعلى للأقل</option>
          <option value="best">الأكثر مبيعاً</option>
        </select>
      </div>
    `;
    filters.insertAdjacentElement("afterbegin", toolbar);

    toolbar.querySelectorAll("[data-category-chip]").forEach((button) => {
      button.addEventListener("click", () => {
        storeState.activeCategory = button.dataset.categoryChip || "all";
        const categorySelect = document.getElementById("allProductsCategoryFilter");
        if (categorySelect) categorySelect.value = storeState.activeCategory === "all" ? "" : storeState.activeCategory;
        premiumFilterAllProducts();
      });
    });
    toolbar.querySelector("#availableOnlyToggle")?.addEventListener("change", (event) => {
      storeState.onlyAvailable = event.target.checked;
      premiumFilterAllProducts();
    });
    toolbar.querySelector("#premiumSortSelect")?.addEventListener("change", (event) => {
      storeState.sort = event.target.value;
      premiumFilterAllProducts();
    });
  }

  function syncToolbarState() {
    document.querySelectorAll("[data-category-chip]").forEach((button) => {
      const value = button.dataset.categoryChip || "all";
      button.classList.toggle("active", value === storeState.activeCategory);
    });
    const toggle = document.getElementById("availableOnlyToggle");
    if (toggle) toggle.checked = storeState.onlyAvailable;
    const sort = document.getElementById("premiumSortSelect");
    if (sort) sort.value = storeState.sort;
  }

  function setupSearchSuggestions(input) {
    if (!input || input.dataset.premiumSearchReady) return;
    input.dataset.premiumSearchReady = "1";
    const container = input.closest(".search-container") || input.parentElement;
    if (!container) return;
    container.style.position = "relative";
    const suggestions = document.createElement("div");
    suggestions.className = "premium-search-suggestions";
    container.appendChild(suggestions);

    const draw = () => {
      const query = normalize(input.value);
      if (!query) {
        suggestions.classList.remove("active");
        suggestions.innerHTML = "";
        return;
      }
      const matches = getAllProducts().filter((product) => productText(product).includes(query)).slice(0, 6);
      suggestions.innerHTML = matches.length ? matches.map((product) => `
        <button class="premium-search-item" type="button" data-product="${safeText(product.id)}">
          <img src="${productImage(product)}" alt="${safeText(product.name)}" loading="lazy">
          <span><strong dir="auto">${safeText(product.name)}</strong><small>${safeText(product.categoryLabel || product.brand || "")}</small></span>
          <small>${money(product.price)}</small>
        </button>
      `).join("") : `<div class="premium-search-item"><span>لا توجد نتائج مباشرة</span></div>`;
      suggestions.classList.add("active");
      suggestions.querySelectorAll("[data-product]").forEach((button) => {
        button.addEventListener("click", () => {
          suggestions.classList.remove("active");
          callGlobal("showProductModal", Number(button.dataset.product));
        });
      });
    };

    input.addEventListener("input", draw);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && input.value.trim()) {
        event.preventDefault();
        storeState.search = input.value.trim();
        premiumShowAllProducts("نتائج البحث", "all", { search: storeState.search });
      }
    });
    document.addEventListener("click", (event) => {
      if (!container.contains(event.target)) suggestions.classList.remove("active");
    });
  }

  function setupFilterEvents() {
    ensureAllProductsToolbar();
    ["allProductsSearchInput", "allProductsCategoryFilter", "allProductsBrandFilter", "allProductsConditionFilter"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.premiumFilterReady) return;
      el.dataset.premiumFilterReady = "1";
      el.addEventListener(id.includes("Search") ? "input" : "change", premiumFilterAllProducts);
    });

    const mainSearch = document.getElementById("searchInput");
    setupSearchSuggestions(mainSearch);
    setupSearchSuggestions(document.getElementById("allProductsSearchInput"));

    const mainCategory = document.getElementById("categoryFilter");
    const mainBrand = document.getElementById("brandFilter");
    const mainCondition = document.getElementById("conditionFilter");

    if (mainCategory && !mainCategory.dataset.premiumMainReady) {
      mainCategory.dataset.premiumMainReady = "1";
      mainCategory.addEventListener("change", () => {
        const key = categoryFromValue(mainCategory.value);
        const cat = categoryMap.get(key);
        premiumShowAllProducts(cat?.label || "جميع المنتجات", key);
      });
    }
    if (mainBrand && !mainBrand.dataset.premiumMainReady) {
      mainBrand.dataset.premiumMainReady = "1";
      mainBrand.addEventListener("change", () => {
        premiumShowAllProducts("جميع المنتجات", "all");
        const target = document.getElementById("allProductsBrandFilter");
        if (target) target.value = mainBrand.value;
        premiumFilterAllProducts();
      });
    }
    if (mainCondition && !mainCondition.dataset.premiumMainReady) {
      mainCondition.dataset.premiumMainReady = "1";
      mainCondition.addEventListener("change", () => {
        premiumShowAllProducts("جميع المنتجات", "all");
        const target = document.getElementById("allProductsConditionFilter");
        if (target) target.value = mainCondition.value;
        premiumFilterAllProducts();
      });
    }
  }

  function inferCategoryFromTitle(title) {
    const normalized = normalize(title);
    const found = CATEGORY_META.find((cat) => normalize(cat.label) === normalized || normalized.includes(normalize(cat.label)));
    return found ? found.key : "all";
  }

  function getFilteredProducts(inputProducts) {
    annotateProducts();
    const searchInput = document.getElementById("allProductsSearchInput");
    const categorySelect = document.getElementById("allProductsCategoryFilter");
    const brandSelect = document.getElementById("allProductsBrandFilter");
    const conditionSelect = document.getElementById("allProductsConditionFilter");

    const query = normalize(storeState.search || searchInput?.value || "");
    const categoryKey = categoryFromValue(categorySelect?.value || storeState.activeCategory);
    const brand = brandSelect?.value || "";
    const condition = conditionSelect?.value || "";

    let list = (inputProducts || getAllProducts()).filter(Boolean);
    if (categoryKey && categoryKey !== "all") list = list.filter((product) => product.categoryKey === categoryKey);
    if (storeState.onlyAvailable) list = list.filter(isAvailable);
    if (brand) list = list.filter((product) => product.brand === brand);
    if (condition) list = list.filter((product) => product.condition === condition);
    if (query) list = list.filter((product) => productText(product).includes(query));
    return sortProducts(list, storeState.sort);
  }

  function premiumRenderAllProductsGrid(products) {
    const grid = document.getElementById("allProductsGrid");
    if (!grid) return;
    const list = products ? sortProducts(products, storeState.sort) : getFilteredProducts();
    grid.innerHTML = list.length ? list.map(renderProductCard).join("") : emptyState("لم يتم العثور على منتجات مطابقة");
    attachProductEvents("#allProductsGrid");
    syncToolbarState();
  }

  function premiumFilterAllProducts() {
    const categorySelect = document.getElementById("allProductsCategoryFilter");
    storeState.activeCategory = categoryFromValue(categorySelect?.value || storeState.activeCategory || "all");
    storeState.search = document.getElementById("allProductsSearchInput")?.value || "";
    storeState.onlyAvailable = Boolean(document.getElementById("availableOnlyToggle")?.checked);
    storeState.sort = document.getElementById("premiumSortSelect")?.value || storeState.sort || "default";
    premiumRenderAllProductsGrid(getFilteredProducts());
  }

  function premiumShowAllProducts(sectionTitle = "جميع المنتجات", categoryKey = "", options = {}) {
    const main = document.querySelector(".main-content");
    const page = document.getElementById("allProductsPage");
    if (main) main.style.display = "none";
    if (page) page.classList.add("active");

    const resolvedCategory = categoryKey ? categoryFromValue(categoryKey) : inferCategoryFromTitle(sectionTitle);
    storeState.activeCategory = resolvedCategory || "all";
    if (options.search != null) storeState.search = String(options.search);

    const titleEl = document.getElementById("allProductsTitle");
    if (titleEl) titleEl.textContent = sectionTitle === "جميع المنتجات" ? "جميع المنتجات" : `${sectionTitle} - جميع المنتجات`;

    populateFilters();
    ensureAllProductsToolbar();
    const categorySelect = document.getElementById("allProductsCategoryFilter");
    if (categorySelect) categorySelect.value = storeState.activeCategory === "all" ? "" : storeState.activeCategory;
    const searchInput = document.getElementById("allProductsSearchInput");
    if (searchInput && options.search != null) searchInput.value = storeState.search;
    setupFilterEvents();
    premiumRenderAllProductsGrid(getFilteredProducts());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function premiumLoadProducts() {
    annotateProducts();
    populateFilters();
    renderPremiumNavbar();
    renderOfferStage();
    renderCatalogNav();

    const all = getSortedProducts();
    const featuredFallback = all.filter((product) => isAvailable(product) && ((product.tags || []).includes("bestSelling") || (product.tags || []).includes("featured"))).slice(0, 5);
    const offersFallback = all.filter((product) => product.oldPrice || product.categoryKey === "combo").slice(0, 5);
    const comingFallback = all.filter((product) => product.availability === "comingSoon").slice(0, 5);

    premiumRenderProductsGrid("bestSellingProducts", getHomepageProducts("best_sellers", featuredFallback.length ? featuredFallback : all.filter(isAvailable).slice(0, 5)));
    premiumRenderProductsGrid("discountedProducts", getHomepageProducts("offers", offersFallback));
    premiumRenderProductsGrid("comingSoonProducts", getHomepageProducts("coming_soon", comingFallback));

    setSectionTitle("bestSellingProducts", "منتجات مميزة", "fa-star", "اختيارات جاهزة من القطع الأكثر طلباً.");
    setSectionTitle("discountedProducts", "الكومبوهات والعروض", "fa-tags", "تجميعات وعروض مختارة بقيمة أفضل.");
    setSectionTitle("comingSoonProducts", "قريباً في المتجر", "fa-clock", "قطع جديدة تصل قريباً.");

    try {
      if (typeof syncHomepageSectionShells === "function") syncHomepageSectionShells();
    } catch {}

    renderSmartCategorySections();
    setupFilterEvents();
  }

  function subscribeToChanges() {
    if (window.__SWITCHES_PREMIUM_SUBSCRIBED__) return;
    if (!window.SwitchesSupabaseStore?.configured?.() || !window.SwitchesSupabaseStore?.subscribeToStoreChanges) return;
    window.__SWITCHES_PREMIUM_SUBSCRIBED__ = true;
    window.SwitchesSupabaseStore.subscribeToStoreChanges(async () => {
      try {
        if (typeof loadProductsFromSupabase === "function") await loadProductsFromSupabase();
        premiumLoadProducts();
        if (document.getElementById("allProductsPage")?.classList.contains("active")) premiumFilterAllProducts();
      } catch (error) {
        console.warn("Switches premium refresh failed", error);
      }
    });
  }

  function installLifecycleHooks() {
    if (window.__SWITCHES_PREMIUM_LIFECYCLE__) return;
    window.__SWITCHES_PREMIUM_LIFECYCLE__ = true;

    if (typeof window.initApp === "function") {
      const originalInitApp = window.initApp;
      window.initApp = function (...args) {
        const result = originalInitApp.apply(this, args);
        window.setTimeout(premiumLoadProducts, 0);
        return result;
      };
    }

    if (typeof window.loadProductsFromSupabase === "function") {
      const originalLoader = window.loadProductsFromSupabase;
      window.loadProductsFromSupabase = async function (...args) {
        const result = await originalLoader.apply(this, args);
        window.setTimeout(premiumLoadProducts, 0);
        return result;
      };
    }
  }

  try {
    if (!localStorage.getItem("theme")) localStorage.setItem("theme", "dark");
  } catch {}

  window.renderProductsGrid = premiumRenderProductsGrid;
  window.renderAllProductsGrid = premiumRenderAllProductsGrid;
  window.renderAllProducts = () => premiumRenderAllProductsGrid(getFilteredProducts());
  window.filterAllProducts = premiumFilterAllProducts;
  window.showAllProducts = premiumShowAllProducts;
  window.loadProducts = premiumLoadProducts;
  window.showOfferDetails = showOfferDetails;
  installLifecycleHooks();

  document.addEventListener("DOMContentLoaded", () => {
    premiumLoadProducts();
    window.setTimeout(premiumLoadProducts, 800);
    window.setTimeout(premiumLoadProducts, 2200);
    subscribeToChanges();
  });
})();
