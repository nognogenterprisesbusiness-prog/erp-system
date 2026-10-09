import type { AppRole } from "@/types/database";

export type ManualFigure = {
  src: string; width: number; height: number; alt: string;
  title?: string;
  marks: { x: number; y: number; width: number; height: number; label: string }[];
};
export type ManualGuide = {
  id: string; title: string; description: string; href: string;
  roles: readonly AppRole[]; before: string;
  steps: { title: string; detail: string }[];
  result: string; tips: string[]; figure?: ManualFigure;
};
const everyone: readonly AppRole[] = ["admin", "finance", "engineer", "foreman", "warehouse_staff"];
const siteTeam: readonly AppRole[] = ["admin", "engineer", "foreman"];
const inventoryTeam: readonly AppRole[] = ["admin", "warehouse_staff"];
const financeTeam: readonly AppRole[] = ["admin", "finance"];

export const roleResponsibilities: Record<AppRole, { summary: string; tasks: string[]; boundary: string }> = {
  admin: {
    summary: "Set up the company and oversee approvals, stock and finances.",
    tasks: ["Maintain projects, sites, warehouses, materials, suppliers, employees and assets.", "Create staff accounts and assign site or warehouse access.", "Approve purchases above ₱50,000 as the owner; oversee requests and site purchases.", "Review reports, billing, costs and audit history; make reasoned corrections to posted records."],
    boundary: "Posted history is retained. Use the supported correction or reversal with a reason instead of deleting a completed transaction.",
  },
  finance: {
    summary: "Check receipts, payments and project costs.",
    tasks: ["Review supplier purchases and price history; record supplier payments.", "Approve or reject Engineer site purchases and record reimbursements.", "Manage client billing and collections; review attendance costs and financial reports."],
    boundary: "Finance does not approve the owner gate above ₱50,000, dispatch stock, record site use or approve material requests. Admin handles supported payment reversals.",
  },
  engineer: {
    summary: "Review assigned site work and arrange materials.",
    tasks: ["Check assigned sites, stock, material plans and project documents.", "Request materials, equipment or vehicles and report unavailable materials.", "Independently review material requests and daily reports; inspect site deliveries and record actual material use.", "Submit hardware-store purchases with receipt photos for Admin or Finance approval."],
    boundary: "An Engineer cannot approve their own material request or approve their own site purchase. Admin maintains the material catalog and supplier purchase orders.",
  },
  foreman: {
    summary: "Record what happens at the assigned site each day.",
    tasks: ["Request materials, equipment or vehicles; report unavailable materials.", "Check delivered quantities and condition, then record actual material use.", "Record attendance, equipment usage with evidence and daily progress reports.", "View assigned site stock and project documents."],
    boundary: "A Foreman does not approve material requests, manage supplier payments or submit Engineer hardware-store purchases.",
  },
  warehouse_staff: {
    summary: "Receive and release stock for assigned warehouses.",
    tasks: ["Check warehouse balances, reservations and stock history.", "Inspect supplier deliveries and receive accepted quantities.", "Release approved material requests with transport details; handle permitted transfers and check asset locations."],
    boundary: "Warehouse staff cannot authorize project requests, approve owner purchases or manage financial payments. Warehouse and project assignments still limit access.",
  },
};

