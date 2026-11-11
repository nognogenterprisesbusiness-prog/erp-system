/** Match path segments, preferring the most specific permitted navigation item. */
export function activeNavigationGroup(pathname: string, items: readonly { href: string; group?: string }[]): string | undefined {
  const path = pathname.split(/[?#]/)[0];
  const match = items.filter(item => {
    const href = item.href.split(/[?#]/)[0];
    return path === href || (href !== "/" && path.startsWith(`${href}/`));
  }).sort((left, right) => right.href.length - left.href.length)[0];
  return match?.group;
}
