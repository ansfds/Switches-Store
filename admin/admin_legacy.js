const state = {
  token: localStorage.getItem('switches_admin_token') || '',
  username: localStorage.getItem('switches_admin_user') || '',
  overview: null,
  products: [],
  services: [],
  slides: [],
  siteSettings: null,
  homeContent: null,
  orders: [],
  currentEditor: null,
};

const el = {
  authShell: document.getElementById('authShell'),
  appShell: document.getElementById('appShell'),
  loginForm: document.getElementById('loginForm'),
  logoutBtn: document.getElementById('logoutBtn'),
  refreshAllBtn: document.getElementById('refreshAllBtn'),
  exportBtn: document.getElementById('exportBtn'),
  overviewCards: document.getElementById('overviewCards'),
  recentProducts: document.getElementById('recentProducts'),
  recentOrders: document.getElementById('recentOrders'),
  productsTableBody: document.getElementById('productsTableBody'),
  servicesTableBody: document.getElementById('servicesTableBody'),
  slidesList: document.getElementById('slidesList'),
  ordersTableBody: document.getElementById('ordersTableBody'),
  siteSettingsForm: document.getElementById('siteSettingsForm'),
  homeContentForm: document.getElementById('homeContentForm'),
  editorModal: document.getElementById('editorModal'),
  editorForm: document.getElementById('editorForm'),
  editorTitle: document.getElementById('editorTitle'),
  sectionTitle: document.getElementById('sectionTitle'),
  productSearchInput: document.getElementById('productSearchInput'),
  loggedUserLabel: document.getElementById('loggedUserLabel'),
  toastRoot: document.getElementById('toastRoot'),
};

const sectionTitles = {
  dashboard: 'الرئيسية',
  products: 'المنتجات',
  services: 'الخدمات',
  slides: 'البانر',
  site: 'إعدادات الموقع',
  orders: 'الطلبات',
};

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  if (state.token) {
    bootApp();
  } else {
    showAuth();
  }
});

function bindEvents() {
  el.loginForm?.addEventListener('submit', handleLogin);
  el.logoutBtn?.addEventListener('click', logout);
  el.refreshAllBtn?.addEventListener('click', bootApp);
  el.exportBtn?.addEventListener('click', exportData);
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchSection(btn.dataset.section)));
  document.getElementById('addProductBtn')?.addEventListener('click', () => openProductEditor());
  document.getElementById('addServiceBtn')?.addEventListener('click', () => openServiceEditor());
  document.getElementById('addSlideBtn')?.addEventListener('click', () => openSlideEditor());
  el.productSearchInput?.addEventListener('input', renderProductsTable);
  el.siteSettingsForm?.addEventListener('submit', saveSiteSettings);
  el.homeContentForm?.addEventListener('submit', saveHomeContent);
  document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeEditor));
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  let payload = null;
  const text = await response.text();
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    if (response.status === 401) logout(false);
    throw new Error(payload?.detail || payload?.message || 'حدث خطأ غير متوقع.');
  }
  return payload;
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = {
    username: form.username.value.trim(),
    password: form.password.value,
  };
  try {
    const data = await api('/api/admin/login', { method: 'POST', body: JSON.stringify(body) });
    state.token = data.token;
    state.username = data.username;
    localStorage.setItem('switches_admin_token', state.token);
    localStorage.setItem('switches_admin_user', state.username);
    showToast('تم تسجيل الدخول بنجاح.');
    await bootApp();
  } catch (error) {
    showToast(error.message, true);
  }
}

function showAuth() {
  el.authShell.classList.remove('hidden');
  el.appShell.classList.add('hidden');
}

function showApp() {
  el.authShell.classList.add('hidden');
  el.appShell.classList.remove('hidden');
  el.loggedUserLabel.textContent = state.username || 'admin';
}

async function bootApp() {
  try {
    await api('/api/admin/me');
    showApp();
    await Promise.all([
      loadOverview(),
      loadProducts(),
      loadServices(),
      loadSlides(),
      loadSiteSettings(),
      loadHomeContent(),
      loadOrders(),
    ]);
    renderAll();
  } catch (error) {
    showToast(error.message, true);
  }
}

function logout(showMessage = true) {
  state.token = '';
  state.username = '';
  localStorage.removeItem('switches_admin_token');
  localStorage.removeItem('switches_admin_user');
  showAuth();
  if (showMessage) showToast('تم تسجيل الخروج.');
}

