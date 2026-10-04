# Nognog ERP — Testing Guide

This guide shows what each account can do and walks through one complete project, from buying materials to billing the client. Use test projects and test stock during this round, not real company records.

- **Web app:** every role
- **Mobile app (Android / iOS):** Foreman and Engineer

---

## How the work flows between accounts

```mermaid
flowchart LR
    A["👤 Admin<br/>buys materials<br/>(purchase order)"] --> W1["📦 Warehouse Staff<br/>receives delivery<br/>into warehouse"]
    W1 --> F1["👷 Foreman<br/>requests materials<br/>for the site"]
    F1 --> E["🧑‍💼 Engineer<br/>approves request"]
    E --> W2["📦 Warehouse Staff<br/>releases with vehicle<br/>and driver"]
    W2 --> F2["👷 Foreman<br/>receives at site,<br/>records use"]
    F2 --> R["📝 Daily report<br/>Foreman submits,<br/>Engineer reviews"]
    F2 --> C["💰 Project cost<br/>charged automatically"]
    C --> FI["💼 Finance<br/>invoices client,<br/>records payment"]
```

A request only lists materials that are in stock at the chosen warehouse. If something is missing, the Foreman or Engineer reports it to Admin, who buys it.

---

## What each account can do

Admin invites everyone from **Users**. Engineers and Foremen only see projects they are assigned to. Warehouse Staff only see warehouses they are assigned to. Laborers are employee records and do not log in.

### Access at a glance

| Task | Admin | Finance | Engineer | Foreman | Warehouse Staff |
|---|:---:|:---:|:---:|:---:|:---:|
| Invite users, set roles | ✅ | — | — | — | — |
| Create projects, sites, budgets | ✅ | — | — | — | — |
| Upload, rename and delete project documents | ✅ | — | — | — | — |
| View and download project documents | ✅ | — | ✅ | ✅ | — |
| Add suppliers, issue purchase orders | ✅ | — | — | — | — |
| View purchase orders, suppliers and prices | ✅ | ✅ | — | — | — |
| Record supplier payments (cash or check) | ✅ | ✅ | — | — | — |
| Void a supplier payment | ✅ | — | — | — | — |
| Receive deliveries for a purchase order Admin issued | ✅ | — | — | — | ✅ |
| Add stock without a purchase order | ✅ | — | — | — | — |
| Request materials (in-stock only) | — | — | ✅ | ✅ | — |
| Report a missing material | — | — | ✅ | ✅ | — |
| Approve material requests | ✅ | — | ✅ | — | — |
| Release approved materials to site | ✅ | — | — | — | ✅ |
| Receive materials at site | ✅ | — | ✅ | ✅ | — |
| Record materials used | ✅ | — | ✅ | ✅ | — |
| Record attendance, equipment hours (with photos) | ✅ | — | — | ✅ | — |
| Submit daily report | ✅ | — | ✅ | ✅ | — |
| Review daily report | ✅ | — | ✅ | — | — |
| See project costs, profit and loss | ✅ | ✅ | — | — | — |
| See material price batches | ✅ | ✅ | — | — | — |
| See stock value and movement costs | ✅ | ✅ | — | — | — |
| Issue invoices, record payments | ✅ | ✅ | — | — | — |
| Void invoices, reverse payments | ✅ | — | — | — | — |
| Audit logs | ✅ | — | — | — | — |

### 🛡️ Admin — owner / office manager
Web · all projects and warehouses

