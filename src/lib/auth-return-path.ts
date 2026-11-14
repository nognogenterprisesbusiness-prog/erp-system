const workspacePrefixes = ["/dashboard", "/projects", "/warehouses", "/inventory", "/requests", "/purchase-orders", "/scan", "/employees", "/attendance", "/payroll", "/users", "/equipment", "/vehicles", "/materials", "/suppliers", "/site-purchases", "/documents", "/reports/daily", "/billing", "/profile", "/notifications", "/audit-logs", "/qr-codes"];

export function workspaceReturnPath(value: unknown) {
  if (typeof value !== "string" || value.length > 1024 || !/^\/[a-z0-9/-]+(?:\?[^#\s\\]*)?$/i.test(value) || value.startsWith("//"))
    return undefined;
  const url = new URL(value, "https://erp.invalid");
  if (url.origin !== "https://erp.invalid" ||
    !workspacePrefixes.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) return undefined;
  return url.pathname + url.search;
}
