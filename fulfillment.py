from database import complete_fulfillment, prepare_fulfillment
from gift_card_provider import get_gift_card_provider


def fulfillment_log(message):
    print(f"[FULFILLMENT] {message}", flush=True)


def fulfill_paid_order(order_id):
    provider = get_gift_card_provider()
    prepared = prepare_fulfillment(order_id, provider.provider_name)
    action = prepared.get("action")
    order = prepared.get("order")

    if action != "purchase":
        return order

    order_number = order["order_number"]
    fulfillment_log(f"starting order={order_number} provider={provider.provider_name}")
    result = provider.purchase_gift_card(order, prepared["idempotency_key"])
    fulfillment_log(
        f"provider result order={order_number} provider={result.provider_name} status={result.status} reference_present={'yes' if result.provider_reference else 'no'}"
    )
    return complete_fulfillment(order_id, prepared["attempt_id"], result)
