from dataclasses import dataclass
import os
import secrets


PROVIDER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


@dataclass(frozen=True)
class GiftCardProviderResult:
    status: str
    provider_name: str
    provider_reference: str = ""
    gift_card_code: str = ""
    serial_number: str = ""
    error_code: str = ""
    error_message: str = ""


class GiftCardProvider:
    provider_name = "base"

    def purchase_gift_card(self, order, idempotency_key):
        raise NotImplementedError

    def get_transaction(self, provider_reference):
        raise NotImplementedError


def random_token(length=8):
    return "".join(secrets.choice(PROVIDER_ALPHABET) for _ in range(length))


class MockGiftCardProvider(GiftCardProvider):
    provider_name = "mock_gift_cards"

    def __init__(self, scenario=None):
        self.scenario = (scenario or os.environ.get("MOCK_GIFT_CARD_SCENARIO") or "success").strip().lower()

    def purchase_gift_card(self, order, idempotency_key):
        scenario = self.scenario if self.scenario in {"success", "failed", "timeout", "out_of_stock"} else "success"
        if scenario == "success":
            return GiftCardProviderResult(
                status="success",
                provider_name=self.provider_name,
                provider_reference=f"MOCK-{random_token(8)}",
                gift_card_code=self.mock_code(order),
                serial_number=f"MOCK-SERIAL-{random_token(10)}",
            )
        if scenario == "timeout":
            return GiftCardProviderResult(
                status="timeout",
                provider_name=self.provider_name,
                error_code="provider_timeout",
                error_message="Mock provider timeout",
            )
        if scenario == "out_of_stock":
            return GiftCardProviderResult(
                status="out_of_stock",
                provider_name=self.provider_name,
                error_code="provider_out_of_stock",
                error_message="Mock provider out of stock",
            )
        return GiftCardProviderResult(
            status="failed",
            provider_name=self.provider_name,
            error_code="provider_failed",
            error_message="Mock provider failed",
        )

    def get_transaction(self, provider_reference):
        return GiftCardProviderResult(
            status="unknown",
            provider_name=self.provider_name,
            provider_reference=provider_reference,
        )

    def mock_code(self, order):
        product = "".join(ch for ch in str(order["product_id"]).upper() if ch.isalnum())[:8] or "CARD"
        region = "".join(ch for ch in str(order["region_id"]).upper() if ch.isalnum())[:6] or "REGION"
        value = "".join(ch for ch in str(order["denomination_value"]).upper() if ch.isalnum())[:6] or "VALUE"
        return f"SWITCHES-TEST-{product}-{region}-{value}-{random_token(4)}-{random_token(4)}"


def get_gift_card_provider():
    return MockGiftCardProvider()
