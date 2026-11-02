/**
 * Shared formatters for GhostLoad AI UI
 */

export function formatDays(days: number | undefined | null): string {
  const d = Math.round(Number(days) || 0);
  return `${d} ${d === 1 ? "day" : "days"}`;
}

export function formatCurrency(amount: number | undefined | null): string {
  const val = Number(amount) || 0;
  return `₹${val.toLocaleString("en-IN")}`;
}

export function getTrustBadgeVariant(score: number | undefined | null): "success" | "warning" | "danger" {
  const s = Number(score) || 0;
  if (s >= 90) return "success";
  if (s >= 75) return "warning";
  return "danger";
}

export function formatSellerName(name: string, city?: string): string {
  if (!name) return "Seller";
  if (!city) return name;
  const cleanCity = city.trim();
  // If the seller name already mentions the city anywhere (e.g. "Warehouse B (Chennai Hub)"), do not duplicate
  if (name.toLowerCase().includes(cleanCity.toLowerCase())) {
    return name;
  }
  return `${name} (${cleanCity})`;
}
