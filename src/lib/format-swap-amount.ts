/** Display formatting only: never use the rounded value to construct a transaction. */
export function formatSwapAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (number > 0 && number < 0.000001) return "<0.000001";
  return number.toLocaleString("en-US", { maximumFractionDigits: number >= 1 ? 2 : 6 });
}