function switchSection(section) {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.section === section));
  document.querySelectorAll('.section-panel').forEach(panel => panel.classList.toggle('active', panel.id === `section-${section}`));
  el.sectionTitle.textContent = sectionTitles[section] || 'لوحة التحكم';
}

async function loadOverview() { state.overview = await api('/api/admin/overview'); }
async function loadProducts() { state.products = await api('/api/admin/products'); }
async function loadServices() { state.services = await api('/api/admin/services'); }
async function loadSlides() { state.slides = await api('/api/admin/hero-slides'); }
async function loadSiteSettings() { state.siteSettings = await api('/api/admin/site-settings'); }
async function loadHomeContent() { state.homeContent = await api('/api/admin/home-content'); }
async function loadOrders() { state.orders = await api('/api/admin/orders'); }

function renderAll() {
  renderOverview();
  renderProductsTable();
  renderServicesTable();
  renderSlides();
  renderSiteSettingsForm();
  renderHomeContentForm();
  renderOrdersTable();
  switchSection(document.querySelector('.nav-btn.active')?.dataset.section || 'dashboard');
}

function renderOverview() {
  const overview = state.overview || {};
  const cards = [
    ['كل المنتجات', overview.products || 0],
    ['المتوفر الآن', overview.availableProducts || 0],
    ['الخدمات', overview.services || 0],
    ['الشرائح', overview.heroSlides || 0],
    ['الطلبات', overview.orders || 0],
    ['طلبات جديدة', overview.newOrders || 0],
  ];
  el.overviewCards.innerHTML = cards.map(([label, value]) => `
    <article class="metric-card">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(String(value))}</strong>
    </article>
  `).join('');

  const latestProducts = [...state.products].slice(0, 5);
  el.recentProducts.innerHTML = latestProducts.length ? `<div class="quick-list">${latestProducts.map(item => `
    <div class="quick-item">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(item.brand)} · ${escapeHtml(item.category)}</small>
      </div>
      <span class="badge ${item.availability}">${availabilityLabel(item.availability)}</span>
    </div>
  `).join('')}</div>` : `<div class="empty-box">لا توجد منتجات.</div>`;

  const latestOrders = [...state.orders].slice(0, 5);
  el.recentOrders.innerHTML = latestOrders.length ? `<div class="quick-list">${latestOrders.map(item => `
    <div class="quick-item">
      <div>
        <strong>${escapeHtml(item.fullName)}</strong>
        <small>${escapeHtml(item.phone)}</small>
      </div>
      <span class="badge active">${escapeHtml(orderStatusLabel(item.status))}</span>
    </div>
  `).join('')}</div>` : `<div class="empty-box">لا توجد طلبات حتى الآن.</div>`;
}

