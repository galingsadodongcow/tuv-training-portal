type ParamValue = string | number | null | undefined

// Apply a group of URL parameter changes against one snapshot. This avoids
// sequential router.replace calls dropping earlier changes from the same click.
export function updateUrlParams(
  current: { toString(): string },
  updates: Record<string, ParamValue>,
  removableValues: string[] = ['', 'all']
) {
  const next = new URLSearchParams(current.toString())
  for (const [key, value] of Object.entries(updates)) {
    if (value == null || removableValues.includes(String(value))) next.delete(key)
    else next.set(key, String(value))
  }
  return next
}