- **People:** invite Engineer, Foreman, Warehouse Staff and Finance accounts; deactivate accounts; add employees and labor rates; assign staff to projects and warehouses.
- **Projects:** create, edit and archive projects and sites; upload, rename and delete documents on the **Documents** page (each project's Documents tab is view and download only); assign workers and site staff from the project's **Labour → Manage workers**; adjust budget; post other expenses; set equipment rates; reverse wrong entries with a reason.
- **Inventory and purchasing:** add warehouses, materials, equipment and vehicles; add suppliers and prices; issue purchase orders; receive deliveries, including at a changed price with a reason; print QR labels.
- **Approvals:** approve or reject any material request; resolve missing-material reports; approve, hand over and take back equipment; approve stock-count shortages.
- **Money:** invoices and payments; void invoices and reverse payments (Admin only); profit and loss; PDF and Excel export.
- **Oversight:** dashboard across all projects; daily reports; audit logs.

### 💼 Finance — financing department
Web · all projects, read-mostly

- **Can:** see dashboard totals and costs for every project (materials, labor, equipment, other expenses, budget), including cost per material; view purchase orders, suppliers and price history; see stock at every location with its value, cost per stock movement and material price batches; export inventory with values; see labor rates and attendance cost; view equipment photos; issue client invoices; record client payments; export profit and loss.
- **Cannot:** create or change purchase orders, suppliers or prices; receive deliveries or move stock; change budgets or rates; void invoices or reverse payments; manage users.

### 🧑‍💼 Engineer — site engineer
Web and mobile · assigned projects only

- **Can:** approve, partly approve or reject the Foreman's material requests; request in-stock materials; report a missing material; receive deliveries at site with a quality note; record materials used; review daily reports (approve or return); record project progress; request equipment; count site stock; download project documents; scan QR codes.
- **Cannot:** approve their own request; request items not in inventory; see wages or rates; see other projects.

### 👷 Foreman — on site daily
Mobile (main) and web · assigned projects only

- **Can:** request in-stock materials; report a missing material; receive deliveries with quantity and quality note; record materials used today; record workers present; record equipment hours with start and after photos; create and submit the daily report; request equipment; count site stock; download project documents; scan QR codes.
- **Cannot:** approve requests; see wages, rates or costs; edit a report after submitting unless the Engineer returns it; see other projects.

### 📦 Warehouse Staff — warehouse keeper
Web · assigned warehouses only

- **Can:** see stock in their warehouse; **receive supplier deliveries** from **Receive deliveries** once Admin has issued the purchase order (count what arrived; the price comes from the purchase order); release approved requests with vehicle, driver and reference; send and receive transfers; count warehouse stock; scan QR codes.
- **Cannot:** add stock without an Admin-issued purchase order; see or change prices; release anything that is not approved; see costs, suppliers or billing; see other warehouses.

---

## How material cost is calculated

Each delivery is a **batch** with its own price. When material is used, the **newest batch is used first**. When it runs out, the next newest is used.

```mermaid
flowchart TB
    subgraph Warehouse["Warehouse stock — cement"]
        B2["Batch 2 · received later<br/>1,000 bags × ₱200"]
        B1["Batch 1 · received first<br/>1,000 bags × ₱100"]
    end
    U1["Use 1,000 bags"] -->|takes Batch 2 first| B2
    U2["Use the next 500 bags"] -->|then Batch 1| B1
    B2 --> C1["Cost ₱200,000"]
    B1 --> C2["Cost ₱50,000"]
```

- The project is charged when material is **used at site**, not when it is requested or released.
- A new purchase never changes costs that were already recorded.
- Admin and Finance can see each material's batches on its material page under **Price batches**.

---

## Test script — one full project, start to finish

Prepare one test account per role. Run the steps in order; each step needs the one before it.

| Role | Test account |
|---|---|
| Admin | admin@nognog.local |
| Finance | finance@nognog.local |
| Engineer | engineer@nognog.local |
| Foreman | foreman@nognog.local |
| Warehouse Staff | warehouse@nognog.local |

Passwords are shared separately, not in this guide.

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    actor Warehouse as Warehouse Staff
    actor Foreman
    actor Engineer
    actor Finance
    Admin->>Admin: Invite accounts, create warehouse, materials, supplier
    Admin->>Warehouse: Issue purchase order
    Warehouse->>Warehouse: Receive delivery into warehouse
    Admin->>Admin: Create project, upload document, assign staff
    Foreman->>Engineer: Request 50 bags cement
    Engineer->>Warehouse: Approve 40 bags
    Warehouse->>Foreman: Release 40 bags with vehicle and driver
    Foreman->>Foreman: Receive 40, use 20, attendance, equipment hours
    Foreman->>Engineer: Submit daily report
    Engineer->>Engineer: Approve or return report
    Admin->>Finance: Project cost ready
    Finance->>Finance: Invoice and partial payment
```

| # | Account | What to do | What to check |
|---|---|---|---|
| 1 | Admin | Invite Engineer, Foreman, Warehouse Staff and Finance. Create a warehouse and assign Warehouse Staff to it. | Each person gets an email and can set a password. |
| 2 | Admin | Add materials (e.g. Rebars and Cemento, pcs), one equipment item and one vehicle. Add a supplier with only its name, address and contact number (e.g. VIC Hardware). | They appear in Inventory and Suppliers. The supplier gets a code automatically. |
| 3 | Admin | In **Suppliers & purchases**, add a purchase: VIC Hardware, deliver to the warehouse, Rebars 1,000 × ₱100 and Cemento 2,500 × ₱250. | Each line shows its total and the order total is ₱725,000. The supplier page now shows those prices as the latest. |
| 3a | Finance | Open the purchase and **Record payment**: Check, Metrobank, check no. 123456, ₱725,000, dated Dec 15, 2026. | The purchase shows Fully paid; the check shows Postdated. The supplier's **Supplier history** lists the check. Finance cannot void it; Admin can. |
| 4 | Warehouse Staff | Open **Receive deliveries**, receive the purchase order with a delivery receipt number. | Stock appears in Inventory. No price is shown to Warehouse Staff. |
| 5 | Admin | Create a project. In its **Sites** tab, add a site by choosing only the Engineer and Foreman (the site takes the project's name and address). On the **Documents** page, upload a file for that project with a name you type. In **Labour → Manage workers**, add two employees with labor rates. | The site shows its Engineer and Foreman, and they can be changed with **Save staff**. The project's Documents tab lists the file with View and Download only. The Labour tab shows the labour distribution and worker list. |
| 6 | Foreman (phone) | Request 50 bags of cement. Try to find an item that is not in stock and report it as missing. | Only in-stock items can be requested. Admin sees the missing-item report. |
| 7 | Engineer (phone) | Approve 40 of the 50 bags. | The Foreman cannot approve. |
| 8 | Warehouse Staff | Release the 40 bags with vehicle, driver and delivery reference. | The request shows as released. |
| 9 | Foreman (phone) | Receive 40 bags with a quality note. Record 20 bags used. Record attendance and equipment hours with two photos. | Site stock shows 20 left. |
| 10 | Foreman, then Engineer | Foreman creates and submits today's daily report. Engineer approves or returns it. | The report shows the day's material use, workers and equipment. |
| 11 | Admin or Finance | Open the project's **Finance** tab. | Only the 20 bags used are charged, plus labor and equipment. |
| 12 | Finance | Issue an invoice and record a partial payment. | Finance cannot void it; Admin can. |
| 13 | Admin | Receive 10 bags at ₱100, then 10 bags at ₱200. Release and use 10 at the site. | The use costs ₱2,000 (the newer batch). The material page shows the ₱100 batch as used next. |
| 14 | Admin | Add a new purchase from the same supplier with a different price (e.g. Cemento at ₱260). | The new price becomes the supplier's latest; yesterday's project cost does not change. Audit logs show every step. |

Also try each account on a project or warehouse it is **not** assigned to: it should not appear.
