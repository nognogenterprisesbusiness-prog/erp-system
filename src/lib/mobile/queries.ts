import type { SupabaseClient } from "@supabase/supabase-js";
import { mobileResponseSchemas } from "@nognog/domain";
import type { MobileQuery, MobileResource } from "@nognog/domain";
import type { Database } from "@/types/database";
import { readAllPages, readByIds } from "@/lib/data/read-all-pages";
import { safeSearchTerm } from "@/lib/data/search";
import { MobileError, databaseError } from "./http";
import { requireMobileSite } from "./authorization";

const size = 20;
const requestFields =
  "id,request_number,project_id,project_site_id,required_date,purpose,status,requested_by,source_warehouse_name,requested_at,decision_reason";
const reportFields =
  "id,report_number,project_id,project_site_id,report_date,prepared_by,status,work_description,accomplishments,weather_conditions,issues_encountered,site_observations,general_remarks,photo_path";
type Client = SupabaseClient<Database>;
function required(value: string | undefined) {
  if (!value)
    throw new MobileError(400, "Choose a project, site or record first.");
  return value;
}
function page<T>(items: T[], count: number | null, query: MobileQuery) {
  return { items, count: count ?? 0, page: query.page, pageSize: size };
}
async function siteLocation(c: Client, q: MobileQuery) {
  const s = await c
    .from("project_sites")
    .select("id")
    .eq("id", required(q.siteId))
    .eq("project_id", required(q.projectId))
    .maybeSingle();
  if (s.error) databaseError(s.error);
  if (!s.data)
    throw new MobileError(404, "Project site is no longer available.");
  const r = await c
    .from("inventory_locations")
    .select("id")
    .eq("project_site_id", s.data.id)
    .single();
  if (r.error) databaseError(r.error);
  return r.data!.id;
}
/** Photo paths for assets the caller may see, including requestable warehouse assets. */
async function assetPhotos(c: Client, assetIds: string[]) {
  const ids = [...new Set(assetIds)];
  if (!ids.length) return new Map<string, string>();
  const r = await c.rpc("get_asset_photo_paths", { p_asset_ids: ids });
  // Photos are optional: a failed lookup (e.g. migration not yet applied) must
  // not block the list, so rows fall back to their icon.
  if (r.error) {
    console.error("Asset photo lookup failed:", r.error.message);
    return new Map<string, string>();
  }
  return new Map((r.data ?? []).map((x) => [x.asset_id, x.photo_path]));
}
async function materialReferences(
  c: Client,
  materialIds: string[],
  unitIds: string[],
) {
  const [m, u] = await Promise.all([
    materialIds.length
      ? c
          .from("materials")
          .select("id,name,code,base_unit_id,photo_path")
          .in("id", [...new Set(materialIds)])
      : Promise.resolve({ data: [], error: null }),
    unitIds.length
      ? c
          .from("units_of_measure")
          .select("id,symbol")
          .in("id", [...new Set(unitIds)])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (m.error) databaseError(m.error);
  if (u.error) databaseError(u.error);
  return {
    materials: new Map((m.data ?? []).map((x) => [x.id, x])),
    units: new Map((u.data ?? []).map((x) => [x.id, x.symbol])),
  };
}
export async function readMobileResource(
  c: Client,
  resource: MobileResource,
  q: MobileQuery,
  user: { id: string; full_name: string; email: string; roles: string[] },
) {
  const offset = (q.page - 1) * size;
  const search = safeSearchTerm(q.search);
  switch (resource) {
    case "session": {
      const r = await c.rpc("get_unread_notification_count");
      if (r.error) databaseError(r.error);
      return { ...user, unread: r.data ?? 0 };
    }
    case "projects": {
      const r = await c.rpc("get_mobile_projects", {
        p_search: q.search,
        p_offset: offset,
        p_limit: size,
      });
      if (r.error) databaseError(r.error);
      return page(
        (r.data ?? []).map((x) => x.record),
        r.data?.[0]?.total_count ?? 0,
        q,
      );
    }
    case "project": {
      const projectId = required(q.id ?? q.projectId);
      const r = await c.rpc("get_mobile_projects", { p_id: projectId });
      if (r.error) databaseError(r.error);
      if (!r.data?.length)
        throw new MobileError(404, "Project is no longer assigned to you.");
      const project = mobileResponseSchemas.project.shape.project.parse(
        r.data[0].record,
      );
      const [sites, assignments, warehouseResult] = await Promise.all([
        readAllPages(
          (from, to) =>
            c
              .from("project_sites")
              .select(
                "id,project_id,name,status,address,description,foreman_id,engineer_id",
              )
              .eq("project_id", projectId)
              .order("name")
              .order("id")
              .range(from, to),
          "project sites",
        ),
        readAllPages(
          (from, to) =>
            c
              .from("project_assignments")
              .select("user_id,assignment_role")
              .eq("project_id", projectId)
              .eq("status", "active")
              .order("id")
              .range(from, to),
          "project personnel",
        ),
        c.rpc("get_requestable_warehouses"),
      ]);
      if (warehouseResult.error) databaseError(warehouseResult.error);
      const permittedSites = sites.filter((site) =>
        project.site_permissions.some(
          (permission) => permission.id === site.id,
        ),
      );
      const personnel = [
        ...assignments,
        ...permittedSites.flatMap((site) => [
          ...(site.foreman_id
            ? [{ user_id: site.foreman_id, assignment_role: "foreman" }]
            : []),
          ...(site.engineer_id
            ? [{ user_id: site.engineer_id, assignment_role: "engineer" }]
            : []),
        ]),
      ].filter(
        (person, index, all) =>
          all.findIndex(
            (other) =>
              other.user_id === person.user_id &&
              other.assignment_role === person.assignment_role,
          ) === index,
      );
      const ids = [...new Set(personnel.map((a) => a.user_id))];
      const [profiles, locations] = await Promise.all([
        readByIds(
          ids,
          (batch, from, to) =>
            c
              .from("profiles")
              .select("id,full_name")
              .in("id", batch)
              .order("id")
              .range(from, to),
          "project personnel profiles",
        ),
        sites.length
          ? readByIds(
              sites.map((s) => s.id),
              (batch, from, to) =>
                c
                  .from("inventory_locations")
                  .select("id,project_site_id")
                  .in("project_site_id", batch)
                  .order("id")
                  .range(from, to),
              "site locations",
            )
          : Promise.resolve([]),
      ]);
      const profileNames = new Map(
        profiles.map((profile) => [profile.id, profile.full_name]),
      );
      const siteLocations = new Map(
        locations.map((location) => [location.project_site_id, location.id]),
      );
      return {
        project,
        sites: permittedSites.map((s) => ({
          ...s,
          location_id: siteLocations.get(s.id) ?? null,
        })),
        personnel: personnel.map((a) => ({
          id: a.user_id,
          name: profileNames.get(a.user_id) ?? "Assigned colleague",
          role: a.assignment_role,
        })),
        warehouses: (warehouseResult.data ?? [])
          .filter((w) => w.project_id === projectId)
          .map((w) => ({ id: w.warehouse_id, name: w.name })),
      };
    }
    case "requests": {
      let query = c
        .from("material_requests")
        .select(requestFields, { count: "exact" })
        .order("requested_at", { ascending: false })
        .order("id");
      if (q.projectId) query = query.eq("project_id", q.projectId);
      if (search) query = query.ilike("request_number", `%${search}%`);
      const r = await query.range(offset, offset + size - 1);
      if (r.error) databaseError(r.error);
      return page(r.data ?? [], r.count, q);
    }
    case "request": {
      const id = required(q.id);
      const r = await c
        .from("material_requests")
        .select(requestFields)
        .eq("id", id)
        .maybeSingle();
      if (r.error) databaseError(r.error);
      if (!r.data)
        throw new MobileError(404, "Request is no longer available.");
      const [l, e] = await Promise.all([
        c
          .from("material_request_lines")
          .select(
            "id,material_id,unit_of_measure_id,requested_quantity,approved_quantity",
          )
          .eq("request_id", id)
          .order("id"),
        c
          .from("material_request_events")
          .select("id,event_type,occurred_at", { count: "exact" })
          .eq("request_id", id)
          .order("occurred_at", { ascending: false })
          .order("id")
          .range(offset, offset + size - 1),
      ]);
      if (l.error) databaseError(l.error);
      if (e.error) databaseError(e.error);
      const lines = l.data ?? [];
      const refs = await materialReferences(
        c,
        lines.map((x) => x.material_id),
        lines.map((x) => x.unit_of_measure_id),
      );
      const d = lines.length
        ? await readAllPages(
            (from, to) =>
              c
                .from("material_request_dispatches")
                .select("id,request_line_id,transfer_item_id")
                .in(
                  "request_line_id",
                  lines.map((x) => x.id),
                )
                .order("id")
                .range(from, to),
            "request deliveries",
          )
        : [];
      const transfers = d.length
        ? await readByIds(
            d.map((x) => x.transfer_item_id),
            (batch, from, to) =>
              c
                .from("inventory_transfer_items")
                .select(
                  "id,transfer_id,dispatched_quantity,received_quantity,variance_quantity",
                )
                .in("id", batch)
                .order("id")
                .range(from, to),
            "request transfer items",
          )
        : [];
      const transferById = new Map(
        transfers.map((transfer) => [transfer.id, transfer]),
      );
      const manifests = transfers.length ? await c.from("material_delivery_manifests")
        .select("transfer_id,vehicle_label,driver_name,delivery_reference")
        .in("transfer_id", [...new Set(transfers.map((item) => item.transfer_id))])
        : { data: [], error: null };
      if (manifests.error) databaseError(manifests.error);
      const manifestByTransfer = new Map((manifests.data ?? []).map((item) => [item.transfer_id, item]));
      return {
        request: r.data,
        lines: lines.map((x) => ({
          ...x,
          name: refs.materials.get(x.material_id)?.name ?? "Material",
          unit: refs.units.get(x.unit_of_measure_id) ?? "",
          photo_path: refs.materials.get(x.material_id)?.photo_path ?? null,
        })),
        events: page(e.data ?? [], e.count, q),
        dispatches: d.map((x) => {
          const t = transferById.get(x.transfer_item_id);
          if (!t)
            throw new MobileError(503, "Delivery details could not be loaded.");
          const manifest = manifestByTransfer.get(t.transfer_id);
          return {
            id: x.transfer_item_id,
            request_line_id: x.request_line_id,
            remaining:
              Number(t.dispatched_quantity) -
              Number(t.received_quantity) -
              Number(t.variance_quantity),
            dispatched: t.dispatched_quantity,
            received: t.received_quantity,
            variance: t.variance_quantity,
            vehicle_label: manifest?.vehicle_label ?? null,
            driver_name: manifest?.driver_name ?? null,
            delivery_reference: manifest?.delivery_reference ?? null,
          };
        }),
      };
    }
    case "materials": {
      const r = await c.rpc("search_requestable_warehouse_stock", {
        p_project_id: required(q.projectId),
        p_warehouse_id: required(q.warehouseId),
        p_search: q.search,
        p_offset: offset,
        p_limit: size,
      });
      if (r.error) databaseError(r.error);
      const rows = r.data ?? [];
      const refs = await materialReferences(
        c,
        rows.map((x) => x.id),
        rows.map((x) => x.unit_id),
      );
      return page(
        rows.map((x) => ({
          id: x.id,
          name: x.label,
          unit_id: x.unit_id,
          unit: refs.units.get(x.unit_id) ?? "",
          photo_path: refs.materials.get(x.id)?.photo_path ?? null,
          available_quantity: x.available_quantity,
        })),
        rows[0]?.total_count ?? 0,
        q,
      );
    }
    case "inventory": {
      const location = await siteLocation(c, q);
      const r = await c.rpc("list_inventory_balances", {
        p_location_id: location,
        p_query: q.search,
        p_offset: offset,
        p_limit: size,
      });
      if (r.error) databaseError(r.error);
      const rows = r.data ?? [];
      const m = rows.length
        ? await c
            .from("materials")
            .select("id,name,code,base_unit_id,photo_path")
            .in(
              "id",
              rows.map((x) => x.material_id),
            )
        : { data: [], error: null };
      if (m.error) databaseError(m.error);
      const refs = await materialReferences(
        c,
        [],
        (m.data ?? []).map((x) => x.base_unit_id),
      );
      return page(
        rows.map((x) => {
          const material = m.data?.find((y) => y.id === x.material_id);
          if (!material)
            throw new MobileError(503, "Material details could not be loaded.");
          return {
            id: x.id,
            material_id: x.material_id,
            name: material.name,
            code: material.code,
            unit_id: material.base_unit_id,
            unit: refs.units.get(material.base_unit_id) ?? "",
            photo_path: material.photo_path,
            on_hand: x.quantity_on_hand,
            reserved: x.reserved_quantity,
            available: x.available_quantity,
          };
        }),
        rows[0]?.total_count ?? 0,
        q,
      );
    }
    case "inventory-history": {
      const location = await siteLocation(c, q);
      let query = c
        .from("inventory_transactions")
        .select(
          "id,material_id,unit_of_measure_id,quantity,transaction_type,transaction_date,remarks",
          { count: "exact" },
        )
        .or(
          `source_location_id.eq.${location},destination_location_id.eq.${location}`,
        )
        .order("transaction_date", { ascending: false })
        .order("id");
      if (q.date) query = query.eq("transaction_date", q.date);
      if (q.transactionType) query = query.eq("transaction_type", q.transactionType);
      const r = await query.range(offset, offset + size - 1);
      if (r.error) databaseError(r.error);
      const rows = r.data ?? [];
      const reversals = rows.length
        ? await c.from("inventory_transactions").select("reversal_of").in("reversal_of", rows.map((x) => x.id))
        : { data: [], error: null };
      if (reversals.error) databaseError(reversals.error);
      const reversed = new Set((reversals.data ?? []).map((x) => x.reversal_of));
      const refs = await materialReferences(
        c,
        rows.map((x) => x.material_id),
        rows.map((x) => x.unit_of_measure_id),
      );
      return page(
        rows.map((x) => ({
          ...x,
          name: refs.materials.get(x.material_id)?.name ?? "Material",
          unit: refs.units.get(x.unit_of_measure_id) ?? "",
          reversed: reversed.has(x.id),
        })),
        r.count,
        q,
      );
    }
    case "equipment": {
      const location = await siteLocation(c, q);
      const l = await c
        .from("asset_locations")
        .select("id")
        .eq("inventory_location_id", location)
        .single();
      if (l.error) databaseError(l.error);
      let query = c
        .from("assets")
        .select("id,code,name,status,asset_kind,photo_path", { count: "exact" })
        .eq("current_location_id", l.data!.id)
        .is("archived_at", null)
        .order("name")
        .order("id");
      if (search) query = query.ilike("name", `%${search}%`);
      const r = await query.range(offset, offset + size - 1);
      if (r.error) databaseError(r.error);
      return page(r.data ?? [], r.count, q);
    }
    case "equipment-options":
    case "workers":
    case "attendance":
    case "equipment-history": {
      const r = await c.rpc("get_mobile_site_operations", {
        p_kind: resource,
        p_project_id: required(q.projectId),
        p_site_id: required(q.siteId),
        p_search: q.search,
        p_offset: offset,
        p_limit: size,
        ...(q.date ? { p_date: q.date } : {}),
      });
      if (r.error) databaseError(r.error);
      const records = (r.data ?? []).map((x) => x.record as Record<string, unknown>);
      const photos =
        resource === "equipment-options"
          ? await assetPhotos(c, records.map((x) => String(x.id)))
          : null;
      return page(
        photos ? records.map((x) => ({ ...x, photo_path: photos.get(String(x.id)) ?? null })) : records,
        r.data?.[0]?.total_count ?? 0,
        q,
      );
    }
    case "equipment-requests": {
      let query = c
        .from("equipment_requests")
        .select(
          "id,project_id,project_site_id,asset_id,asset_code,asset_name,status,needed_on,expected_return_on,purpose,requested_by",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .order("id");
      if (q.projectId) query = query.eq("project_id", q.projectId);
      if (search) query = query.ilike("asset_name", `%${search}%`);
      const r = await query.range(offset, offset + size - 1);
      if (r.error) databaseError(r.error);
      const photos = await assetPhotos(c, (r.data ?? []).map((x) => x.asset_id));
      return page(
        (r.data ?? []).map((x) => ({ ...x, photo_path: photos.get(x.asset_id) ?? null })),
        r.count,
        q,
      );
    }
    case "reports": {
      let query = c
        .from("daily_reports")
        .select(reportFields, { count: "exact" })
        .order("report_date", { ascending: false })
        .order("id");
      if (q.projectId) query = query.eq("project_id", q.projectId);
      if (q.siteId) query = query.eq("project_site_id", q.siteId);
      if (search) query = query.ilike("report_number", `%${search}%`);
      const r = await query.range(offset, offset + size - 1);
      if (r.error) databaseError(r.error);
      return page(r.data ?? [], r.count, q);
    }
    case "report": {
      const r = await c
        .from("daily_reports")
        .select(reportFields)
        .eq("id", required(q.id))
        .maybeSingle();
      if (r.error) databaseError(r.error);
      if (!r.data) throw new MobileError(404, "Report is no longer available.");
      return r.data;
    }
    case "report-resources": {
      const report = await c
        .from("daily_reports")
        .select("project_id,project_site_id")
        .eq("id", required(q.id))
        .maybeSingle();
      if (report.error) databaseError(report.error);
      if (!report.data)
        throw new MobileError(404, "Report is no longer available.");
      await requireMobileSite(
        c,
        report.data.project_id,
        report.data.project_site_id,
      );
      const r = await c.rpc("list_daily_report_resources", {
        p_report_id: required(q.id),
        p_linked: q.linked === "true",
        p_offset: offset,
        p_limit: size,
      });
      if (r.error) databaseError(r.error);
      return page(
        (r.data ?? []).map((x) => ({
          resource_id: x.resource_id,
          kind: x.kind,
          label: x.label,
          quantity: x.quantity,
          unit: x.unit,
          reversed: x.reversed,
          site_known: x.site_known,
        })),
        r.data?.[0]?.total_count ?? 0,
        q,
      );
    }
    case "notifications": {
      const r = await c
        .from("notifications")
        .select(
          "id,title,message,read_at,created_at,entity_type,entity_id,project_id",
          { count: "exact" },
        )
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + size - 1);
      if (r.error) databaseError(r.error);
      return page(r.data ?? [], r.count, q);
    }
    case "qr": {
      const r = await c.rpc("resolve_mobile_qr_code", {
        p_identifier: required(q.identifier),
      });
      if (r.error) databaseError(r.error);
      if (!r.data)
        throw new MobileError(
          404,
          "This code is unavailable or you do not have access.",
        );
      return r.data;
    }
  }
}
