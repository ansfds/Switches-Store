(function () {
  const config = window.SWITCHES_SUPABASE_CONFIG || {};
  const bucketName = config.storageBucket || "store-media";
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

  async function listHomepage(adminMode) {
    const sb = supabaseClient();
    let sectionsQuery = sb.from("homepage_sections").select("*").order("sort_order").order("section_key");
    if (!adminMode) sectionsQuery = sectionsQuery.eq("is_visible", true);
    const [sectionsResult, itemsResult, products] = await Promise.all([
      sectionsQuery,
      sb.from("homepage_items").select("*").order("slot_index"),
      adminMode ? listProducts(true) : listPublicProducts(),
    ]);
    throwIf(sectionsResult.error, "تعذر تحميل أقسام الرئيسية.");
    throwIf(itemsResult.error, "تعذر تحميل منتجات الرئيسية.");
    const productById = new Map(products.map((product) => [Number(product.id), product]));
    return (sectionsResult.data || []).map((section) => ({
      key: section.section_key,
      title: section.title,
      isVisible: bool(section.is_visible),
      sortOrder: Number(section.sort_order || 0),
      maxItems: Number(section.max_items || 4),
      items: (itemsResult.data || [])
        .filter((item) => item.section_key === section.section_key)
        .map((item) => ({
          slot: Number(item.slot_index || 0),
          product: productById.get(Number(item.product_id)),
          customPrice: item.custom_price == null ? null : Number(item.custom_price),
          startsAt: item.starts_at,
          endsAt: item.ends_at,
        }))
        .filter((item) => item.product),
    }));
  }

  async function updateHomepageSection(key, payload) {
    const { error } = await supabaseClient().from("homepage_sections").update({
      title: payload.title || "",
      is_visible: payload.isVisible !== false,
      sort_order: Number(payload.sortOrder || 0),
      updated_at: nowTs(),
    }).eq("section_key", key);
    throwIf(error, "تعذر تحديث القسم.");
    await logAction("تعديل قسم الرئيسية", "homepage", key, payload.title || "");
    return { message: "تم تحديث القسم." };
  }

  async function updateHomepageItems(key, payload) {
    const sb = supabaseClient();
    const { error: deleteError } = await sb.from("homepage_items").delete().eq("section_key", key);
    throwIf(deleteError, "تعذر تحديث منتجات القسم.");
    const rows = (payload.items || []).map((item, index) => ({
      section_key: key,
      slot_index: index + 1,
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
    const { data, error } = await supabaseClient().from("products").select("*").order("sort_order").order("id", { ascending: false });
    throwIf(error, "تعذر تحميل المنتجات.");
    return (data || []).map(productFromRow);
  }

  async function loadPublicBootstrap() {
    const [products, homepageSections, heroSlides, ads, settings] = await Promise.all([
      listPublicProducts(),
      listHomepage(false),
      listSlides(false),
      listAds(false),
      getSettings(),
    ]);
    return { products, homepageSections, heroSlides, ads, settings };
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
    const tables = ["products", "homepage_sections", "homepage_items", "hero_slides", "ads", "store_settings"];
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
    const tables = ["products", "orders", "categories", "brands", "coupons", "homepage_sections", "homepage_items", "hero_slides", "ads", "admin_profiles", "store_settings", "activity_logs"];
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
