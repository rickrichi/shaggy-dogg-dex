// src/lib/format-price.ts

/** A USD price with enough digits to stay readable when it is a tiny fraction of a cent. */
export function formatUsdPrice(price: number) {
  const digits =
    price >= 0.01
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { maximumSignificantDigits: 3 };
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", ...digits }).format(
    price
  );
}