function renderProductsTable() {
  const q = (el.productSearchInput?.value || '').trim().toLowerCase();
  const items = state.products.filter(item => !q || [item.name, item.brand, item.category].join(' ').toLowerCase().includes(q));
  el.productsTableBody.innerHTML = items.map(item => `
    <tr>
      <td>${item.id}</td>
      <td>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="muted-mini">${escapeHtml(item.brand)}</div>
      </td>
      <td>${escapeHtml(item.category)}</td>
      <td>${formatPrice(item.price)}</td>
      <td>${escapeHtml(item.condition)}</td>
      <td><span class="badge ${item.availability}">${availabilityLabel(item.availability)}</span></td>
      <td><span class="badge ${item.isActive ? 'active' : 'inactive'}">${item.isActive ? 'نعم' : 'لا'}</span></td>
      <td>
        <div class="row-actions">
          <button class="action-btn" onclick="window.__adminEditProduct(${item.id})">تعديل</button>
          <button class="action-btn delete" onclick="window.__adminDeleteProduct(${item.id})">حذف</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderServicesTable() {
  el.servicesTableBody.innerHTML = state.services.map(item => `
    <tr>
      <td>${item.id}</td>
      <td><code>${escapeHtml(item.key)}</code></td>
      <td>
        <strong>${escapeHtml(item.title)}</strong>
        <div class="muted-mini">${escapeHtml(item.shortTitle || '')}</div>
      </td>
      <td>${escapeHtml(item.range || '-')}</td>
      <td><span class="badge ${item.isActive ? 'active' : 'inactive'}">${item.isActive ? 'نعم' : 'لا'}</span></td>
      <td>
        <div class="row-actions">
          <button class="action-btn" onclick="window.__adminEditService(${item.id})">تعديل</button>
          <button class="action-btn delete" onclick="window.__adminDeleteService(${item.id})">حذف</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderSlides() {
  el.slidesList.innerHTML = state.slides.length ? state.slides.map(item => `
    <article class="slide-card">
      <img src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(item.imageAlt || item.title)}">
      <div class="slide-copy">
        <span class="badge ${item.isActive ? 'active' : 'inactive'}">${item.isActive ? 'مفعل' : 'مخفي'}</span>
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.description || '')}</p>
      </div>
      <div class="slide-side">
        <button class="action-btn" onclick="window.__adminEditSlide(${item.id})">تعديل</button>
        <button class="action-btn delete" onclick="window.__adminDeleteSlide(${item.id})">حذف</button>
      </div>
    </article>
  `).join('') : `<div class="empty-box">لا توجد شرائح حتى الآن.</div>`;
}

function renderSiteSettingsForm() {
  if (!state.siteSettings) return;
  const form = el.siteSettingsForm;
  form.name.value = state.siteSettings.name || '';
  form.subtitle.value = state.siteSettings.subtitle || '';
  form.logo.value = state.siteSettings.logo || '';
  form.successThumb.value = state.siteSettings.successThumb || '';
}

function renderHomeContentForm() {
  if (!state.homeContent) return;
  const form = el.homeContentForm;
  form.words.value = (state.homeContent.words || []).join('\n');
  form.bottomStripLabel.value = state.homeContent.bottomStripLabel || '';
  form.bottomStripTitle.value = state.homeContent.bottomStripTitle || '';
}

function renderOrdersTable() {
  el.ordersTableBody.innerHTML = state.orders.length ? state.orders.map(item => `
    <tr>
      <td>${item.id}</td>
      <td>
        <strong>${escapeHtml(item.fullName)}</strong>
        <div class="muted-mini">${escapeHtml(item.address)}</div>
      </td>
      <td>${escapeHtml(item.phone)}</td>
      <td>${formatPrice(item.total)}</td>
      <td>
        <select onchange="window.__adminUpdateOrderStatus(${item.id}, this.value)">
          ${['new', 'in_progress', 'completed', 'cancelled'].map(status => `<option value="${status}" ${item.status === status ? 'selected' : ''}>${orderStatusLabel(status)}</option>`).join('')}
        </select>
      </td>
      <td>${formatDate(item.createdAt)}</td>
    </tr>
  `).join('') : `<tr><td colspan="6"><div class="empty-box">لا توجد طلبات.</div></td></tr>`;
}

async function saveSiteSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    name: form.name.value.trim(),
    subtitle: form.subtitle.value.trim(),
    logo: form.logo.value.trim(),
    successThumb: form.successThumb.value.trim(),
  };
  try {
    await api('/api/admin/site-settings', { method: 'PUT', body: JSON.stringify(payload) });
    state.siteSettings = payload;
    showToast('تم حفظ إعدادات الموقع.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function saveHomeContent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    words: linesToArray(form.words.value),
    bottomStripLabel: form.bottomStripLabel.value.trim(),
    bottomStripTitle: form.bottomStripTitle.value.trim(),
  };
  try {
    await api('/api/admin/home-content', { method: 'PUT', body: JSON.stringify(payload) });
    state.homeContent = payload;
    showToast('تم حفظ محتوى الصفحة الرئيسية.');
  } catch (error) {
    showToast(error.message, true);
  }
}

function openEditor(title, html, onSubmit) {
  el.editorTitle.textContent = title;
  el.editorForm.innerHTML = html;
  el.editorForm.onsubmit = onSubmit;
  el.editorModal.classList.remove('hidden');
}

function closeEditor() {
  el.editorModal.classList.add('hidden');
  el.editorForm.innerHTML = '';
  el.editorForm.onsubmit = null;
}

function openProductEditor(item = null) {
  const product = item || {
    name: '', category: 'قطع التجميعة', brand: '', price: 0, oldPrice: '', condition: 'جديد',
    images: [], description: '', specs: {}, tags: [], availability: 'available', isActive: true, sortOrder: nextSortOrder(state.products),
  };
  const html = `
    <div class="form-grid two">
      <label><span>اسم المنتج</span><input name="name" value="${escapeAttr(product.name)}" required></label>
      <label><span>الماركة</span><input name="brand" value="${escapeAttr(product.brand)}" required></label>
      <label><span>الفئة</span>
        <select name="category">
          ${['قطع التجميعة','شاشات','إكسسوارات','بلايستيشن'].map(v => `<option value="${v}" ${product.category === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <label><span>الحالة</span>
        <select name="condition">
          ${['جديد','مستعمل','علبة مفتوحة'].map(v => `<option value="${v}" ${product.condition === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <label><span>السعر الحالي</span><input name="price" type="number" step="0.01" value="${escapeAttr(product.price)}" required></label>
      <label><span>السعر القديم</span><input name="oldPrice" type="number" step="0.01" value="${escapeAttr(product.oldPrice ?? '')}"></label>
      <label><span>التوفر</span>
        <select name="availability">
          ${['available','comingSoon','unavailable'].map(v => `<option value="${v}" ${product.availability === v ? 'selected' : ''}>${availabilityLabel(v)}</option>`).join('')}
        </select>
      </label>
      <label><span>الترتيب</span><input name="sortOrder" type="number" value="${escapeAttr(product.sortOrder ?? 0)}"></label>
      <label class="full"><span>الوصف</span><textarea name="description" rows="4">${escapeHtml(product.description || '')}</textarea></label>
      <label class="full"><span>روابط الصور (كل سطر رابط)</span><textarea name="images" rows="5">${escapeHtml((product.images || []).join('\n'))}</textarea></label>
      <label class="full"><span>المواصفات (كل سطر بالشكل: الاسم: القيمة)</span><textarea name="specs" rows="6">${escapeHtml(objectToLines(product.specs || {}))}</textarea></label>
      <label class="full"><span>الوسوم (مفصولة بفاصلة)</span><input name="tags" value="${escapeAttr((product.tags || []).join(', '))}"></label>
      <label class="full checkbox-row"><input name="isActive" type="checkbox" ${product.isActive ? 'checked' : ''}><span>المنتج مفعل ويظهر في الواجهة</span></label>
      <div class="full"><button class="btn primary" type="submit">${item ? 'حفظ التعديلات' : 'إضافة المنتج'}</button></div>
    </div>
  `;
  openEditor(item ? 'تعديل المنتج' : 'إضافة منتج جديد', html, async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      name: form.name.value.trim(),
      category: form.category.value,
      brand: form.brand.value.trim(),
      price: Number(form.price.value || 0),
      oldPrice: form.oldPrice.value ? Number(form.oldPrice.value) : null,
      condition: form.condition.value,
      images: linesToArray(form.images.value),
      description: form.description.value.trim(),
      specs: linesToObject(form.specs.value),
      tags: commaToArray(form.tags.value),
      availability: form.availability.value,
      isActive: form.isActive.checked,
      sortOrder: Number(form.sortOrder.value || 0),
    };
    try {
      if (item) {
        await api(`/api/admin/products/${item.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
      }
      await loadProducts();
      await loadOverview();
      renderOverview();
      renderProductsTable();
      closeEditor();
      showToast(item ? 'تم تحديث المنتج.' : 'تمت إضافة المنتج.');
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function openServiceEditor(item = null) {
  const service = item || {
    key: '', title: '', shortTitle: '', icon: 'fa-globe', coverImage: '', range: '', duration: '', support: '', summary: '', bullets: [], projects: [], packages: [], isActive: true, sortOrder: nextSortOrder(state.services),
  };
  const html = `
    <div class="form-grid two">
      <label><span>مفتاح الخدمة</span><input name="key" value="${escapeAttr(service.key)}" required></label>
      <label><span>الأيقونة Font Awesome</span><input name="icon" value="${escapeAttr(service.icon || '')}"></label>
      <label><span>العنوان</span><input name="title" value="${escapeAttr(service.title)}" required></label>
      <label><span>العنوان المختصر</span><input name="shortTitle" value="${escapeAttr(service.shortTitle || '')}"></label>
      <label><span>المدى السعري</span><input name="range" value="${escapeAttr(service.range || '')}"></label>
      <label><span>المدة</span><input name="duration" value="${escapeAttr(service.duration || '')}"></label>
      <label><span>الدعم</span><input name="support" value="${escapeAttr(service.support || '')}"></label>
      <label><span>الترتيب</span><input name="sortOrder" type="number" value="${escapeAttr(service.sortOrder ?? 0)}"></label>
      <label class="full"><span>صورة الغلاف</span><input name="coverImage" value="${escapeAttr(service.coverImage || '')}"></label>
      <label class="full"><span>الملخص</span><textarea name="summary" rows="4">${escapeHtml(service.summary || '')}</textarea></label>
      <label class="full"><span>النقاط المختصرة (كل سطر نقطة)</span><textarea name="bullets" rows="5">${escapeHtml((service.bullets || []).join('\n'))}</textarea></label>
      <label class="full"><span>المشاريع بصيغة JSON</span><textarea name="projects" rows="8">${escapeHtml(prettyJson(service.projects || []))}</textarea></label>
      <label class="full"><span>الباقات بصيغة JSON</span><textarea name="packages" rows="8">${escapeHtml(prettyJson(service.packages || []))}</textarea></label>
      <label class="full checkbox-row"><input name="isActive" type="checkbox" ${service.isActive ? 'checked' : ''}><span>الخدمة مفعلة وتظهر في الواجهة</span></label>
      <div class="full"><button class="btn primary" type="submit">${item ? 'حفظ التعديلات' : 'إضافة الخدمة'}</button></div>
    </div>
  `;
  openEditor(item ? 'تعديل الخدمة' : 'إضافة خدمة جديدة', html, async event => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const payload = {
        key: form.key.value.trim(),
        title: form.title.value.trim(),
        shortTitle: form.shortTitle.value.trim(),
        icon: form.icon.value.trim(),
        coverImage: form.coverImage.value.trim(),
        range: form.range.value.trim(),
        duration: form.duration.value.trim(),
        support: form.support.value.trim(),
        summary: form.summary.value.trim(),
        bullets: linesToArray(form.bullets.value),
        projects: parseJsonField(form.projects.value, 'المشاريع'),
        packages: parseJsonField(form.packages.value, 'الباقات'),
        isActive: form.isActive.checked,
        sortOrder: Number(form.sortOrder.value || 0),
      };
      if (item) {
        await api(`/api/admin/services/${item.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/api/admin/services', { method: 'POST', body: JSON.stringify(payload) });
      }
      await loadServices();
      await loadOverview();
      renderOverview();
      renderServicesTable();
      closeEditor();
      showToast(item ? 'تم تحديث الخدمة.' : 'تمت إضافة الخدمة.');
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function openSlideEditor(item = null) {
  const slide = item || {
    badge: '', title: '', description: '', imageUrl: '', imageAlt: '', primaryButtonText: '', primaryButtonLink: '', secondaryButtonText: '', secondaryButtonLink: '', sortOrder: nextSortOrder(state.slides), isActive: true,
  };
  const html = `
    <div class="form-grid two">
      <label><span>الشارة الصغيرة</span><input name="badge" value="${escapeAttr(slide.badge || '')}"></label>
      <label><span>الترتيب</span><input name="sortOrder" type="number" value="${escapeAttr(slide.sortOrder ?? 0)}"></label>
      <label class="full"><span>العنوان</span><input name="title" value="${escapeAttr(slide.title || '')}" required></label>
      <label class="full"><span>الوصف</span><textarea name="description" rows="4">${escapeHtml(slide.description || '')}</textarea></label>
      <label class="full"><span>رابط الصورة</span><input name="imageUrl" value="${escapeAttr(slide.imageUrl || '')}" required></label>
      <label class="full"><span>النص البديل للصورة</span><input name="imageAlt" value="${escapeAttr(slide.imageAlt || '')}"></label>
      <label><span>نص الزر الأول</span><input name="primaryButtonText" value="${escapeAttr(slide.primaryButtonText || '')}"></label>
      <label><span>رابط الزر الأول</span><input name="primaryButtonLink" value="${escapeAttr(slide.primaryButtonLink || '')}"></label>
      <label><span>نص الزر الثاني</span><input name="secondaryButtonText" value="${escapeAttr(slide.secondaryButtonText || '')}"></label>
      <label><span>رابط الزر الثاني</span><input name="secondaryButtonLink" value="${escapeAttr(slide.secondaryButtonLink || '')}"></label>
      <label class="full checkbox-row"><input name="isActive" type="checkbox" ${slide.isActive ? 'checked' : ''}><span>الشريحة مفعلة وتظهر في الواجهة</span></label>
      <div class="full"><button class="btn primary" type="submit">${item ? 'حفظ التعديلات' : 'إضافة الشريحة'}</button></div>
    </div>
  `;
  openEditor(item ? 'تعديل الشريحة' : 'إضافة شريحة جديدة', html, async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      badge: form.badge.value.trim(),
      title: form.title.value.trim(),
      description: form.description.value.trim(),
      imageUrl: form.imageUrl.value.trim(),
      imageAlt: form.imageAlt.value.trim(),
      primaryButtonText: form.primaryButtonText.value.trim(),
      primaryButtonLink: form.primaryButtonLink.value.trim(),
      secondaryButtonText: form.secondaryButtonText.value.trim(),
      secondaryButtonLink: form.secondaryButtonLink.value.trim(),
      sortOrder: Number(form.sortOrder.value || 0),
      isActive: form.isActive.checked,
    };
    try {
      if (item) {
        await api(`/api/admin/hero-slides/${item.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/api/admin/hero-slides', { method: 'POST', body: JSON.stringify(payload) });
      }
      await loadSlides();
      await loadOverview();
      renderOverview();
      renderSlides();
      closeEditor();
      showToast(item ? 'تم تحديث الشريحة.' : 'تمت إضافة الشريحة.');
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function deleteProduct(id) {
  if (!confirm('هل تريد حذف هذا المنتج؟')) return;
  try {
    await api(`/api/admin/products/${id}`, { method: 'DELETE' });
    await loadProducts();
    await loadOverview();
    renderOverview();
    renderProductsTable();
    showToast('تم حذف المنتج.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteService(id) {
  if (!confirm('هل تريد حذف هذه الخدمة؟')) return;
  try {
    await api(`/api/admin/services/${id}`, { method: 'DELETE' });
    await loadServices();
    await loadOverview();
    renderOverview();
    renderServicesTable();
    showToast('تم حذف الخدمة.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteSlide(id) {
  if (!confirm('هل تريد حذف هذه الشريحة؟')) return;
  try {
    await api(`/api/admin/hero-slides/${id}`, { method: 'DELETE' });
    await loadSlides();
    await loadOverview();
    renderOverview();
    renderSlides();
    showToast('تم حذف الشريحة.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function updateOrderStatus(id, status) {
  try {
    await api(`/api/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await loadOrders();
    await loadOverview();
    renderOverview();
    renderOrdersTable();
    showToast('تم تحديث حالة الطلب.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function exportData() {
  try {
    const data = await api('/api/admin/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `switches-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تصدير البيانات.');
  } catch (error) {
    showToast(error.message, true);
  }
}

function linesToArray(value) {
  return value.split('\n').map(item => item.trim()).filter(Boolean);
}

function commaToArray(value) {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function linesToObject(value) {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .reduce((acc, line) => {
      const index = line.indexOf(':');
      if (index === -1) return acc;
      const key = line.slice(0, index).trim();
      const val = line.slice(index + 1).trim();
      if (key) acc[key] = val;
      return acc;
    }, {});
}

function objectToLines(obj) {
  return Object.entries(obj).map(([key, value]) => `${key}: ${value}`).join('\n');
}

function parseJsonField(value, label) {
  const text = value.trim();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`صيغة JSON غير صحيحة في حقل ${label}.`);
  }
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function nextSortOrder(items) {
  return (Math.max(0, ...items.map(item => Number(item.sortOrder || 0))) + 1);
}

function availabilityLabel(value) {
  return ({ available: 'متوفر', comingSoon: 'قريبًا', unavailable: 'غير متوفر' })[value] || value;
}

function orderStatusLabel(value) {
  return ({ new: 'جديد', in_progress: 'قيد المعالجة', completed: 'مكتمل', cancelled: 'ملغي' })[value] || value;
}

function formatPrice(value) {
  return `${Number(value || 0).toLocaleString('en-US')} $`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(Number(value) * 1000).toLocaleString('ar-LY');
}

function showToast(message, isError = false) {
  const note = document.createElement('div');
  note.className = 'toast';
  note.style.borderColor = isError ? 'rgba(239, 68, 68, 0.35)' : 'rgba(47, 107, 255, 0.24)';
  note.textContent = message;
  el.toastRoot.appendChild(note);
  setTimeout(() => note.remove(), 2600);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

window.__adminEditProduct = id => openProductEditor(state.products.find(item => item.id === id));
window.__adminDeleteProduct = deleteProduct;
window.__adminEditService = id => openServiceEditor(state.services.find(item => item.id === id));
window.__adminDeleteService = deleteService;
window.__adminEditSlide = id => openSlideEditor(state.slides.find(item => item.id === id));
window.__adminDeleteSlide = deleteSlide;
window.__adminUpdateOrderStatus = updateOrderStatus;
