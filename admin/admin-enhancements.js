(function () {
  const categoryOptions = [
    "كروت الشاشة",
    "معالجات",
    "لوحات أم",
    "رامات",
    "التخزين",
    "التبريد",
    "مزودات الطاقة",
    "الكيسات",
    "الإكسسوارات",
    "الشاشات",
    "الكومبوهات",
    "الكروت الإلكترونية",
  ];

  const tagControls = [
    { tag: "featured", label: "Featured" },
    { tag: "bestSelling", label: "Best Seller" },
    { tag: "newArrival", label: "New Arrival" },
    { tag: "combo", label: "Offer / Combo" },
    { tag: "digitalCard", label: "Digital Card" },
  ];

  function parseTags(value) {
    return String(value || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function uniqueTags(tags) {
    return [...new Set(tags.filter(Boolean))];
  }

  function addCategoryOptions(form) {
    const select = form?.elements?.category;
    if (!select) return;
    const existing = new Set([...select.options].map((option) => option.value));
    categoryOptions.forEach((name) => {
      if (existing.has(name)) return;
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  }

  function enhanceProductForm() {
    const form = document.getElementById("modalForm");
    if (!form || form.dataset.switchesEnhanced !== undefined || !form.elements?.tags) return;
    form.dataset.switchesEnhanced = "1";
    addCategoryOptions(form);

    const tagsInput = form.elements.tags;
    const activeTags = new Set(parseTags(tagsInput.value));
    const box = document.createElement("div");
    box.className = "admin-enhancement-box";
    box.innerHTML = `
      <strong>ظهور المنتج في المتجر</strong>
      <div class="admin-chip-grid">
        ${tagControls.map((item) => `
          <label>
            <input type="checkbox" data-product-tag="${item.tag}" ${activeTags.has(item.tag) ? "checked" : ""}>
            ${item.label}
          </label>
        `).join("")}
      </div>
    `;

    const tagsLabel = tagsInput.closest("label");
    if (tagsLabel) tagsLabel.insertAdjacentElement("beforebegin", box);
    else form.appendChild(box);

    form.addEventListener("submit", () => {
      const tags = new Set(parseTags(tagsInput.value));
      tagControls.forEach((item) => tags.delete(item.tag));
      box.querySelectorAll("[data-product-tag]").forEach((checkbox) => {
        if (checkbox.checked) tags.add(checkbox.dataset.productTag);
      });
      tagsInput.value = uniqueTags([...tags]).join(", ");
    }, { capture: true });
  }

  function install() {
    if (window.__SWITCHES_ADMIN_ENHANCEMENTS__) return;
    if (typeof window.openProductEditor !== "function") return;
    window.__SWITCHES_ADMIN_ENHANCEMENTS__ = true;
    const original = window.openProductEditor;
    window.openProductEditor = function (...args) {
      const result = original.apply(this, args);
      window.setTimeout(enhanceProductForm, 0);
      return result;
    };
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("#addProductBtn") || event.target.closest("[onclick^='openProductEditor']")) {
      window.setTimeout(enhanceProductForm, 50);
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    install();
    window.setTimeout(install, 250);
  });
})();
