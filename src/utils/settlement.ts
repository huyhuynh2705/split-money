import type { Balance, Expense, Settlement } from "../types";

export function computeBalances(expenses: Expense[], members: string[]): Balance[] {
  const map = new Map<string, number>();
  for (const m of members) map.set(m, 0);

  for (const e of expenses) {
    const n = e.sharedWith.length;
    if (n === 0) continue;
    const share = e.amount / n;
    map.set(e.payer, (map.get(e.payer) ?? 0) + e.amount);
    for (const p of e.sharedWith) {
      map.set(p, (map.get(p) ?? 0) - share);
    }
  }

  return members.map((m) => ({ person: m, amount: map.get(m) ?? 0 }));
}

export function computeSettlements(balances: Balance[]): Settlement[] {
  const eps = 0.01;
  const debtors = balances
    .filter((b) => b.amount < -eps)
    .map((b) => ({ person: b.person, amount: -b.amount }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = balances
    .filter((b) => b.amount > eps)
    .map((b) => ({ person: b.person, amount: b.amount }))
    .sort((a, b) => b.amount - a.amount);

  const transactions: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const transfer = Math.min(d.amount, c.amount);
    transactions.push({ from: d.person, to: c.person, amount: transfer });
    d.amount -= transfer;
    c.amount -= transfer;
    if (d.amount < eps) i++;
    if (c.amount < eps) j++;
  }
  return transactions;
}

export function formatVND(n: number): string {
  return (
    new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(n) + "k"
    // }).format(n) + " ₫"
  );
}
