import argparse
from datetime import date, datetime, timedelta, timezone
import json
import random
import uuid

CHANNELS = ["online", "mobile", "atm", "branch", "pos"]
CURRENCIES = ["USD", "EUR", "GBP"]
SAMPLE_NARRATIVES = [
    "Payroll direct deposit",
    "Grocery store POS payment",
    "Coffee shop €3.50 purchase",
    "International wire transfer 💸",
    "ATM Cash Withdrawal",
    "Subscription monthly fee",
    "Utility bill payment",
]


def generate_synthetic_data(
    num_customers: int = 100,
    num_accounts: int = 200,
    num_txns: int = 2000,
    seed: int = 42,
) -> dict[str, list[dict]]:
    """Generate deterministic synthetic core banking dataset."""
    rng = random.Random(seed)

    base_time = datetime(2015, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    max_days = 3650  # 10 years

    customers = []
    for i in range(1, num_customers + 1):
        cust_id = f"CUST-{i:05d}"
        created_at = base_time + timedelta(days=rng.randint(0, 365), hours=rng.randint(0, 23))
        customers.append({
            "customer_id": cust_id,
            "name": f"Customer {i}",
            "dob": (date(1970, 1, 1) + timedelta(days=rng.randint(0, 15000))).isoformat(),
            "kyc_status": "verified" if rng.random() > 0.05 else "pending",
            "created_at": created_at.isoformat(),
            "closed_at": None,
        })

    accounts = []
    legal_holds = []
    for i in range(1, num_accounts + 1):
        acc_id = f"ACC-{i:06d}"
        cust = rng.choice(customers)
        opened_at = datetime.fromisoformat(cust["created_at"]) + timedelta(days=rng.randint(1, 30))
        is_hold = rng.random() < 0.02  # 1-2% legal hold
        accounts.append({
            "account_id": acc_id,
            "customer_id": cust["customer_id"],
            "type": rng.choice(["checking", "savings", "money_market"]),
            "status": "active" if rng.random() > 0.1 else "dormant",
            "opened_at": opened_at.isoformat(),
            "closed_at": None,
        })

        if is_hold:
            legal_holds.append({
                "hold_id": f"HOLD-{len(legal_holds) + 1:04d}",
                "account_id": acc_id,
                "reason": "Subpoena legal hold #SEC-2024",
                "active": True,
                "placed_at": (opened_at + timedelta(days=10)).isoformat(),
                "released_at": None,
            })

    transactions = []
    for i in range(1, num_txns + 1):
        acc = rng.choice(accounts)
        acc_open = datetime.fromisoformat(acc["opened_at"])
        txn_date = acc_open + timedelta(days=rng.randint(0, 3000), seconds=rng.randint(0, 86400))

        # ~20% NULL narratives, others sample with unicode
        if rng.random() < 0.20:
            narrative = None
        else:
            narrative = rng.choice(SAMPLE_NARRATIVES)

        amount = round(rng.uniform(1.0, 5000.0), 2)
        transactions.append({
            "txn_id": i,
            "account_id": acc["account_id"],
            "txn_date": txn_date.isoformat(),
            "amount": amount,
            "currency": rng.choice(CURRENCIES),
            "channel": rng.choice(CHANNELS),
            "narrative": narrative,
            "metadata": json.dumps({"ref": f"REF-{i:08d}"}),
        })

    return {
        "customers": customers,
        "accounts": accounts,
        "legal_holds": legal_holds,
        "transactions": transactions,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic bank simulation data")
    parser.add_argument("--customers", type=int, default=100)
    parser.add_argument("--accounts", type=int, default=200)
    parser.add_argument("--transactions", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=str, default=None)
    args = parser.parse_args()

    data = generate_synthetic_data(
        num_customers=args.customers,
        num_accounts=args.accounts,
        num_txns=args.transactions,
        seed=args.seed,
    )

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"Generated data written to {args.output}")
    else:
        print(f"Generated {len(data['customers'])} customers, {len(data['accounts'])} accounts, {len(data['transactions'])} transactions, {len(data['legal_holds'])} holds.")
