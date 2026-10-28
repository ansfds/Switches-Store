(function () {
  const conditions = {
    NEW: "جديد",
    USED: "مستعمل",
    REFURBISHED: "مجدد",
    OPEN_BOX: "شبه جديد",
    "علبة مفتوحة": "شبه جديد",
  };

  function conditionLabel(value) {
    const condition = String(value || "جديد").trim();
    return conditions[condition.toUpperCase()] || condition;
  }

  function availabilityValue(value) {
    const status = String(value || "").trim().replace(/[_\s-]/g, "").toLowerCase();
    if (status === "available") return "available";
    if (status === "comingsoon") return "comingSoon";
    return "unavailable";
  }

  function hasFreeShipping(product) {
    const tags = product.tags || product.tags_json || [];
    return product.freeShipping === true || product.free_shipping === true ||
      (Array.isArray(tags) && tags.includes("freeShipping"));
  }

  function withFreeShipping(tags, enabled) {
    // Store this option in the existing tags field without a schema migration.
    const result = tags.filter(tag => tag !== "freeShipping");
    if (enabled) result.push("freeShipping");
    return result;
  }

  window.SwitchesProductCardData = Object.freeze({
    conditionLabel,
    availabilityValue,
    hasFreeShipping,
    withFreeShipping,
  });
})();