export const manualGuides: readonly ManualGuide[] = [
  {
    id: "start", title: "Start here: navigation and daily work", description: "Find the right screen and understand a successful save.", href: "/dashboard", roles: everyone,
    before: "Sign in with your own account. Admin must activate it and assign the sites or warehouses you work with.",
    steps: [
      { title: "Choose your work area", detail: "Use Main work in the sidebar. Expand Project tools, Inventory tools, Purchasing tools or People when needed. Only permitted pages and actions appear." },
      { title: "Find a record", detail: "Use the header project search, or the search and filters above a page's table. Press Enter to search. Use the page controls below the table to reach older records." },
      { title: "Open details before acting", detail: "Select the record number or name. Check the site, warehouse, quantity and current status. A pencil opens the action or history for that row; its accessible label describes the action." },
      { title: "Wait for confirmation", detail: "Complete the required fields and select Save or the named action. Wait for success before leaving. The screen updates after the server confirms the transaction; a notification alone is not proof of stock posting." },
    ],
    result: "You can find the record and see its confirmed status without using another staff member's account.",
    tips: ["Keep the form open if a save fails. Check the message and retry the same submission after correcting the cause.", "Account & help contains My profile, Notifications and this User manual."],
  },
  {
    id: "access", title: "Admin setup and staff access", description: "Set up records and assignments before staff start work.", href: "/users", roles: ["admin"],
    before: "Have the project, site, warehouse and staff details ready. Give each person their own account.",
    steps: [
      { title: "Create the basic records", detail: "Add the project and its sites, warehouses, units, material categories and catalog materials. Add suppliers and employees as needed. Short examples inside inputs show the expected format; use your own actual details." },
      { title: "Give staff the correct role", detail: "Open User access and create or manage Engineer, Foreman, Warehouse staff and Finance accounts. Check that the account is active." },
      { title: "Assign site personnel", detail: "Open Projects → project → Sites. Set the site's Engineer and Foreman, or maintain the permitted project assignments. A role by itself does not grant access to every site." },
      { title: "Assign warehouse access", detail: "Open Warehouses and maintain the relevant staff and project links. Confirm the source warehouse is available to the site's request flow." },
      { title: "Verify as the staff member", detail: "Have staff sign in and open the assigned project. If a site is missing, check assignments and active status before changing stock or creating duplicate records." },
    ],
    result: "Each staff member sees the work and locations they are authorized to use.",
    tips: ["Use Audit history to investigate who changed a record and when.", "Never share Admin credentials to work around denied access."],
  },
  {
    id: "projects", title: "Projects, sites and initial documents", description: "Keep project information and work history together.", href: "/projects", roles: everyone,
    before: "Admin creates the project and site. Other staff need the relevant assignment.",
    steps: [
      { title: "Open the project", detail: "Review Overview, Sites, Labour, Materials, Finance and Documents where your account has access. Check that you are working on the correct active site." },
      { title: "Prepare the material plan", detail: "Admin maintains planned materials and quantities. Compare the plan with warehouse availability and actual site usage before ordering more." },
      { title: "Attach initial documents", detail: "Admin uploads project files on the Documents page and chooses the project and document category. Assigned site staff can view or download permitted files from the project Documents tab." },
      { title: "Monitor actual progress and expenses", detail: "Use dated daily reports and the project's cost sections. Review posted material use, labour, equipment and other expenses. A request, purchase or delivery does not by itself count as material use." },
    ],
    result: "Project staff share the same assigned site history, documents and actual work records.",
    tips: ["An initial budget is not required for project creation. Contract information and actual expenses serve different purposes.", "For a missing project or file, check assignment and filters before uploading a second copy."],
  },
  {
    id: "inventory", title: "Inventory: materials, stock and history", description: "Understand total stock, reservations and each location.", href: "/inventory", roles: everyone,
    before: "A catalog material describes the item and unit. Its stock balance describes how much is held at a specific warehouse or site.",
    steps: [
      { title: "Check all accessible locations", detail: "Inventory opens with All locations. Quantities are combined across locations your account can read. Select a warehouse or site to see that location only. Check Materials, Equipment or Vehicles for the correct item type." },
      { title: "Read the quantities", detail: "On hand is stock physically recorded there. Reserved is approved stock awaiting release. Available is what remains after reservations. A zero-stock catalog item can still appear so Admin can source it." },
      { title: "Maintain catalog items", detail: "Admin selects Add material in Inventory and enters a unique code, name, category, unit and minimum stock level. Adding a material creates its catalog entry; it does not create stock." },
      { title: "Trace a quantity", detail: "Choose the location and open History or stock details. Follow the purchase receipt, supplier, price batch, dispatch, site receipt and usage references instead of relying only on the total." },
      { title: "Record the correct movement", detail: "Admin records authorized non-purchase stock-in/out. Assigned Warehouse staff receives supplier purchases and releases approved requests or permitted transfers. Supplier deliveries use inspection and receipt. Assigned site staff records actual use from site stock." },
    ],
    result: "You can explain both the total and where the stock is held. No extra stock is created by a payment or by adding a catalog item.",
    tips: ["Example: if Warehouse 1 holds 1,000 bags, approving 100 leaves on hand at 1,000 and available at 900. Dispatching those 100 reduces warehouse on hand to 900. Site stock increases only when receipt is recorded.", "The same catalog material can come from different suppliers. Receipt batches preserve their supplier and price history."],
    figure: { src: "/manual/material-form.webp", width: 730, height: 270, alt: "Empty Add material fields showing catalog identity, category and unit, and minimum stock.", marks: [
      { x: 0.5, y: 2, width: 99, height: 28, label: "Enter a unique material code and clear name. The unit distinguishes materials sold in different measures." },
      { x: 0.5, y: 36, width: 99, height: 28, label: "Select the category and base unit before saving; these describe the catalog item." },
      { x: 0.5, y: 70, width: 49, height: 28, label: "Set the minimum stock alert level. This is not an opening stock quantity." },
    ] },
  },
  {
    id: "requests", title: "Request → approve → dispatch → receive → use", description: "The warehouse-to-site material workflow.", href: "/requests", roles: ["admin", "engineer", "foreman", "warehouse_staff"],
    before: "The project/site must be active, staff assigned, and a source warehouse available. The material must already exist in the catalog.",
    steps: [
      { title: "Site staff request materials", detail: "In Requests → Materials, choose the assigned project, site and source warehouse. Select existing materials, enter needed quantities, required date and purpose, then submit." },
      { title: "Engineer or Admin reviews", detail: "An authorized Engineer independently reviews the request, or Admin decides it. Approve full or permitted partial quantities, or reject with a reason. Engineers cannot approve their own requests. Approval reserves available warehouse stock." },
      { title: "Warehouse releases stock", detail: "Admin or assigned Warehouse staff opens the approved release queue and records the actual quantity, vehicle, driver and delivery reference. Partial releases leave the remainder outstanding. Dispatch reduces source stock." },
      { title: "The site checker inspects delivery", detail: "An authorized site receiver checks what arrived against the request and transport record. Enter the actual accepted quantity and condition; add a quality note where required. Report missing or damaged quantities instead of confirming goods that did not arrive." },
      { title: "Record actual use separately", detail: "From the project's material or mobile site inventory actions, record the date, quantity actually used and work reference. Site use reduces site stock and posts the project's material cost. Remaining delivered stock stays at the site." },
    ],
    result: "Every quantity is traceable from the source warehouse to delivery, site stock and actual use, with actors and transport references.",
    tips: ["If 300 bags arrive and only 100 are used, record receipt of 300 and use of 100. The other 200 remain in site inventory.", "Approval is not delivery. If stock has not appeared at the site, check whether it was dispatched and received, and whether you selected the correct location."],
  },
  {
    id: "sourcing", title: "No stock or missing catalog material", description: "Report the shortage inside Requests and let Admin source it.", href: "/requests?view=missing", roles: siteTeam,
    before: "First check the material name, unit, source warehouse, search and stock availability.",
    steps: [
      { title: "Report the shortage", detail: "Open Requests and its Out-of-stock reports section. Enter the assigned project/site, warehouse, material, unit, quantity, needed date and reason. Do not invent a substitute catalog item." },
      { title: "Admin reviews and sources", detail: "Admin checks whether the material exists. If needed, Admin adds it to the catalog, records the sourcing decision and links a supplier purchase for the warehouse." },
      { title: "Receive the warehouse purchase", detail: "Follow supplier inspection and receipt. A purchase approval alone does not make warehouse stock available." },
      { title: "Continue with a site request", detail: "When stock is available, submit or continue the material request for Engineer/Admin review, warehouse dispatch and site receipt. Close the report with the actual resolution." },
    ],
    result: "The shortage has a sourcing history and follows the same controlled warehouse-to-site delivery process.",
    tips: ["The former separate Missing materials screen is now part of Requests. Past reports remain available.", "Zero stock means source or replenish; it does not authorize staff to add uncatalogued materials or edit balances."],
  },
  {
    id: "purchases", title: "Supplier purchasing: the seven stages", description: "Requests, owner approval, quotations, orders, inspection, receipt and payment.", href: "/purchase-orders", roles: financeTeam,
    before: "Admin maintains suppliers, catalog materials and the destination warehouse. Finance reviews purchasing and handles permitted payments.",
    steps: [
      { title: "Material request, when needed", detail: "Link an approved project material request when sourcing for a site. Admin can also buy warehouse stock without a project request." },
      { title: "Purchase approval", detail: "Supplier purchases up to and including ₱50,000 issue automatically. Purchases above ₱50,000 wait for Admin owner approval before issuance and supplier-price posting. Finance cannot give this owner approval. This is separate from Engineer approval of a site material request." },
      { title: "Supplier quotation, when used", detail: "Admin can save and compare formal supplier quotations, then link the chosen quotation. Quotation supplier, materials, quantities and prices must match the purchase. A quotation is optional for a direct purchase from a known supplier." },
      { title: "Create the purchase order", detail: "Admin selects Add supplier items, chooses the supplier and delivery warehouse, and adds each material with its quantity and unit price. Check the calculated line totals and order total before submitting. Add an expected delivery date or note when useful." },
      { title: "Inspect the supplier delivery", detail: "Admin or assigned Warehouse staff records the delivery reference, delivered quantities, accepted quantities and condition. Rejected quantities do not become usable stock." },
      { title: "Receive accepted inventory", detail: "Use Add accepted stock for the saved inspection. This posts the accepted receipt into the destination warehouse at the purchase price. Partial deliveries leave the remaining quantity outstanding." },
      { title: "Record supplier payment", detail: "Admin or Finance uses the pencil beside Supplier Payment to record cash or check details against the purchase's remaining balance. Fully paid rows open payment history. Payments apply to the purchase, not separately to every displayed item line." },
    ],
    result: "The purchase has a delivery/stock history and a separate payment history. Receipt increases stock once; payment settles the supplier balance.",
    tips: ["Paid does not mean received. If payment is complete but inventory is missing, check the saved inspection, posted receipt and destination warehouse. Never record another receipt just to make the paid label change.", "A later supplier price does not rewrite earlier receipt or project cost snapshots. Actual use draws from the newest available receipt price batches under the system's costing rule.", "Request and quotation stages can be skipped for direct warehouse purchasing. Delivery inspection and inventory receipt remain required."],
    figure: { src: "/manual/purchase-items.webp", width: 700, height: 227, alt: "Empty purchase Items section showing Add item, material, quantity, unit price and line total aligned in a row.", marks: [
      { x: 84, y: 0.5, width: 15.5, height: 17, label: "Add item creates another line for this supplier purchase." },
      { x: 1, y: 33, width: 35, height: 34, label: "Choose an existing catalog material. Do not type a second name for the same item." },
      { x: 36.5, y: 33, width: 39.5, height: 34, label: "Enter a positive quantity and the price for one unit. Line total is quantity × unit price." },
    ] },
  },
  {
    id: "deliveries", title: "Warehouse: inspect and receive supplier deliveries", description: "Turn accepted deliveries into warehouse stock.", href: "/purchase-orders/receive", roles: inventoryTeam,
    before: "The purchase must be issued and addressed to a warehouse you are allowed to operate.",
    steps: [
      { title: "Find the expected delivery", detail: "Open Receive deliveries and search for the purchase. Check supplier, warehouse and outstanding quantities against the actual delivery." },
      { title: "Save the inspection", detail: "Record the delivery reference and quantities delivered and accepted. Enter condition and quality notes. Do not accept quantities that are missing, damaged or outside the remaining purchase quantity." },
      { title: "Post the accepted receipt", detail: "Select Add accepted stock for that inspection. Wait for confirmation, then check Inventory at the destination warehouse and the receipt history." },
      { title: "Handle the remainder", detail: "For a partial delivery, receive only what was accepted and record later deliveries separately. Ask Admin to resolve an incorrect posted receipt through the supported correction flow." },
    ],
    result: "Accepted quantities increase the warehouse balance once, with supplier, receipt and price-batch references.",
    tips: ["Saving inspection alone does not finish stock receipt; check that accepted stock was posted.", "Reusing a delivery reference for a different posting is not a way to correct an earlier receipt."],
  },
  {
    id: "site-purchases", title: "Engineer: buy at a hardware store", description: "Submit a receipt for approval and add bought materials to site stock.", href: "/site-purchases", roles: ["admin", "finance", "engineer"],
    before: "The Engineer needs an assigned active site, existing catalog materials and a readable photo of the actual receipt.",
    steps: [
      { title: "Choose the site and hardware store", detail: "In Site purchases on web, or Buy at Hardware Store on mobile, select the assigned project/site and store. Use the permitted new-store fields if the supplier is not listed." },
      { title: "Enter the receipt", detail: "Enter receipt number and date, then materials, quantities and unit prices. Check each line and the receipt total. The date must not be in the future under Philippine business time." },
      { title: "Identify who paid", detail: "Choose Company cash or Own money, add an optional note and attach the receipt photo. Submit for approval and wait for confirmation." },
      { title: "Admin or Finance checks the purchase", detail: "The reviewer verifies the receipt, site, items and price, then approves or rejects with the required reason. Approval adds the bought quantities directly to that site's stock once." },
      { title: "Reimburse or use the stock", detail: "For Own money, Admin or Finance records reimbursement after paying the Engineer back. Site staff separately records actual material use; reimbursement does not add stock again." },
    ],
    result: "The approved purchase appears in the selected site's inventory at the receipt price. It is not a warehouse receipt.",
    tips: ["All Engineer site purchases follow receipt review. The supplier purchase order's ₱50,000 automatic-issue rule does not bypass this approval.", "If approved stock seems missing, open that specific site in Inventory and check the purchase receipt history before submitting again.", "Use a clear supported receipt photo. Mobile accepts an upload under 3 MB; the app prepares camera/gallery images before submission."],
  },
  {
    id: "assets", title: "Equipment, vehicles and reusable custody", description: "Request, hand over, monitor and return assets.", href: "/inventory?type=equipment", roles: ["admin", "engineer", "foreman", "warehouse_staff"],
    before: "Admin registers the asset. Reusable assets are tracked individually, separately from consumable quantities.",
    steps: [
      { title: "Choose the asset type", detail: "Use Equipment or Vehicles in Inventory and Requests. Admin enters a simple free-text type in the asset form; separate equipment category and vehicle type setup pages are not needed." },
      { title: "Request and approve", detail: "Assigned site staff submits the asset request with dates and purpose. Admin reviews availability and authorizes the request." },
      { title: "Record custody", detail: "Admin records handover and destination on the approved request. Check the person, asset and site so the system shows who holds it." },
      { title: "Record actual equipment use", detail: "The authorized site operator records equipment start/end time and required before/after photos. Use the configured rate and actual hours; do not also enter the same cost as an unrelated expense." },
      { title: "Return the asset", detail: "Admin records its return and condition. Site staff reports damage or unavailable equipment so it is not allocated as available for another request." },
    ],
    result: "Custody and usage are recorded without consuming the asset like cement or other materials.",
    tips: ["Asset handover does not reduce a consumable material balance.", "QR tools identify a record; they do not grant permission to operate it."],
  },
  {
    id: "reports", title: "Attendance and daily site reports", description: "Record actual people, hours and progress once.", href: "/reports/daily", roles: siteTeam,
    before: "The project/site must be assigned. Admin maintains employees and applicable rate information.",
    steps: [
      { title: "Record attendance", detail: "Admin or the assigned Foreman opens the project's attendance and selects the work date and workers. Enter actual hours for hourly work or the supported full/half-day entry for daily work. Engineers can review permitted site attendance." },
      { title: "Record actual transactions", detail: "Record material use and equipment use in their own actions. These create the stock and cost records that can be reviewed alongside the report." },
      { title: "Prepare the daily report", detail: "Admin or assigned site staff selects the project, site and date, records work, accomplishments, issues and progress, and adds supported evidence. Submit when complete." },
      { title: "Review independently", detail: "An authorized independent Engineer or Admin reviews the report. Check actual progress and linked entries before approving or returning it through the available action." },
    ],
    result: "The site has dated work and attendance history, with approved progress and costs from actual postings.",
    tips: ["A report that describes material use does not replace the actual consumption transaction.", "Finance reviews attendance costs on Attendance; this does not grant permission to change site attendance or stock."],
  },
  {
    id: "finance", title: "Client billing, payments and project costs", description: "Separate money received from clients from money paid to suppliers.", href: "/billing", roles: financeTeam,
    before: "Check the project's contract information and actual posted expenses before issuing bills or recording collections.",
    steps: [
      { title: "Issue client billing", detail: "In Billing & payments, choose the project and record the supported invoice details and amount. Review the contract's remaining billable value before issuing." },
      { title: "Record the client's payment", detail: "Open the invoice and record the actual collection, date and payment reference. Partial collections reduce the outstanding amount without marking the entire invoice paid." },
      { title: "Review money going out", detail: "Use Purchasing for supplier payments and Site purchases for Engineer reimbursements. These settle different obligations and must not be entered as client collections." },
      { title: "Review project costing", detail: "Check Materials, Labour, equipment usage and other project expenses. Material cost comes from actual consumption; the purchase's payment and site receipt do not post the same cost again." },
      { title: "Check attendance and other expenses", detail: "Admin and Finance open People → Attendance to review attendance costs. Admin records additional project expenses in the project's Finance/cost section with the date, amount, category and reference. Do not enter material, attendance or equipment costs again as another expense." },
      { title: "Export or correct", detail: "Use available report export actions with the right filters. For an incorrect posted financial entry, Admin uses the supported audited reversal with a reason, then records the correct entry." },
    ],
    result: "Client receivables, supplier balances, reimbursements and actual project costs remain distinguishable and reconcilable.",
    tips: ["Client billing supports the agreed sales/client payment monitoring and billings-per-project scope.", "Finance can review attendance and inventory valuation where permitted, but cannot change stock to make a financial total match."],
  },
  {
    id: "corrections", title: "Admin: correct a posted stock transaction", description: "Preserve the original history and reconcile the affected records.", href: "/inventory", roles: ["admin"],
    before: "Identify the original receipt or material use, its location, quantities and downstream use. Have the correction reason ready.",
    steps: [
      { title: "Open the original record", detail: "Use inventory history, the request delivery record or purchase receipt history. Check whether the issue is a wrong location/filter or an actual incorrect posting." },
      { title: "Use the supported correction", detail: "Choose the available Admin correction or reversal action and enter a specific reason. The system keeps the original entry and creates linked compensating records." },
      { title: "Respect dependent usage", detail: "A purchase receipt whose price batch has already been used cannot simply be replaced with unrelated stock. Resolve downstream history through supported actions before trying to reverse it." },
      { title: "Check the result", detail: "Verify balances, reopened request or purchase quantities, price batches and project costs. Record the corrected replacement where appropriate and check Audit history." },
    ],
    result: "The original actor and posting stay visible, and linked stock, request, purchase and cost records reconcile.",
    tips: ["Do not delete history or edit database balances manually to hide a mistake.", "If the action is refused, preserve the error/reference and inspect the dependent transaction instead of creating a duplicate receipt."],
  },
  {
    id: "mobile", title: "Mobile: assigned site work and updates", description: "Use the companion app for Engineer and Foreman work.", href: "/projects", roles: ["engineer", "foreman"],
    before: "Use the configured production app, your own active account and an internet connection. Admin, Finance and Warehouse staff use the web application.",
    steps: [
      { title: "Open the assigned project and site", detail: "Select a project and then an allowed site. Check the selected site before viewing inventory, requesting materials or recording work. Different sites have different balances." },
      { title: "Complete your role's work", detail: "Engineer and Foreman use permitted requests, site delivery checking, material use and reports. Foreman records attendance and permitted equipment evidence; Engineer performs independent reviews and hardware-store purchase submissions." },
      { title: "Confirm the save", detail: "Keep the app open until the server confirms the action. If the connection fails, retry the existing submission rather than creating another purchase or use entry. Cached records are not proof of an offline posting." },
      { title: "Follow an update prompt", detail: "When a released version is required for compatibility, follow the app's Update action and install the supported build, then reopen and sign in. Compatible versions can continue without a mandatory update." },
    ],
    result: "Confirmed mobile actions use the same permissions and posting rules as web, and appear at the correct site.",
    tips: ["A web deployment does not install a new native app build on a phone.", "If the app reports a failure, give support the action, date/time and error reference. Do not send your password."],
  },
  {
    id: "roles", title: "Roles and access", description: "Know who requests, approves, receives, records and pays.", href: "/dashboard", roles: everyone,
    before: "Your account role and active site or warehouse assignments work together. The manual shows the tasks relevant to your account.",
    steps: everyone.map((role) => ({ title: ({ admin: "Admin", finance: "Finance", engineer: "Engineer", foreman: "Foreman", warehouse_staff: "Warehouse staff" })[role], detail: [roleResponsibilities[role].summary, ...roleResponsibilities[role].tasks, roleResponsibilities[role].boundary].join(" ") })),
    result: "You know which colleague handles the next stage without sharing accounts or bypassing approval.",
    tips: ["If the expected button is missing, check your role, assignment and the record's status with Admin.", "The web app supports all five roles. The mobile companion is for Engineer and Foreman accounts."],
  },
  {
    id: "warehouses", title: "Warehouses and stock locations", description: "Know where stock is stored and where it must be delivered.", href: "/warehouses", roles: everyone,
    before: "Admin sets up warehouses and project links. Assigned Warehouse staff operates only the locations they are authorized to use.",
    steps: [
      { title: "Create a clear warehouse identity", detail: "Admin opens Warehouses → Add warehouse. Enter a unique code such as WH-CEBU-01 and a clear name. Fill in its location and contact fields, then save." },
      { title: "Link staff and projects", detail: "Admin opens the warehouse detail to maintain its staff and project links. Confirm the required project can request from this warehouse before staff begins a material request." },
      { title: "Select the correct destination", detail: "When purchasing for a warehouse, choose its actual delivery destination. Buying directly for a project site uses the Engineer site-purchase workflow instead." },
      { title: "Check a location's balance", detail: "In Inventory, choose All locations for your permitted total, then select a particular warehouse or site to see its own balance and stock history." },
    ],
    result: "The stock balance identifies the actual warehouse or site, and movements show where quantities came from and went.",
    tips: ["A project site and a warehouse are different locations. An approved site purchase will not appear as warehouse stock.", "Changing the selected location changes the view; it does not transfer stock."],
  },
  {
    id: "people", title: "Employees and attendance setup", description: "Maintain the workers used in attendance and project labour records.", href: "/employees", roles: everyone,
    before: "An employee record represents a worker. A staff login is a separate user account with a role and assignments.",
    steps: [
      { title: "Register the employee", detail: "Admin opens Employees → Add employee. Enter a unique code, category/trade and name. Complete contact, employment and hire-date fields. Use the Categories button on Employees when a trade needs setup." },
      { title: "Keep private details private", detail: "Personal contact details and wage information are shown only where your role permits. An optional linked user account does not automatically grant project access." },
      { title: "Prepare the project's workforce", detail: "Admin maintains worker assignments and the applicable labour costing basis/rates before the Foreman records attendance. Rates are historical snapshots when attendance posts." },
      { title: "Record actual work", detail: "Admin or the assigned Foreman records supported daily full/half-day attendance or actual hourly work. Finance reviews attendance costs; Engineer reviews permitted site attendance." },
    ],
    result: "Attendance refers to the correct worker and actual work date, with the configured cost basis.",
    tips: ["Employees do not need a login merely to be included in attendance.", "Do not create a second employee to correct an attendance entry; use the supported Admin correction action."],
  },
  {
    id: "suppliers", title: "Suppliers and material prices", description: "Maintain hardware-store details and compare current material prices.", href: "/suppliers", roles: financeTeam,
    before: "Admin maintains suppliers. Finance can review their purchasing, prices and payment history.",
    steps: [
      { title: "Add the supplier", detail: "Admin opens Suppliers → Add supplier. Enter the store name, contact number and address. These are the main fields; More details is optional. Supplier categories are not required." },
      { title: "Maintain the supplier's materials", detail: "Open the supplier and review its catalog materials, units and dated prices. Use existing catalog items so purchases from different stores still refer to the same material." },
      { title: "Compare like-for-like prices", detail: "Use Material price comparison under Suppliers. Filter the same material and unit, supplier, availability and dates before comparing offers. A saved formal quotation can be linked to a purchase when used." },
      { title: "Keep historical prices intact", detail: "New supplier purchases update the latest supplier price when issued, including after required owner approval. Posted receipts and past project cost snapshots retain their original prices." },
    ],
    result: "The store's details and price history are available without duplicating catalog materials or changing past costs.",
    tips: ["A price comparison does not create stock. Create the purchase, inspect delivery and post accepted receipt.", "Do not rename a supplier or material to hide an incorrect purchase; retain the original history and use supported corrections."],
  },
  {
    id: "account", title: "Your profile, notifications and common problems", description: "Resolve common issues without duplicating records.", href: "/notifications", roles: everyone,
    before: "Use your own account and keep the selected project/site and transaction reference available when investigating an issue.",
    steps: [
      { title: "Update your profile", detail: "Open My profile to change permitted personal details or your photo. Email changes require confirmation. Sign out before another staff member uses the device." },
      { title: "Review notifications", detail: "Open the bell or Notifications page. Read the date and time in Philippine time, open the linked record and check its current status. Mark reviewed alerts read." },
      { title: "No records or denied action", detail: "Clear search and status filters, verify the location and active project, and ask Admin to check your account and assignment. A hidden button can be a role restriction, not a broken page." },
      { title: "Paid but no stock", detail: "Check the delivery inspection and posted receipt, then view its actual warehouse or site. For Engineer site purchases, check approval and the selected site. Payment alone does not receive inventory." },
      { title: "A save failed", detail: "Check required fields, positive quantities, remaining balance and the receipt date. Keep the form and retry the same submission after resolving the cause. Give support the error reference and time if it continues." },
    ],
    result: "Staff can investigate common causes and provide useful references without sharing credentials or creating duplicate postings.",
    tips: ["For a city or municipality, choose a search result. Once chosen, use the clear/remove control before selecting another city.", "Password recovery depends on the environment's email configuration. Ask the authorized account administrator if recovery is unavailable.", "If stock may already have posted, inspect history before starting a new transaction."],
    figure: { src: "/manual/city-selection.webp", width: 365, height: 78, alt: "City field with Cebu City selected and a remove selection button at the right.", marks: [
      { x: 1, y: 28, width: 84, height: 64, label: "The selected city stays locked so its saved location details remain consistent." },
      { x: 86, y: 28, width: 13, height: 64, label: "Select the × control to remove the city, then search and choose a different result." },
    ] },
  },
];

export function getManualGuides(roles: readonly AppRole[]) {
  return manualGuides.filter((guide) => guide.roles.some((role) => roles.includes(role)));
}
