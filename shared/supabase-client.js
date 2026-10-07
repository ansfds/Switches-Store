(function () {
  const config = window.SWITCHES_SUPABASE_CONFIG || {};
  const bucketName = config.storageBucket || "store-media";
  const GIFT_CARD_STATUSES = ["AVAILABLE", "COMING_SOON", "UNAVAILABLE", "HIDDEN"];
  let client = null;
  let cachedProfile = null;

  function configured() {
    return Boolean(
      config.url &&
      config.publishableKey &&
      !String(config.url).includes("YOUR_PROJECT_REF") &&
      !String(config.publishableKey).includes("YOUR_SUPABASE")
    );
  }

  function supabaseClient() {
    if (!configured()) {
      throw new Error("Supabase غير مهيأ. عدّل backend/static/shared/supabase-config.js.");
    }
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("تعذر تحميل مكتبة Supabase من CDN.");
    }
    if (!client) {
      client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    }
    return client;
  }

  function nowTs() {
    return Math.floor(Date.now() / 1000);
  }

  function bool(value) {
    return value === true || value === 1 || value === "1";
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function asObject(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    if (!value) return {};
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  function slugify(text) {
    const slug = String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w\-\u0600-\u06FF]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return slug || `product-${nowTs()}`;
  }

  function giftCardSlug(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function cleanGiftUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    if (/^\/(assets|data)\//.test(trimmed)) return trimmed;
    try {
      const url = new URL(trimmed);
      return url.protocol === "http:" || url.protocol === "https:" ? trimmed : "";
    } catch {
      return "";
    }
  }

  function normalizeGiftCardStatus(status) {
    const normalized = String(status || "AVAILABLE").trim().toUpperCase();
    return GIFT_CARD_STATUSES.includes(normalized) ? normalized : "AVAILABLE";
  }

  async function parseJsonBody(body) {
    if (!body) return {};
    if (body instanceof FormData) return body;
    if (typeof body === "string") return body ? JSON.parse(body) : {};
    return body;
  }

  function throwIf(error, fallback) {
    if (error) throw new Error(error.message || fallback || "حدث خطأ غير متوقع.");
  }

  function productFromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name || "",
      shortDescription: row.short_description || "",
      description: row.description || "",
      category: row.category || "",
      brand: row.brand || "",
      sku: row.sku || "",
      price: Number(row.price || 0),
      oldPrice: row.old_price == null ? null : Number(row.old_price),
      condition: row.condition || "جديد",
      images: asArray(row.images_json),
      specs: asObject(row.specs_json),
      tags: asArray(row.tags_json),
      stockQty: Number(row.stock_qty || 0),
      lowStockThreshold: Number(row.low_stock_threshold || 3),
      trackStock: bool(row.track_stock),
      availability: row.availability || "available",
      status: row.status || "published",
      seoTitle: row.seo_title || "",
      metaDescription: row.meta_description || "",
      slug: row.slug || "",
      isActive: bool(row.is_active),
      isDeleted: bool(row.is_deleted),
      sortOrder: Number(row.sort_order || 0),
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0),
    };
  }

  function productToRow(payload, uniqueSuffix) {
    const baseSlug = slugify(payload.slug || payload.name);
    return {
      name: payload.name || "",
      short_description: payload.shortDescription || "",
      description: payload.description || "",
      category: payload.category || "",
      brand: payload.brand || "",
      sku: payload.sku || "",
      price: Number(payload.price || 0),
      old_price: payload.oldPrice == null || payload.oldPrice === "" ? null : Number(payload.oldPrice),
      condition: payload.condition || "جديد",
      images_json: payload.images || [],
      specs_json: payload.specs || {},
      tags_json: payload.tags || [],
      stock_qty: Number(payload.stockQty || 0),
      low_stock_threshold: Number(payload.lowStockThreshold || 3),
      track_stock: bool(payload.trackStock),
      availability: payload.availability || "available",
      status: payload.status || "published",
      seo_title: payload.seoTitle || "",
      meta_description: payload.metaDescription || "",
      slug: uniqueSuffix ? `${baseSlug}-${uniqueSuffix}` : baseSlug,
      is_active: payload.isActive !== false,
      sort_order: Number(payload.sortOrder || 0),
      updated_at: nowTs(),
    };
  }

  function orderFromRow(row) {
    return {
      id: row.id,
      fullName: row.full_name || "",
      phone: row.phone || "",
      email: row.email || "",
      address: row.address || "",
      notes: row.notes || "",
      items: asArray(row.items_json),
      subtotal: Number(row.subtotal || 0),
      discount: Number(row.discount || 0),
      shipping: Number(row.shipping || 0),
      total: Number(row.total || 0),
      paymentMethod: row.payment_method || "cash",
      couponCode: row.coupon_code || "",
      status: row.status || "new",
      internalNote: row.internal_note || "",
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0),
    };
  }

  function couponFromRow(row) {
    return {
      id: row.id,
      code: row.code || "",
      discountType: row.discount_type || "percent",
      discountValue: Number(row.discount_value || 0),
      minOrder: Number(row.min_order || 0),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      maxUses: row.max_uses,
      usedCount: Number(row.used_count || 0),
      isActive: bool(row.is_active),
    };
  }

  function couponToRow(payload) {
    return {
      code: String(payload.code || "").trim().toUpperCase(),
      discount_type: payload.discountType || "percent",
      discount_value: Number(payload.discountValue || 0),
      min_order: Number(payload.minOrder || 0),
      starts_at: payload.startsAt || null,
      ends_at: payload.endsAt || null,
      max_uses: payload.maxUses == null || payload.maxUses === "" ? null : Number(payload.maxUses),
      is_active: payload.isActive !== false,
      updated_at: nowTs(),
    };
  }

  function entityFromRow(row) {
    return {
      id: row.id,
      name: row.name || "",
      image: row.image || "",
      description: row.description || "",
      sortOrder: Number(row.sort_order || 0),
      isActive: bool(row.is_active),
    };
  }

  function entityToRow(payload) {
    return {
      name: String(payload.name || "").trim(),
      image: payload.image || "",
      description: payload.description || "",
      sort_order: Number(payload.sortOrder || 0),
      is_active: payload.isActive !== false,
      updated_at: nowTs(),
    };
  }

  function slideFromRow(row) {
    return {
      id: row.id,
      badge: row.badge || "",
      title: row.title || "",
      description: row.description || "",
      imageUrl: row.image_url || "",
      imageAlt: row.image_alt || "",
      primaryButtonText: row.primary_button_text || "",
      primaryButtonLink: row.primary_button_link || "",
      secondaryButtonText: row.secondary_button_text || "",
      secondaryButtonLink: row.secondary_button_link || "",
      productId: row.product_id,
      sortOrder: Number(row.sort_order || 0),
      isActive: bool(row.is_active),
    };
  }

  function slideToRow(payload) {
    return {
      badge: payload.badge || "",
      title: payload.title || "",
      description: payload.description || "",
      image_url: payload.imageUrl || "",
      image_alt: payload.imageAlt || "",
      primary_button_text: payload.primaryButtonText || "",
      primary_button_link: payload.primaryButtonLink || "",
      secondary_button_text: payload.secondaryButtonText || "",
      secondary_button_link: payload.secondaryButtonLink || "",
      product_id: payload.productId || null,
      sort_order: Number(payload.sortOrder || 0),
      is_active: payload.isActive !== false,
      updated_at: nowTs(),
    };
  }

  function giftCardDenominationFromRow(row) {
    const faceValue = Number(row.face_value || 0);
    const currency = row.currency || "USD";
    const highlightEffect = row.highlight_effect || "none";
    return {
      id: row.id,
      giftCardId: row.gift_card_id,
      faceValue,
      value: faceValue,
      currency,
      sellingPriceLYD: Number(row.selling_price_lyd || 0),
      available: bool(row.is_available),
      isAvailable: bool(row.is_available),
      isMostPopular: bool(row.is_most_popular),
      highlightEffect,
      flame: highlightEffect === "flame",
      sortOrder: Number(row.sort_order || 0),
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0),
    };
  }

  function giftCardDenominationToRow(payload, giftCardId) {
    const effect = String(payload.highlightEffect || payload.highlight_effect || "").toLowerCase() === "flame" || payload.flame === true ? "flame" : "none";
    return {
      gift_card_id: giftCardId,
      face_value: Number(payload.faceValue ?? payload.value ?? 0),
      currency: String(payload.currency || "USD").trim().toUpperCase(),
      selling_price_lyd: Number(payload.sellingPriceLYD ?? payload.selling_price_lyd ?? 0),
      is_available: payload.isAvailable !== false && payload.available !== false,
      is_most_popular: bool(payload.isMostPopular ?? payload.is_most_popular),
      highlight_effect: effect,
      sort_order: Number(payload.sortOrder ?? payload.sort_order ?? 0),
      updated_at: nowTs(),
    };
  }

  function giftCardFromRow(row, denominationRows) {
    const status = normalizeGiftCardStatus(row.status);
    const slug = row.slug || giftCardSlug(row.name);
    const currency = row.currency || "USD";
    const regionCode = row.region_code || "US";
    const regionLabel = row.region_label || "ريجن أمريكي";
    const denominations = (denominationRows || []).map(giftCardDenominationFromRow).sort((a, b) => {
      const order = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
      return order || Number(a.faceValue || 0) - Number(b.faceValue || 0);
    });
    return {
      id: row.id,
      slug,
      name: row.name || row.display_name || "",
      displayName: row.display_name || row.name || "",
      shortName: row.short_name || row.display_name || row.name || "",
      iconClass: row.icon_class || "fa-solid fa-gift",
      accent: row.accent || "#7c3aed",
      description: row.description || "",
      regionCode,
      regionLabel,
      currency,
      imageUrl: row.image_url || "",
      backgroundUrl: row.background_url || "",
      status,
      available: status === "AVAILABLE",
      sortOrder: Number(row.sort_order || 0),
      isDeleted: bool(row.is_deleted),
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0),
      managedGiftCard: true,
      denominations,
      regions: [
        {
          id: String(regionCode || "US").trim().toLowerCase(),
          name: regionLabel,
          label: regionLabel,
          flag: "",
          currency,
          available: status === "AVAILABLE",
          denominations,
        },
      ],
    };
  }

  function giftCardToRow(payload) {
    const name = String(payload.name || payload.displayName || "").trim();
    const slug = giftCardSlug(payload.slug || name);
    if (!name) throw new Error("اكتب اسم Gift Card.");
    if (!slug) throw new Error("Slug غير صالح.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Slug يجب أن يحتوي على أحرف إنجليزية صغيرة وأرقام وشرطات فقط.");
    const status = normalizeGiftCardStatus(payload.status);
    return {
      name,
      display_name: String(payload.displayName || name).trim(),
      short_name: String(payload.shortName || payload.displayName || name).trim(),
      slug,
      description: String(payload.description || "").trim(),
      region_code: String(payload.regionCode || payload.region_code || "US").trim().toUpperCase(),
      region_label: String(payload.regionLabel || payload.region_label || "ريجن أمريكي").trim(),
      currency: String(payload.currency || "USD").trim().toUpperCase(),
      image_url: cleanGiftUrl(payload.imageUrl ?? payload.image_url),
      background_url: cleanGiftUrl(payload.backgroundUrl ?? payload.background_url),
      icon_class: String(payload.iconClass || payload.icon_class || "fa-solid fa-gift").trim(),
      accent: String(payload.accent || "#7c3aed").trim(),
      status,
      sort_order: Number(payload.sortOrder ?? payload.sort_order ?? 0),
      updated_at: nowTs(),
    };
  }

  function adToRow(payload) {
    return {
      title: payload.title || "",
      text: payload.text || "",
      image_url: payload.imageUrl || "",
      link_url: payload.linkUrl || "",
      placement: payload.placement || "home",
      starts_at: payload.startsAt || null,
      ends_at: payload.endsAt || null,
      is_active: payload.isActive !== false,
      updated_at: nowTs(),
    };
  }

  function profileFromRow(row) {
    return {
      id: row.id,
      userId: row.user_id,
      email: row.email || "",
      username: row.display_name || row.email || "",
      role: row.role || "employee",
      isActive: bool(row.is_active),
      createdAt: Number(row.created_at || 0),
    };
  }

  async function currentAdminProfile(force) {
    if (cachedProfile && !force) return cachedProfile;
    const sb = supabaseClient();
    const userResult = await sb.auth.getUser();
    throwIf(userResult.error, "انتهت جلسة الدخول.");
    const user = userResult.data && userResult.data.user;
    if (!user) throw new Error("يجب تسجيل الدخول أولاً.");
    const { data, error } = await sb.from("admin_profiles").select("*").eq("user_id", user.id).maybeSingle();
    throwIf(error, "تعذر التحقق من صلاحيات الأدمن.");
    if (!data || !data.is_active) {
      await sb.auth.signOut();
      cachedProfile = null;
      throw new Error("هذا المستخدم غير مفعل كأدمن.");
    }
    cachedProfile = profileFromRow({ ...data, email: data.email || user.email });
    return cachedProfile;
  }

  async function hasSession() {
    try {
      const result = await supabaseClient().auth.getSession();
      return Boolean(result.data && result.data.session);
    } catch {
      return false;
    }
  }

  async function signOut() {
    cachedProfile = null;
    await supabaseClient().auth.signOut();
  }

  async function logAction(action, entityType, entityId, details) {
    try {
      const me = await currentAdminProfile();
      await supabaseClient().from("activity_logs").insert({
        user_id: me.id,
        username: me.username,
        action,
        entity_type: entityType || "",
        entity_id: String(entityId || ""),
        details: details || "",
        created_at: nowTs(),
      });
    } catch {
      /* Activity log must never block the admin workflow. */
    }
  }

  async function listProducts(includeDeleted) {
    let query = supabaseClient().from("products").select("*").order("id", { ascending: false });
    if (!includeDeleted) query = query.eq("is_deleted", false);
    const { data, error } = await query;
    throwIf(error, "تعذر تحميل المنتجات.");
    return (data || []).map(productFromRow);
  }

  async function getProduct(id) {
    const { data, error } = await supabaseClient().from("products").select("*").eq("id", id).maybeSingle();
    throwIf(error, "تعذر تحميل المنتج.");
    if (!data) throw new Error("المنتج غير موجود.");
    return productFromRow(data);
  }

  async function saveProduct(payload, id) {
    const row = productToRow(payload, id ? "" : Date.now());
    if (id) {
      const { error } = await supabaseClient().from("products").update(row).eq("id", id);
      throwIf(error, "تعذر تحديث المنتج.");
      await logAction("تعديل منتج", "product", id, payload.name);
      return { message: "تم تحديث المنتج.", id };
    }
    row.created_at = nowTs();
    row.is_deleted = false;
    const { data, error } = await supabaseClient().from("products").insert(row).select("id,slug").single();
    throwIf(error, "تعذر إضافة المنتج.");
    const finalSlug = data.slug ? `${data.slug}-${data.id}` : `product-${data.id}`;
    await supabaseClient().from("products").update({ slug: finalSlug, updated_at: nowTs() }).eq("id", data.id).eq("slug", row.slug);
    await logAction("إضافة منتج", "product", data.id, payload.name);
    return { message: "تمت إضافة المنتج.", id: data.id };
  }

  async function duplicateProduct(id) {
    const product = await getProduct(id);
    product.name = `${product.name} - نسخة`;
    product.slug = "";
    product.sku = product.sku ? `${product.sku}-COPY` : "";
    return saveProduct(product);
  }

  async function softDeleteProduct(id) {
    const { error } = await supabaseClient().from("products").update({
      is_deleted: true,
      is_active: false,
      deleted_at: nowTs(),
      updated_at: nowTs(),
    }).eq("id", id);
    throwIf(error, "تعذر حذف المنتج.");
    await logAction("حذف منتج", "product", id, "");
    return { message: "تم حذف المنتج." };
  }

  async function updateStock(id, quantity) {
    const { error } = await supabaseClient().from("products").update({
      stock_qty: Number(quantity || 0),
      updated_at: nowTs(),
    }).eq("id", id);
    throwIf(error, "تعذر تحديث المخزون.");
    await logAction("تعديل المخزون", "product", id, String(quantity || 0));
    return { message: "تم تحديث المخزون." };
  }

  async function listEntities(table) {
    const { data, error } = await supabaseClient().from(table).select("*").order("sort_order").order("name");
    throwIf(error, "تعذر تحميل البيانات.");
    return (data || []).map(entityFromRow);
  }

  async function saveEntity(table, payload, id) {
    const row = entityToRow(payload);
    if (id) {
      const oldList = await listEntities(table);
      const old = oldList.find((item) => Number(item.id) === Number(id));
      const { error } = await supabaseClient().from(table).update(row).eq("id", id);
      throwIf(error, "تعذر حفظ البيانات.");
      if (old && old.name !== payload.name && ["categories", "brands"].includes(table)) {
        const column = table === "categories" ? "category" : "brand";
        await supabaseClient().from("products").update({ [column]: payload.name, updated_at: nowTs() }).eq(column, old.name);
      }
      await logAction(`تعديل ${table}`, table, id, payload.name);
      return { message: "تم التحديث.", id };
    }
    row.created_at = nowTs();
    const { data, error } = await supabaseClient().from(table).insert(row).select("id").single();
    throwIf(error, "تعذر إضافة البيانات.");
    await logAction(`إضافة ${table}`, table, data.id, payload.name);
    return { message: "تمت الإضافة.", id: data.id };
  }

  async function deleteEntity(table, id) {
    const { error } = await supabaseClient().from(table).delete().eq("id", id);
    throwIf(error, "تعذر الحذف.");
    await logAction(`حذف ${table}`, table, id, "");
    return { message: "تم الحذف." };
  }

  async function listCoupons() {
    const { data, error } = await supabaseClient().from("coupons").select("*").order("id", { ascending: false });
    throwIf(error, "تعذر تحميل الكوبونات.");
    return (data || []).map(couponFromRow);
  }

  async function saveCoupon(payload, id) {
    const row = couponToRow(payload);
    if (id) {
      const { error } = await supabaseClient().from("coupons").update(row).eq("id", id);
      throwIf(error, "تعذر تحديث الكوبون.");
      await logAction("تعديل كوبون", "coupon", id, row.code);
      return { message: "تم تحديث الكوبون.", id };
    }
    row.created_at = nowTs();
    row.used_count = 0;
    const { data, error } = await supabaseClient().from("coupons").insert(row).select("id").single();
    throwIf(error, "تعذر إنشاء الكوبون.");
    await logAction("إنشاء كوبون", "coupon", data.id, row.code);
    return { message: "تم إنشاء الكوبون.", id: data.id };
  }

  async function listOrders() {
    const { data, error } = await supabaseClient().from("orders").select("*").eq("is_deleted", false).order("id", { ascending: false });
    throwIf(error, "تعذر تحميل الطلبات.");
    return (data || []).map(orderFromRow);
  }

  async function getOrder(id) {
    const { data, error } = await supabaseClient().from("orders").select("*").eq("id", id).eq("is_deleted", false).maybeSingle();
    throwIf(error, "تعذر تحميل الطلب.");
    if (!data) throw new Error("الطلب غير موجود.");
    return orderFromRow(data);
  }

  async function updateOrder(id, payload) {
    const row = { updated_at: nowTs() };
    if (payload.status != null) row.status = payload.status;
    if (payload.internalNote != null) row.internal_note = payload.internalNote;
    const { error } = await supabaseClient().from("orders").update(row).eq("id", id);
    throwIf(error, "تعذر تحديث الطلب.");
    await logAction("تحديث الطلب", "order", id, payload.status || "");
    return { message: "تم تحديث الطلب." };
  }

  async function deleteOrder(id) {
    const { error } = await supabaseClient().from("orders").update({
      is_deleted: true,
      deleted_at: nowTs(),
      updated_at: nowTs(),
    }).eq("id", id);
    throwIf(error, "تعذر حذف الطلب.");
    await logAction("حذف طلب", "order", id, "");
    return { message: "تم حذف الطلب." };
  }

  function buildCustomers(orders) {
    const byPhone = new Map();
    orders.forEach((order) => {
      if (!order.phone) return;
      const item = byPhone.get(order.phone) || {
        name: order.fullName,
        phone: order.phone,
        email: order.email,
        orderCount: 0,
        totalSpent: 0,
        lastOrderAt: 0,
        orders: [],
      };
      item.orderCount += 1;
      item.totalSpent += Number(order.total || 0);
      item.lastOrderAt = Math.max(item.lastOrderAt, Number(order.createdAt || 0));
      item.orders.push(order);
      byPhone.set(order.phone, item);
    });
    return [...byPhone.values()].sort((a, b) => b.lastOrderAt - a.lastOrderAt);
  }

  const DEFAULT_HOMEPAGE_SECTIONS = [
    { key: "featured_hero", title: "العروض الرئيسية", sortOrder: 5, maxItems: 4, isVisible: true },
    { key: "best_sellers", title: "منتجات مميزة", sortOrder: 10, maxItems: 4, isVisible: true },
    { key: "offers", title: "الكومبوهات والعروض", sortOrder: 20, maxItems: 4, isVisible: true },
    { key: "coming_soon", title: "قريبًا في المتجر", sortOrder: 30, maxItems: 4, isVisible: true },
  ];

  function defaultHomepageSection(key) {
    return DEFAULT_HOMEPAGE_SECTIONS.find((section) => section.key === key) || {
      key,
      title: key,
      sortOrder: 99,
      maxItems: 4,
      isVisible: true,
    };
  }

  function mergeHomepageDefaults(sections) {
    const byKey = new Map((sections || []).map((section) => [section.section_key, section]));
    DEFAULT_HOMEPAGE_SECTIONS.forEach((section) => {
      if (byKey.has(section.key)) return;
      byKey.set(section.key, {
        section_key: section.key,
        title: section.title,
        is_visible: section.isVisible,
        sort_order: section.sortOrder,
        max_items: section.maxItems,
      });
    });
    return [...byKey.values()].sort((a, b) => {
      const order = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      return order || String(a.section_key || "").localeCompare(String(b.section_key || ""));
    });
  }

  async function ensureHomepageSection(key) {
    const sb = supabaseClient();
    const { data, error } = await sb.from("homepage_sections").select("section_key").eq("section_key", key).maybeSingle();
    throwIf(error, "تعذر فحص قسم الصفحة الرئيسية.");
    if (data) return;

    const defaults = defaultHomepageSection(key);
    const { error: insertError } = await sb.from("homepage_sections").insert({
      section_key: key,
      title: defaults.title,
      is_visible: defaults.isVisible !== false,
      sort_order: Number(defaults.sortOrder || 0),
      max_items: Number(defaults.maxItems || 4),
      created_at: nowTs(),
      updated_at: nowTs(),
    });
    throwIf(insertError, "تعذر إنشاء قسم الصفحة الرئيسية.");
  }

  async function listHomepage(adminMode) {
    const sb = supabaseClient();
    let sectionsQuery = sb.from("homepage_sections").select("*").order("sort_order").order("section_key");
    const [sectionsResult, itemsResult, products] = await Promise.all([
      sectionsQuery,
      sb.from("homepage_items").select("*").order("slot_index"),
      adminMode ? listProducts(true) : listPublicProducts(),
    ]);
    throwIf(sectionsResult.error, "تعذر تحميل أقسام الرئيسية.");
    throwIf(itemsResult.error, "تعذر تحميل منتجات الرئيسية.");
    const productById = new Map(products.map((product) => [Number(product.id), product]));
    const sections = adminMode ? mergeHomepageDefaults(sectionsResult.data || []) : (sectionsResult.data || []);
    return sections.map((section) => {
      const maxItems = Number(section.max_items || 4);
      const items = (itemsResult.data || [])
        .filter((item) => item.section_key === section.section_key)
        .map((item) => ({
          slot: Number(item.slot_index || 0),
          product: productById.get(Number(item.product_id)),
          customPrice: item.custom_price == null ? null : Number(item.custom_price),
          startsAt: item.starts_at,
          endsAt: item.ends_at,
        }))
        .filter((item) => item.product);

      if (adminMode) {
        const slots = Array.from({ length: Math.max(4, maxItems) }, () => null);
        items.forEach((item) => {
          const index = Math.max(0, Math.min(slots.length - 1, Number(item.slot || 1) - 1));
          slots[index] = item;
        });
        return {
          key: section.section_key,
          title: section.title,
          isVisible: bool(section.is_visible),
          sortOrder: Number(section.sort_order || 0),
          maxItems,
          items: slots,
        };
      }

      return {
        key: section.section_key,
        title: section.title,
        isVisible: bool(section.is_visible),
        sortOrder: Number(section.sort_order || 0),
        maxItems,
        items,
      };
    });
  }

  async function updateHomepageSection(key, payload) {
    await ensureHomepageSection(key);
    const { error } = await supabaseClient().from("homepage_sections").update({
      title: payload.title || "",
      is_visible: payload.isVisible !== false,
      sort_order: Number(payload.sortOrder || 0),
      max_items: Number(payload.maxItems || 4),
      updated_at: nowTs(),
    }).eq("section_key", key);
    throwIf(error, "تعذر تحديث القسم.");
    await logAction("تعديل قسم الرئيسية", "homepage", key, payload.title || "");
    return { message: "تم تحديث القسم." };
  }

  async function updateHomepageItems(key, payload) {
    const sb = supabaseClient();
    await ensureHomepageSection(key);
    const { error: deleteError } = await sb.from("homepage_items").delete().eq("section_key", key);
    throwIf(deleteError, "تعذر تحديث منتجات القسم.");
    const rows = (payload.items || []).map((item, index) => ({
      section_key: key,
      slot_index: Number(item.slot || item.slotIndex || index + 1),
      product_id: item.productId,
      custom_price: item.customPrice == null ? null : Number(item.customPrice),
      starts_at: item.startsAt || null,
      ends_at: item.endsAt || null,
      created_at: nowTs(),
      updated_at: nowTs(),
    }));
    if (rows.length) {
      const { error } = await sb.from("homepage_items").insert(rows);
      throwIf(error, "تعذر حفظ منتجات القسم.");
    }
    await logAction("تغيير منتجات الرئيسية", "homepage", key, `${rows.length} منتجات`);
    return { message: "تم حفظ ترتيب المنتجات." };
  }

  async function listSlides(adminMode) {
    let query = supabaseClient().from("hero_slides").select("*").order("sort_order").order("id");
    if (!adminMode) query = query.eq("is_active", true);
    const { data, error } = await query;
    throwIf(error, "تعذر تحميل البانرات.");
    return (data || []).map(slideFromRow);
  }

  async function saveSlide(payload, id) {
    const row = slideToRow(payload);
    if (id) {
      const { error } = await supabaseClient().from("hero_slides").update(row).eq("id", id);
      throwIf(error, "تعذر تحديث البانر.");
      await logAction("تعديل بانر", "hero", id, payload.title || "");
      return { message: "تم تحديث البانر.", id };
    }
    row.created_at = nowTs();
    const { data, error } = await supabaseClient().from("hero_slides").insert(row).select("id").single();
    throwIf(error, "تعذر إضافة البانر.");
    await logAction("إضافة بانر", "hero", data.id, payload.title || "");
    return { message: "تمت إضافة البانر.", id: data.id };
  }

  async function listAds(adminMode) {
    const ts = nowTs();
    let query = supabaseClient().from("ads").select("*").order("id", { ascending: false });
    if (!adminMode) query = query.eq("is_active", true).or(`starts_at.is.null,starts_at.lte.${ts}`).or(`ends_at.is.null,ends_at.gte.${ts}`);
    const { data, error } = await query;
    throwIf(error, "تعذر تحميل الإعلانات.");
    return data || [];
  }

  async function saveAd(payload, id) {
    const row = adToRow(payload);
    if (id) {
      const { error } = await supabaseClient().from("ads").update(row).eq("id", id);
      throwIf(error, "تعذر تحديث الإعلان.");
      await logAction("تعديل إعلان", "ad", id, payload.title || "");
      return { message: "تم تحديث الإعلان.", id };
    }
    row.created_at = nowTs();
    const { data, error } = await supabaseClient().from("ads").insert(row).select("id").single();
    throwIf(error, "تعذر إضافة الإعلان.");
    await logAction("إضافة إعلان", "ad", data.id, payload.title || "");
    return { message: "تمت إضافة الإعلان.", id: data.id };
  }

  async function requireGiftCardWriteAccess() {
    const me = await currentAdminProfile();
    if (!["owner", "admin"].includes(me.role)) {
      throw new Error("لا تملك صلاحية تعديل Gift Cards.");
    }
    return me;
  }

  async function listGiftCards(adminMode) {
    const sb = supabaseClient();
    let cardsQuery = sb.from("gift_cards").select("*").eq("is_deleted", false).order("sort_order").order("name");
    if (!adminMode) cardsQuery = cardsQuery.neq("status", "HIDDEN");
    const [cardsResult, denominationsResult] = await Promise.all([
      cardsQuery,
      sb.from("gift_card_denominations").select("*").order("sort_order").order("face_value"),
    ]);
    throwIf(cardsResult.error, "تعذر تحميل Gift Cards.");
    throwIf(denominationsResult.error, "تعذر تحميل فئات Gift Cards.");

    const denominationsByCard = new Map();
    (denominationsResult.data || []).forEach((row) => {
      const list = denominationsByCard.get(row.gift_card_id) || [];
      list.push(row);
      denominationsByCard.set(row.gift_card_id, list);
    });

    return (cardsResult.data || []).map((row) => giftCardFromRow(row, denominationsByCard.get(row.id) || []));
  }

  async function saveGiftCard(payload, id) {
    await requireGiftCardWriteAccess();
    const sb = supabaseClient();
    const row = giftCardToRow(payload);
    let duplicateQuery = sb.from("gift_cards").select("id").eq("slug", row.slug).eq("is_deleted", false);
    if (id) duplicateQuery = duplicateQuery.neq("id", id);
    const duplicate = await duplicateQuery.maybeSingle();
    throwIf(duplicate.error, "تعذر التحقق من Slug.");
    if (duplicate.data) throw new Error("Slug مستخدم بالفعل. اختر Slug مختلفًا.");

    if (id) {
      const { error } = await sb.from("gift_cards").update(row).eq("id", id);
      throwIf(error, "تعذر تحديث Gift Card.");
      await logAction("تعديل Gift Card", "gift_card", id, row.name);
      return { message: "تم تحديث Gift Card.", id };
    }

    row.created_at = nowTs();
    row.is_deleted = false;
    const { data, error } = await sb.from("gift_cards").insert(row).select("id").single();
    throwIf(error, "تعذر إضافة Gift Card.");
    await logAction("إضافة Gift Card", "gift_card", data.id, row.name);
    return { message: "تمت إضافة Gift Card.", id: data.id };
  }

  async function softDeleteGiftCard(id) {
    await requireGiftCardWriteAccess();
    const { error } = await supabaseClient().from("gift_cards").update({
      status: "HIDDEN",
      is_deleted: true,
      updated_at: nowTs(),
    }).eq("id", id);
    throwIf(error, "تعذر حذف Gift Card.");
    await logAction("حذف Gift Card", "gift_card", id, "soft delete");
    return { message: "تم إخفاء وحذف Gift Card بشكل آمن." };
  }

  async function saveGiftCardDenomination(payload, giftCardId, id) {
    await requireGiftCardWriteAccess();
    const row = giftCardDenominationToRow(payload, giftCardId);
    if (!row.gift_card_id && !id) throw new Error("Gift Card غير محدد.");
    if (!Number.isFinite(row.face_value) || row.face_value <= 0) throw new Error("Face Value غير صالح.");
    if (!Number.isFinite(row.selling_price_lyd) || row.selling_price_lyd < 0) throw new Error("سعر البيع بالدينار غير صالح.");

    if (id) {
      delete row.gift_card_id;
      const { error } = await supabaseClient().from("gift_card_denominations").update(row).eq("id", id);
      throwIf(error, "تعذر تحديث الفئة.");
      await logAction("تعديل فئة Gift Card", "gift_card_denomination", id, String(row.face_value));
      return { message: "تم تحديث الفئة.", id };
    }

    row.created_at = nowTs();
    const { data, error } = await supabaseClient().from("gift_card_denominations").insert(row).select("id").single();
    throwIf(error, "تعذر إضافة الفئة.");
    await logAction("إضافة فئة Gift Card", "gift_card_denomination", data.id, String(row.face_value));
    return { message: "تمت إضافة الفئة.", id: data.id };
  }

  async function deleteGiftCardDenomination(id) {
    await requireGiftCardWriteAccess();
    const { error } = await supabaseClient().from("gift_card_denominations").delete().eq("id", id);
    throwIf(error, "تعذر حذف الفئة.");
    await logAction("حذف فئة Gift Card", "gift_card_denomination", id, "");
    return { message: "تم حذف الفئة." };
  }

  async function getSettings() {
    const { data, error } = await supabaseClient().from("store_settings").select("settings_json").eq("id", 1).maybeSingle();
    throwIf(error, "تعذر تحميل الإعدادات.");
    return asObject(data && data.settings_json);
  }

  async function saveSettings(payload) {
    const { error } = await supabaseClient().from("store_settings").upsert({
      id: 1,
      settings_json: payload || {},
      updated_at: nowTs(),
    });
    throwIf(error, "تعذر حفظ الإعدادات.");
    await logAction("تحديث الإعدادات", "settings", 1, "");
    return { message: "تم حفظ الإعدادات." };
  }

  async function uploadImage(formData) {
    const file = formData.get("file");
    if (!file) throw new Error("لم يتم اختيار صورة.");
    const ext = (file.name || "image").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `uploads/${new Date().toISOString().slice(0, 10)}/${id}.${ext}`;
    const { error } = await supabaseClient().storage.from(bucketName).upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    throwIf(error, "تعذر رفع الصورة.");
    const { data } = supabaseClient().storage.from(bucketName).getPublicUrl(path);
    await logAction("رفع صورة", "upload", path, bucketName);
    return { url: data.publicUrl, filename: path };
  }

  async function overview() {
    const [products, orders] = await Promise.all([listProducts(false), listOrders()]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayStart = Math.floor(today.getTime() / 1000);
    const monthStart = Math.floor(new Date(today.getFullYear(), today.getMonth(), 1).getTime() / 1000);
    const validOrders = orders.filter((order) => !["cancelled", "canceled"].includes(order.status));
    const sum = (rows) => rows.reduce((total, row) => total + Number(row.total || 0), 0);
    const trend = [];
    for (let offset = 6; offset >= 0; offset--) {
      const start = dayStart - offset * 86400;
      const end = start + 86400;
      const d = new Date(start * 1000);
      trend.push({
        label: d.toLocaleDateString("ar-LY", { day: "2-digit", month: "2-digit" }),
        value: sum(validOrders.filter((order) => order.createdAt >= start && order.createdAt < end)),
      });
    }
    const lowStock = products.filter((p) => p.trackStock && p.stockQty > 0 && p.stockQty <= p.lowStockThreshold);
    const outStock = products.filter((p) => p.trackStock && p.stockQty <= 0);
    const newOrders = orders.filter((order) => order.status === "new").length;
    const alerts = [
      ...lowStock.slice(0, 8).map((p) => ({ type: "stock", text: `${p.name} - المخزون ${p.stockQty}` })),
      ...(newOrders ? [{ type: "order", text: `لديك ${newOrders} طلب جديد` }] : []),
    ];
    return {
      totalSales: sum(validOrders),
      todaySales: sum(validOrders.filter((order) => order.createdAt >= dayStart)),
      monthSales: sum(validOrders.filter((order) => order.createdAt >= monthStart)),
      orders: orders.length,
      newOrders,
      completedOrders: orders.filter((order) => order.status === "completed").length,
      products: products.length,
      outOfStock: outStock.length,
      lowStock: lowStock.length,
      customers: buildCustomers(orders).length,
      alerts,
      salesTrend: trend,
      latestOrders: orders.slice(0, 6),
    };
  }

  async function listPublicProducts() {
    const { data, error } = await supabaseClient().from("products").select("*").eq("is_active", true).eq("is_deleted", false).eq("status", "published").order("sort_order").order("id", { ascending: false });
    throwIf(error, "تعذر تحميل المنتجات.");
    return (data || []).map(productFromRow);
  }

  async function loadPublicBootstrap() {
    const [products, homepageSections, heroSlides, ads, settings, giftCards] = await Promise.all([
      listPublicProducts(),
      listHomepage(false),
      listSlides(false),
      listAds(false),
      getSettings(),
      listGiftCards(false).catch(() => []),
    ]);
    return { products, homepageSections, heroSlides, ads, settings, giftCards };
  }

  async function placeOrder(payload) {
    const { data, error } = await supabaseClient().rpc("place_order", { payload });
    throwIf(error, "تعذر حفظ الطلب.");
    return data;
  }

  async function validateCoupon(code, orderTotal) {
    const { data, error } = await supabaseClient().rpc("validate_coupon", {
      coupon_code: code,
      order_total: Number(orderTotal || 0),
    });
    throwIf(error, "الكوبون غير صالح.");
    return data;
  }

  function subscribeToStoreChanges(callback) {
    if (!configured()) return null;
    const tables = ["products", "homepage_sections", "homepage_items", "hero_slides", "ads", "store_settings", "gift_cards", "gift_card_denominations"];
    let timer = null;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(callback, 250);
    };
    let channel = supabaseClient().channel("switches-store-public");
    tables.forEach((table) => {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    });
    channel.subscribe();
    return channel;
  }

  async function listUsers() {
    const { data, error } = await supabaseClient().from("admin_profiles").select("*").order("id");
    throwIf(error, "تعذر تحميل المستخدمين.");
    return (data || []).map(profileFromRow);
  }

  async function saveUser(payload, id) {
    if (id) {
      const row = {
        role: payload.role || "employee",
        is_active: payload.isActive !== false,
        updated_at: nowTs(),
      };
      const { error } = await supabaseClient().from("admin_profiles").update(row).eq("id", id);
      throwIf(error, "تعذر تحديث صلاحيات المستخدم.");
      await logAction("تعديل مستخدم", "user", id, row.role);
      return { message: "تم تحديث المستخدم.", id };
    }
    if (!payload.userId) throw new Error("أنشئ المستخدم في Supabase Auth أولاً ثم ضع User ID هنا.");
    const row = {
      user_id: payload.userId,
      email: payload.email || payload.username || "",
      display_name: payload.displayName || payload.email || payload.username || "",
      role: payload.role || "employee",
      is_active: payload.isActive !== false,
      created_at: nowTs(),
      updated_at: nowTs(),
    };
    const { data, error } = await supabaseClient().from("admin_profiles").insert(row).select("id").single();
    throwIf(error, "تعذر إضافة صلاحية الأدمن.");
    await logAction("إضافة مستخدم", "user", data.id, row.email);
    return { message: "تمت إضافة المستخدم.", id: data.id };
  }

  async function listActivity(limit) {
    const { data, error } = await supabaseClient().from("activity_logs").select("*").order("id", { ascending: false }).limit(limit || 100);
    throwIf(error, "تعذر تحميل سجل النشاط.");
    return data || [];
  }

  async function adminSearch(search) {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return { products: [], orders: [], customers: [] };
    const [products, orders] = await Promise.all([listProducts(false), listOrders()]);
    return {
      products: products.filter((p) => [p.name, p.sku, p.brand, p.category].join(" ").toLowerCase().includes(q)).slice(0, 8),
      orders: orders.filter((o) => [o.id, o.fullName, o.phone].join(" ").toLowerCase().includes(q)).slice(0, 8),
      customers: buildCustomers(orders).filter((c) => [c.name, c.phone].join(" ").toLowerCase().includes(q)).slice(0, 8),
    };
  }

  async function exportAll() {
    const tables = ["products", "orders", "categories", "brands", "coupons", "homepage_sections", "homepage_items", "hero_slides", "ads", "gift_cards", "gift_card_denominations", "admin_profiles", "store_settings", "activity_logs"];
    const result = {};
    for (const table of tables) {
      const { data, error } = await supabaseClient().from(table).select("*");
      throwIf(error, `تعذر تصدير ${table}.`);
      result[table] = data || [];
    }
    return result;
  }

  async function adminRequest(path, options) {
    const sb = supabaseClient();
    const url = new URL(path, window.location.origin);
    const route = url.pathname;
    const method = (options && options.method ? options.method : "GET").toUpperCase();
    const body = await parseJsonBody(options && options.body);

    if (route === "/api/admin/login" && method === "POST") {
      const { data, error } = await sb.auth.signInWithPassword({ email: body.username, password: body.password });
      throwIf(error, "بيانات الدخول غير صحيحة.");
      cachedProfile = null;
      const profile = await currentAdminProfile(true);
      return { token: data.session && data.session.access_token, username: profile.username, role: profile.role, expiresIn: data.session && data.session.expires_in };
    }
    if (route === "/api/admin/me" && method === "GET") return currentAdminProfile(true);
    await currentAdminProfile();

    if (route === "/api/admin/overview" && method === "GET") return overview();
    if (route === "/api/admin/search" && method === "GET") return adminSearch(url.searchParams.get("q"));
    if (route === "/api/admin/uploads" && method === "POST") return uploadImage(body);

    if (route === "/api/admin/products" && method === "GET") return listProducts(url.searchParams.get("includeDeleted") === "true");
    if (route === "/api/admin/products" && method === "POST") return saveProduct(body);
    let match = route.match(/^\/api\/admin\/products\/(\d+)\/duplicate$/);
    if (match && method === "POST") return duplicateProduct(Number(match[1]));
    match = route.match(/^\/api\/admin\/products\/(\d+)\/stock$/);
    if (match && method === "PATCH") return updateStock(Number(match[1]), Number(url.searchParams.get("quantity") || 0));
    match = route.match(/^\/api\/admin\/products\/(\d+)$/);
    if (match && method === "GET") return getProduct(Number(match[1]));
    if (match && method === "PUT") return saveProduct(body, Number(match[1]));
    if (match && method === "DELETE") return softDeleteProduct(Number(match[1]));

    for (const [entityRoute, table] of [["categories", "categories"], ["brands", "brands"]]) {
      if (route === `/api/admin/${entityRoute}` && method === "GET") return listEntities(table);
      if (route === `/api/admin/${entityRoute}` && method === "POST") return saveEntity(table, body);
      match = route.match(new RegExp(`^/api/admin/${entityRoute}/(\\d+)$`));
      if (match && method === "PUT") return saveEntity(table, body, Number(match[1]));
      if (match && method === "DELETE") return deleteEntity(table, Number(match[1]));
    }

    if (route === "/api/admin/coupons" && method === "GET") return listCoupons();
    if (route === "/api/admin/coupons" && method === "POST") return saveCoupon(body);
    match = route.match(/^\/api\/admin\/coupons\/(\d+)$/);
    if (match && method === "PUT") return saveCoupon(body, Number(match[1]));
    if (match && method === "DELETE") return deleteEntity("coupons", Number(match[1]));

    if (route === "/api/admin/orders" && method === "GET") return listOrders();
    match = route.match(/^\/api\/admin\/orders\/(\d+)$/);
    if (match && method === "GET") return getOrder(Number(match[1]));
    if (match && method === "PATCH") return updateOrder(Number(match[1]), body);
    if (match && method === "DELETE") return deleteOrder(Number(match[1]));

    if (route === "/api/admin/customers" && method === "GET") return buildCustomers(await listOrders());
    match = route.match(/^\/api\/admin\/customers\/(.+)$/);
    if (match && method === "GET") {
      const phone = decodeURIComponent(match[1]);
      const customer = buildCustomers(await listOrders()).find((item) => item.phone === phone);
      if (!customer) throw new Error("العميل غير موجود.");
      return customer;
    }

    if (route === "/api/admin/homepage" && method === "GET") return listHomepage(true);
    match = route.match(/^\/api\/admin\/homepage\/([^/]+)$/);
    if (match && method === "PUT") return updateHomepageSection(decodeURIComponent(match[1]), body);
    match = route.match(/^\/api\/admin\/homepage\/([^/]+)\/items$/);
    if (match && method === "PUT") return updateHomepageItems(decodeURIComponent(match[1]), body);

    if (route === "/api/admin/hero-slides" && method === "GET") return listSlides(true);
    if (route === "/api/admin/hero-slides" && method === "POST") return saveSlide(body);
    match = route.match(/^\/api\/admin\/hero-slides\/(\d+)$/);
    if (match && method === "PUT") return saveSlide(body, Number(match[1]));
    if (match && method === "DELETE") return deleteEntity("hero_slides", Number(match[1]));

    if (route === "/api/admin/ads" && method === "GET") return listAds(true);
    if (route === "/api/admin/ads" && method === "POST") return saveAd(body);
    match = route.match(/^\/api\/admin\/ads\/(\d+)$/);
    if (match && method === "PUT") return saveAd(body, Number(match[1]));
    if (match && method === "DELETE") return deleteEntity("ads", Number(match[1]));

    if (route === "/api/admin/gift-cards" && method === "GET") return listGiftCards(true);
    if (route === "/api/admin/gift-cards" && method === "POST") return saveGiftCard(body);
    match = route.match(/^\/api\/admin\/gift-cards\/(\d+)$/);
    if (match && method === "PUT") return saveGiftCard(body, Number(match[1]));
    if (match && method === "DELETE") return softDeleteGiftCard(Number(match[1]));
    match = route.match(/^\/api\/admin\/gift-cards\/(\d+)\/denominations$/);
    if (match && method === "POST") return saveGiftCardDenomination(body, Number(match[1]));
    match = route.match(/^\/api\/admin\/gift-card-denominations\/(\d+)$/);
    if (match && method === "PUT") return saveGiftCardDenomination(body, null, Number(match[1]));
    if (match && method === "DELETE") return deleteGiftCardDenomination(Number(match[1]));

    if (route === "/api/admin/users" && method === "GET") return listUsers();
    if (route === "/api/admin/users" && method === "POST") return saveUser(body);
    match = route.match(/^\/api\/admin\/users\/(\d+)$/);
    if (match && method === "PATCH") return saveUser(body, Number(match[1]));

    if (route === "/api/admin/settings" && method === "GET") return getSettings();
    if (route === "/api/admin/settings" && method === "PUT") return saveSettings(body);
    if (route === "/api/admin/activity" && method === "GET") return listActivity(Number(url.searchParams.get("limit") || 100));
    if (route === "/api/admin/export" && method === "GET") return exportAll();

    throw new Error(`مسار غير مدعوم في Supabase: ${method} ${route}`);
  }

  window.SwitchesSupabaseStore = {
    configured,
    client: supabaseClient,
    loadBootstrap: loadPublicBootstrap,
    loadGiftCards: () => listGiftCards(false),
    placeOrder,
    validateCoupon,
    subscribeToStoreChanges,
  };

  window.SwitchesSupabaseAdmin = {
    configured,
    client: supabaseClient,
    request: adminRequest,
    hasSession,
    signOut,
  };
})();
