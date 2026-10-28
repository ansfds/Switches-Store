(function () {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  // The default text is loaded from catalog_settings through the public API.
  function notice() { return String(window.SwitchesStoreSettings?.dynamic_price_notice || ''); }
  function html(extraClass = '') { return `<p class="dynamic-price-notice ${extraClass}"><i class="fas fa-circle-info" aria-hidden="true"></i><span>${escape(notice())}</span></p>`; }
  function sync() { document.querySelectorAll('.dynamic-price-notice>span').forEach(element => { element.textContent = notice(); }); }
  function isQuote(product) { return window.SwitchesProductSections.metadata(product).categoryType === 'SUBSCRIPTION'; }
  function message(product) {
    const data = window.SwitchesProductSections.metadata(product);
    return ['🛒 *طلب اشتراك جديد من Switches Store*', '', `📦 *المنتج:* ${product.name}`,
      data.duration && `⏳ *المدة:* ${data.duration}`, data.region && `🌍 *المنطقة:* ${data.region}`,
      data.activationMethod && `🔑 *طريقة التفعيل:* ${data.activationMethod}`,
      `🔢 *الكمية:* ${Math.max(1,Math.floor(Number(product.quantity) || 1))}`,
      ...Object.entries(product.selectedOptions || {}).map(([key,value]) => `${window.SwitchesProductOptions?.labels[key] || key}: ${value}`),
      '', '✅ نبي نعرف السعر الحالي ونكمل الطلب.'].filter(line => line !== false && line !== undefined).join('\n');
  }
  function whatsappUrl(product) {
    const settings = window.SwitchesStoreSettings || {};
    const phone = String(settings.whatsapp || settings.gift_cards_whatsapp_purchase_number || '218931853169').replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(message(product))}`;
  }
  function order(product) {
    if (window.SwitchesProductCardData.availabilityValue(product.availability) !== 'available' || (window.SwitchesProductOptions && !SwitchesProductOptions.live(product))) return false;
    if (window.SwitchesProductOptions?.variants(product).length && !product.selectedVariantId) {
      window.SwitchesDigitalStore?.navigate(SwitchesProductSections.route(product));
      return false;
    }
    window.open(whatsappUrl(product), '_blank', 'noopener');
    return true;
  }
  window.addEventListener('switches:settings-changed', sync);
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-subscription-order]');
    if (!button || button.disabled || button.closest('#digitalStorePage')) return;
    const product = allProducts.find(item => String(item.id) === button.dataset.subscriptionOrder);
    if (product) order(product);
  });
  window.SwitchesDynamicPricing = Object.freeze({ notice, html, isQuote, message, whatsappUrl, order });
})();
