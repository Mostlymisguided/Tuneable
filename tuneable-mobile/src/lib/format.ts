/** Format wallet balance stored in pence as £X.XX */
export function formatPoundsFromPence(pence: number | undefined | null): string {
  const value = (pence ?? 0) / 100;
  return `£${value.toFixed(2)}`;
}
