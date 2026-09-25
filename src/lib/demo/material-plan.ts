import { milliToQuantity, quantityToMilli, type DemoData } from "./schema";

export function demoMaterialPlanSummary(tables: DemoData, plan: DemoData["projectMaterialPlans"][number]) {
  const requests = tables.materialRequests.filter((request) => !request.legacy && request.projectId === plan.projectId && request.siteId === plan.siteId && request.materialId === plan.materialId);
  const requestIds = new Set(requests.map((request) => request.id));
  const usedMilli = tables.requestMovements.filter((movement) => requestIds.has(movement.requestId) && movement.kind === "consumption").reduce((sum, movement) => sum + quantityToMilli(movement.quantity), 0);
  const siteMilli = quantityToMilli(tables.siteBalances.find((balance) => balance.siteId === plan.siteId && balance.materialId === plan.materialId)?.quantity ?? 0);
  const openMilli = requests.reduce((sum, request) => {
    if (request.legacy || request.status === "rejected") return sum;
    if (request.status === "submitted") return sum + quantityToMilli(request.quantity);
    const received = tables.requestMovements.filter((movement) => movement.requestId === request.id && movement.kind === "receipt").reduce((total, movement) => total + quantityToMilli(movement.quantity), 0);
    return sum + Math.max(0, quantityToMilli(request.approvedQuantity) - received);
  }, 0);
  const needMilli = Math.max(0, quantityToMilli(plan.plannedQuantity) - usedMilli - siteMilli - openMilli);
  const warehouseMilli = quantityToMilli(tables.balances.find((balance) => balance.warehouseId === plan.warehouseId && balance.materialId === plan.materialId)?.quantity ?? 0);
  return {
    used: milliToQuantity(usedMilli),
    onSite: milliToQuantity(siteMilli),
    openRequests: milliToQuantity(openMilli),
    need: milliToQuantity(needMilli),
    warehouseOnHand: milliToQuantity(warehouseMilli),
    sourceGap: milliToQuantity(Math.max(0, needMilli - warehouseMilli)),
  };
}
