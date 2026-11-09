const workspacePrefixes = ["/dashboard", "/projects", "/warehouses", "/inventory", "/requests", "/purchase-orders/receive", "/scan"];

export function workspaceReturnPath(value: unknown) {
  if (typeof value !== "string" || value.length > 1024 || !/^\/[a-z0-9/-]+(?:\?[^#\s\\]*)?$/i.test(value) || value.startsWith("//"))
    return undefined;
  const url = new URL(value, "https://erp.invalid");
  if (url.origin !== "https://erp.invalid" ||
    !workspacePrefixes.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) return undefined;
  return url.pathname + url.search;
}
