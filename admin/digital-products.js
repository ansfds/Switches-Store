(function () {
  'use strict';
  const model = window.SwitchesProductSections;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const option = (value, label, current) => `<option value="${esc(value)}" ${current === value ? 'selected' : ''}>${esc(label)}</option>`;

  function fields(product) {
    const data = model.metadata(product);
    const input = (name, label, value, extra = '') => `<label ${extra}><span>${label}</span><input name="${name}" value="${esc(value)}"></label>`;
    return `<label class="full digital-section-select"><span>قسم المتجر</span><select name="categoryType">${Object.entries(model.SECTIONS).map(([value, label]) => option(value, label, data.categoryType)).join('')}</select></label>
      <fieldset class="full digital-editor-fields" data-digital-fields>
        <legend>معلومات المنتج الرقمي</legend><div class="form-grid three">
          ${input('digitalPlatform', 'المنصة', data.platform)}
          <label><span>نوع المنتج</span><select name="digitalType"><option value="">غير محدد</option>${Object.entries(model.TYPES).map(([value, label]) => option(value, `${label} · ${value}`, data.productType)).join('')}</select></label>
          ${input('digitalRegion', 'الريجن (كما هو، دون قيمة افتراضية)', data.region)}
          ${input('digitalActivationCountry', 'بلد / منطقة التفعيل', data.activationCountry)}
          ${input('digitalDuration', 'مدة الاشتراك', data.duration, 'data-subscription-duration')}
          ${input('digitalDeliveryMethod', 'طريقة التسليم', data.deliveryMethod)}
          ${input('digitalEdition', 'النسخة (اختياري)', data.edition)}
          <label><span>الخصم (يُحسب من السعرين)</span><output data-digital-discount></output></label>
          <label class="digital-featured-input"><span>Featured · منتج مميز</span><input type="checkbox" name="digitalFeatured" ${data.featured ? 'checked' : ''}></label>
          <label class="full"><span>خصائص مختصرة (كل سطر خاصية، اختياري)</span><textarea name="digitalFeatures" rows="3">${esc(data.features.join('\n'))}</textarea></label>
          <p class="full hint">العملة هي عملة أسعار المتجر الحالية. يُحسب الخصم تلقائيًا عندما يكون السعر القديم أكبر من الحالي. لا تُعرض معلومات فارغة.</p>
        </div>
      </fieldset>`;
  }

  function mount(form) {
    const section = form.elements.categoryType;
    const type = form.elements.digitalType;
    const updateDiscount = () => {
      form.querySelector('[data-digital-discount]').textContent = `${model.discount({ price: form.elements.price.value, oldPrice: form.elements.oldPrice.value })}%`;
    };
    form.elements.price.addEventListener('input', updateDiscount);
    form.elements.oldPrice.addEventListener('input', updateDiscount);
    updateDiscount();
    const sync = () => {
      const digital = section.value !== 'PC_PART';
      const fieldset = form.querySelector('[data-digital-fields]');
      fieldset.hidden = !digital;
      fieldset.disabled = !digital;
      const duration = form.querySelector('[data-subscription-duration]');
      duration.hidden = !digital || type.value !== 'SUBSCRIPTION';
      form.elements.digitalDuration.disabled = duration.hidden;
      for (const name of ['condition', 'freeShipping', 'category', 'brand']) {
        const label = form.elements[name]?.closest('label');
        if (label) label.hidden = digital;
      }
      // The product table is shared; section membership lives in specs_json.
      form.querySelector('[name="specs"]').closest('label').querySelector('span').textContent = digital ? 'معلومات إضافية (كل سطر: المفتاح = القيمة)' : 'المواصفات (كل سطر: المفتاح = القيمة)';
      for (const option of type.options) option.disabled = section.value === 'MINECRAFT' && option.value === 'SERVICE';
      if (type.selectedOptions[0]?.disabled) type.value = '';
    };
    section.addEventListener('change', () => {
      if (section.value !== 'PC_PART' && !form.elements.trackStock.dataset.edited) form.elements.trackStock.value = '0';
      sync();
    });
    form.elements.trackStock.addEventListener('change', () => { form.elements.trackStock.dataset.edited = '1'; });
    type.addEventListener('change', sync);
    sync();
  }

  function apply(form, payload) {
    const value = name => form.elements[name].value.trim();
    const categoryType = value('categoryType');
    const data = {
      categoryType, productType: value('digitalType'), platform: value('digitalPlatform'),
      region: value('digitalRegion'), activationCountry: value('digitalActivationCountry'),
      duration: value('digitalDuration'), deliveryMethod: value('digitalDeliveryMethod'), edition: value('digitalEdition'),
      featured: form.elements.digitalFeatured.checked,
      features: value('digitalFeatures').split('\n').map(line => line.trim()).filter(Boolean),
    };
    if (categoryType !== 'PC_PART') {
      if (!payload.name || !payload.images.length) throw new Error('أدخل اسم المنتج ورابط صورة واحدة على الأقل.');
      for (const url of payload.images) {
        const parsed = new URL(url, location.origin);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('استخدم رابط صورة http أو https أو مسارًا محليًا.');
      }
      if (payload.price < 0 || !Number.isFinite(payload.price)) throw new Error('السعر يجب أن يكون صفرًا أو أكبر.');
      payload.category = categoryType === 'MINECRAFT' ? 'Minecraft' : 'الاشتراكات';
    }
    payload.specs = model.storeMetadata(payload.specs, data);
    return payload;
  }
  window.SwitchesDigitalAdmin = Object.freeze({ fields, mount, apply });
})();
