import type { ManualGuide } from "./manual";

export const manualGroups = ["Getting started", "Projects and people", "Materials and inventory", "Purchasing", "Site work", "Finance", "Account and support"] as const;
export type ManualGroup = typeof manualGroups[number];
export type ManualTopic = { id: string; title: string; description: string; group: ManualGroup; searchText: string };

const topicNavigation: Record<string, { title: string; group: ManualGroup }> = {
  start: { title: "Quick start", group: "Getting started" },
  roles: { title: "Roles and access", group: "Getting started" },
  access: { title: "Admin setup", group: "Getting started" },
  projects: { title: "Projects and documents", group: "Projects and people" },
  people: { title: "Employees and attendance", group: "Projects and people" },
  warehouses: { title: "Warehouses", group: "Materials and inventory" },
  inventory: { title: "Materials and stock", group: "Materials and inventory" },
  requests: { title: "Requests and site delivery", group: "Materials and inventory" },
  sourcing: { title: "Out-of-stock reports", group: "Materials and inventory" },
  suppliers: { title: "Suppliers and prices", group: "Purchasing" },
  purchases: { title: "Seven-stage purchasing", group: "Purchasing" },
  deliveries: { title: "Inspect and receive", group: "Purchasing" },
  "site-purchases": { title: "Hardware-store purchases", group: "Purchasing" },
  assets: { title: "Equipment and vehicles", group: "Site work" },
  reports: { title: "Attendance and daily reports", group: "Site work" },
  finance: { title: "Billing and project costs", group: "Finance" },
  corrections: { title: "Audited corrections", group: "Finance" },
  mobile: { title: "Mobile app and updates", group: "Account and support" },
  account: { title: "Profile and troubleshooting", group: "Account and support" },
};

export function toManualTopics(guides: readonly ManualGuide[]): ManualTopic[] {
  return guides.map((guide) => {
    const navigation = topicNavigation[guide.id];
    if (!navigation) throw new Error(`Missing manual navigation: ${guide.id}`);
    return {
      id: guide.id, title: navigation.title, description: guide.description, group: navigation.group,
      searchText: [navigation.title, guide.title, guide.description, guide.before, guide.result, ...guide.tips,
        ...guide.steps.flatMap((step) => [step.title, step.detail])].join(" ").toLocaleLowerCase("en"),
    };
  }).sort((a, b) => manualGroups.indexOf(a.group) - manualGroups.indexOf(b.group)
    || Object.keys(topicNavigation).indexOf(a.id) - Object.keys(topicNavigation).indexOf(b.id));
}

export function searchManualTopics(topics: readonly ManualTopic[], query: string) {
  const terms = query.slice(0, 100).trim().toLocaleLowerCase("en").split(/\s+/).filter(Boolean);
  return topics.filter((topic) => terms.every((term) => topic.searchText.includes(term)));
}

export function legacyManualDestination(hash: string, allowedTopics: readonly string[], query = "") {
  let id = "start";
  try {
    const candidate = decodeURIComponent(hash.replace(/^#/, ""));
    if (allowedTopics.includes(candidate)) id = candidate;
  } catch { /* Invalid bookmarks fall back to the first guide. */ }
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim().slice(0, 100));
  return `/manual/${id}${params.size ? `?${params}` : ""}`;
}
