"""Prepare the user-supplied catalog, without reference selling prices or credentials."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
products = []


def add(slug, name, family, duration="", activation="", region="GLOBAL", kind="SUBSCRIPTION", available=True, image=None, services=None, reference=""):
    platform = {"gemini": "Google AI / Gemini", "canva": "Canva", "capcut": "CapCut", "chatgpt": "ChatGPT", "claude": "Claude", "microsoft": "Microsoft"}[family]
    category = {"gemini": "AI", "chatgpt": "AI", "claude": "AI", "canva": "تصميم", "capcut": "مونتاج", "microsoft": "برامج"}[family]
    meta = {"categoryType": "SUBSCRIPTION", "productType": kind, "family": family, "catalogCategory": category, "platform": platform, "duration": duration, "activationMethod": activation, "region": region, "featured": slug in ("google-gemini-pro-3-months", "canva-pro-1-year-invitation", "capcut-pro-1-month"), "features": [], "bundleServices": services or []}
    note = "اطلب السعر الحالي وتفاصيل التفعيل من فريق سويتشز ستور قبل إتمام الشراء."
    if not available:
        note = "غير متوفر حاليًا إلى حين مراجعة طريقة توفير الخدمة وتفاصيل التفعيل."
    products.append({"name": name, "slug": slug, "category": category, "brand": platform, "images": [f"/assets/subscriptions/{image or family}.svg"], "description": f"{name}. {note}", "availability": "available" if available else "unavailable", "status": "published", "isActive": True, "sortOrder": (len(products) + 1) * 10, "specs": {"_switchesDigital": meta}, "seoTitle": f"{name} | Switches Store", "metaDescription": f"{name} لدى سويتشز ستور. {note}", "internalCost": None, "internalReferencePrice": None, "internalNote": "", "referenceName": reference})


# The two identical 3-month Activation Link references are one catalog item.
add("google-gemini-pro-3-months", "Google AI Gemini Pro — 3 Months", "gemini", "3 أشهر", "Activation Link")
add("google-gemini-pro-6-months-invitation", "Google AI Gemini Pro — 6 Months", "gemini", "6 أشهر", "Invitation Link")
add("google-gemini-pro-6-months-activation", "Google AI Gemini Pro — 6 Months", "gemini", "6 أشهر", "Activation Link")
add("google-gemini-pro-12-months", "Google AI Gemini Pro — 12 Months", "gemini", "12 شهر", "Activation Link")
add("google-ai-subscription-pro-12-months", "Google AI Subscription Pro — 12 Months", "gemini", "12 شهر", "Google One AI Invitation Link")
add("google-gemini-pro-18-months-activation", "Google AI Gemini Pro — 18 Months", "gemini", "18 شهر", "Activation Link")
add("google-gemini-pro-18-months-invitation", "Google AI Gemini Pro — 18 Months", "gemini", "18 شهر", "Invitation Link")
add("google-gemini-pro-18-months-brazil", "Google AI Gemini Pro — 18 Months — Brazil", "gemini", "18 شهر", "Invitation Link", "BRAZIL")
add("gemini-pro-18-months-canva-pro", "Gemini Pro 18 Months + Canva Pro", "gemini", "18 شهر لـ Gemini", "Activation Link", kind="BUNDLE", image="gemini-canva", services=[{"name": "Gemini Pro", "duration": "18 شهر"}, {"name": "Canva Pro", "duration": ""}])
add("canva-pro-1-year-invitation", "Canva Pro — 1 Year", "canva", "سنة", "Invitation Link")
add("canva-pro-1-year-activation", "Canva Pro — 1 Year", "canva", "سنة", "Activation Link")
add("canva-pro-18-months", "Canva Pro — 18 Months", "canva", "18 شهر", kind="ACCOUNT")
add("canva-education-2-years", "Canva Education — 2 Years", "canva", "سنتان", available=False)
add("capcut-pro-1-month", "CapCut Pro — 1 Month", "capcut", "شهر", kind="ACCOUNT")
add("capcut-pro-6-months", "CapCut Pro — 6 Months", "capcut", "6 أشهر", kind="ACCOUNT")
add("chatgpt-plus-1-month", "ChatGPT Plus — 1 Month", "chatgpt", "شهر", region="", available=False)
add("claude-service-reference-100", "Claude — خدمة رقمية (الخيار الأول)", "claude", region="", kind="SERVICE", available=False, reference="Claude API Key — 100 USD")
add("claude-service-reference-250", "Claude — خدمة رقمية (الخيار الثاني)", "claude", region="", kind="SERVICE", available=False, reference="Claude API Key — 250 USD")
add("windows-11-pro-pc", "Microsoft Windows 11 Pro — PC", "microsoft", activation="Microsoft Key", region="", kind="KEY", available=False, image="windows")
add("office-2024-ltsc-professional-plus", "Microsoft Office 2024 LTSC Professional Plus — PC", "microsoft", region="", kind="KEY", available=False, image="office")

if __name__ == "__main__":
    target = ROOT / "data" / "subscriptions-seed.json"
    target.write_text(json.dumps({"version": 1, "products": products}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(products)} unique catalog items; no selling prices or credentials.")
