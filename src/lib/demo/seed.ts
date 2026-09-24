import { DEMO_SCHEMA_VERSION, type DemoSnapshot } from "./schema";

export function createDemoSeed(): DemoSnapshot {
  return {
    schemaVersion: DEMO_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      users: [
        { id: "demo-user-admin", name: "Demo Admin", role: "admin", email: "admin@nognog.demo", phone: "+63 917 555 0100" },
        { id: "demo-user-engineer", name: "Demo Engineer", role: "engineer", email: "engineer@nognog.demo" },
        { id: "demo-user-foreman", name: "Demo Foreman", role: "foreman", email: "foreman@nognog.demo" },
        { id: "demo-user-warehouse", name: "Demo Warehouse Staff", role: "warehouse_staff", email: "warehouse@nognog.demo" },
        { id: "demo-user-accounting", name: "Demo Accounting", role: "accounting", email: "accounting@nognog.demo" },
      ],
      projects: [
        { id: "demo-project-residential", code: "DEMO-001", name: "Residential Building A", status: "active", location: "Cebu City", municipalityCode: "0730600000", address: "Cebu City, Cebu", photo: "/demo-residential.webp" },
        { id: "demo-project-commercial", code: "DEMO-002", name: "Commercial Building B", status: "active", location: "Mandaue City", municipalityCode: "0731300000", address: "Mandaue City, Cebu", photo: "/demo-commercial.webp" },
      ],
      sites: [
        { id: "demo-site-residential", projectId: "demo-project-residential", name: "Residential Building A Site" },
        { id: "demo-site-commercial", projectId: "demo-project-commercial", name: "Commercial Building B Site" },
      ],
      warehouses: [
        { id: "demo-warehouse-main", name: "Main Warehouse", location: "Cebu City", municipalityCode: "0730600000", address: "Cebu City, Cebu", photo: "/demo-warehouse-main.webp" },
        { id: "demo-warehouse-north", name: "North Warehouse", location: "Mandaue City", municipalityCode: "0731300000", address: "Mandaue City, Cebu", photo: "/demo-warehouse-north.webp" },
      ],
      materials: [
        { id: "demo-material-cement", code: "CEM-001", name: "Portland cement", unit: "bags", photo: "/demo-cement.webp" },
        { id: "demo-material-steel", code: "STL-001", name: "Steel bars", unit: "pieces", photo: "/demo-steel.webp" },
        { id: "demo-material-gravel", code: "GRV-001", name: "Gravel", unit: "m³", photo: "/demo-gravel.webp" },
      ],
      balances: [
        { id: "demo-balance-cement", materialId: "demo-material-cement", warehouseId: "demo-warehouse-main", quantity: 240 },
        { id: "demo-balance-steel", materialId: "demo-material-steel", warehouseId: "demo-warehouse-main", quantity: 120 },
        { id: "demo-balance-gravel", materialId: "demo-material-gravel", warehouseId: "demo-warehouse-north", quantity: 40 },
      ],
      transactions: [
        { id: "demo-transaction-cement", materialId: "demo-material-cement", warehouseId: "demo-warehouse-main", quantity: 240, kind: "opening_balance", date: "2026-09-01" },
        { id: "demo-transaction-steel", materialId: "demo-material-steel", warehouseId: "demo-warehouse-main", quantity: 120, kind: "opening_balance", date: "2026-09-01" },
        { id: "demo-transaction-gravel", materialId: "demo-material-gravel", warehouseId: "demo-warehouse-north", quantity: 40, kind: "opening_balance", date: "2026-09-01" },
      ],
      equipment: [
        { id: "demo-equipment-excavator", code: "EQ-001", sku: "EXC-HYD-320", name: "Excavator #001", status: "available", location: "Residential Building A Site" },
        { id: "demo-equipment-mixer", code: "EQ-002", sku: "MIX-CON-200", name: "Concrete Mixer #001", status: "available", location: "Main Warehouse" },
      ],
      employees: [
          { id: "demo-employee-mason", name: "Demo Mason", trade: "Masonry", contactNumber: "+63 917 555 0101", email: "mason@example.test", photo: "/demo-employee-mason.webp" },
          { id: "demo-employee-carpenter", name: "Demo Carpenter", trade: "Carpentry", contactNumber: "+63 917 555 0102", email: "carpenter@example.test" },
      ],
      suppliers: [
        { id: "demo-supplier-hardware", name: "Demo Hardware A", category: "Building materials" },
        { id: "demo-supplier-aggregates", name: "Demo Aggregates B", category: "Aggregates" },
      ],
      dailyReports: [{ id: "demo-report-01", projectId: "demo-project-residential", date: "2026-09-01", summary: "Foundation layout prepared for review.", photo: "/demo-daily-report.webp" }],
      notifications: [
        { id: "demo-notification-report", userId: "demo-user-admin", title: "Daily report ready", message: "The foundation layout daily report is ready for review.", read: false, date: "2026-09-01" },
        { id: "demo-notification-stock", userId: "demo-user-warehouse", title: "Stock available", message: "Opening stock is available in the Main Warehouse.", read: false, date: "2026-09-01" },
      ],
      materialRequests: [],
      projectAssignments: [
        { id: "demo-assignment-engineer-residential", userId: "demo-user-engineer", projectId: "demo-project-residential" },
        { id: "demo-assignment-foreman-residential", userId: "demo-user-foreman", projectId: "demo-project-residential" },
      ],
      warehouseMemberships: [
        { id: "demo-membership-main", userId: "demo-user-warehouse", warehouseId: "demo-warehouse-main" },
        { id: "demo-membership-north", userId: "demo-user-warehouse", warehouseId: "demo-warehouse-north" },
      ],
      siteBalances: [],
      requestMovements: [],
      attendance: [],
      purchaseOrders: [],
      projectExpenses: [],
      auditLogs: [],
      qrCodes: [],
    },
  };
}
