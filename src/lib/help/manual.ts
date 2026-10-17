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
    tasks: ["Review supplier purchases and price history; record supplier payments.", "Review Engineer site purchases and record reimbursements. Purchases above ₱50,000 require Admin approval.", "Manage client billing and collections; review attendance costs and financial reports."],
    boundary: "Finance does not approve the owner gate above ₱50,000, dispatch stock, record site use or approve material requests. Admin handles supported payment reversals.",
  },
  engineer: {
    summary: "Review assigned site work and arrange materials.",
    tasks: ["Check assigned sites, stock, material plans and project documents.", "Request materials, equipment or vehicles and report unavailable materials.", "Independently review material requests and daily reports; inspect site deliveries and record actual material use.", "Submit hardware-store purchases with receipt photos for Admin or Finance approval."],
    boundary: "An Engineer cannot approve their own material request or inventory purchase. Receipt expenses and diesel receipts up to ₱50,000 post automatically; higher amounts wait for Admin approval. Admin maintains the material catalog and supplier purchase orders.",
  },
  foreman: {
    summary: "Record what happens at the assigned site each day.",
    tasks: ["Request materials, equipment or vehicles; report unavailable materials.", "Check delivered quantities and condition, then record actual material use.", "Record attendance, equipment usage with evidence and daily progress reports.", "View assigned site stock and project documents."],
    boundary: "A Foreman does not approve material requests, manage supplier payments or submit Engineer hardware-store purchases.",
  },
  warehouse_staff: {
    summary: "Receive and release stock for assigned warehouses.",
    tasks: ["Check warehouse balances, reservations and stock history.", "Inspect supplier deliveries and receive accepted quantities.", "Record verified stock-in at an assigned warehouse; release approved requests with transport details, or dispatch a reasoned delivery to a linked project site. Check asset locations."],
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
      { title: "Create the basic records", detail: "Add the project and its sites, warehouses and catalog materials. Choose an existing unit when adding a material; material categories are no longer part of setup. Add suppliers and employees as needed. Short examples inside inputs show the expected format; use your own actual details." },
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
    before: "Admin creates the project; its first site, stock location and QR record are created automatically. Other staff need the relevant assignment.",
    steps: [
      { title: "Open the project", detail: "Review Overview, Sites, Labour, Materials, Finance and Documents where your account has access. Check that you are working on the correct active site." },
      { title: "Assign the site staff", detail: "Admin opens Sites and chooses the Engineer and Foreman, then selects Save staff. The site uses the project name and address, so there are no separate site-name or site-address inputs." },
      { title: "Prepare the material plan", detail: "Admin or an Engineer with review authority for the site opens Material plan and selects Add material plan. Record existing catalog materials, planned quantities, source warehouse and needed date. Foremen can read their site's plan. Compare the plan with warehouse availability and actual site usage before ordering more; a plan does not reserve or deduct stock." },
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
      { title: "Choose warehouse or site stock", detail: "Inventory opens with All warehouses when your account can read warehouse stock. Site-only staff starts with All sites. Open Stock location to search by warehouse, site, project or address. Warehouses and project sites are grouped separately. Choose a warehouse, a project site, All sites or the combined All locations overview. Warehouse totals exclude materials already held at sites. Check Materials, Equipment or Vehicles for the correct item type. SKU catalog lists the same materials by their unique codes; it is not a separate stock balance." },
      { title: "Read the quantities", detail: "On hand is stock physically recorded at the selected location. Warehouse stock or Site stock totals only that group of permitted locations. Reserved is approved stock awaiting release. Available is what remains after reservations. Choose a specific source warehouse before approving or dispatching; a combined total cannot supply a delivery itself. The web catalog includes zero-stock materials for sourcing. Mobile Site Inventory shows only materials with available quantity greater than zero; use History to inspect earlier receipts or use." },
      { title: "Maintain catalog items", detail: "Admin selects Add material in Inventory and enters a unique code, clear name, unit and minimum stock level. Adding a material creates its catalog entry; it does not create stock." },
      { title: "Trace a quantity", detail: "Choose the location and open History or stock details. Mobile History shows In/Out, quantity, date, reference and known warehouse/supplier sources. Request links open the delivery; purchase links open site purchases. Older stock with no supplier evidence is labelled Opening stock or Source unavailable. Prices remain restricted to authorized roles." },
      { title: "Record the correct movement", detail: "Admin records authorized non-purchase stock-in/out. Assigned Warehouse Staff can record valued stock-in at their warehouse, receive supplier purchases, release approved requests and dispatch direct deliveries to linked project sites with a reason. Site checkers receive direct deliveries through Inventory → Receive warehouse deliveries on mobile or Transfers on web; partial receipts leave the remainder outstanding. Request-bound deliveries still require the request inspection flow. Supplier deliveries use inspection and receipt. Assigned site staff records actual use from site stock." },
    ],
    result: "You can explain both the total and where the stock is held. No extra stock is created by a payment or by adding a catalog item.",
    tips: ["Example: if Warehouse 1 holds 1,000 bags, approving 100 leaves on hand at 1,000 and available at 900. Dispatching those 100 reduces warehouse on hand to 900. Site stock increases only when receipt is recorded.", "The same catalog material can come from different suppliers. Receipt batches preserve their supplier and price history. Web stock-in/out, transfers and returns generate a system reference and today’s Philippine date on save; retries reuse both. Actual supplier receipt numbers, receipt dates and delivery references stay separate. The retired opening-values screen is no longer part of setup."],
    figure: { src: "/manual/material-form.webp", width: 740, height: 276, alt: "Empty Add material fields showing catalog identity, base unit, status and minimum stock.", marks: [
      { x: 0.5, y: 2, width: 99, height: 28, label: "Enter a unique material code and clear name. The unit distinguishes materials sold in different measures." },
      { x: 0.5, y: 36, width: 99, height: 28, label: "Select the base unit and set the minimum stock level. The material name identifies what staff should request." },
      { x: 0.5, y: 70, width: 49, height: 28, label: "Keep the material Active so staff can choose it. Historical stock records are preserved when it is made Inactive." },
    ] },
  },
  {
    id: "requests", title: "Request → approve → dispatch → receive → use", description: "The warehouse-to-site material workflow.", href: "/requests", roles: ["admin", "engineer", "foreman", "warehouse_staff"],
    before: "The project/site must be active, staff assigned, and a source warehouse linked to the project. The material must already exist in the catalog. Engineer and Foreman submit normal site requests; Admin reviews and Warehouse staff releases them.",
    steps: [
      { title: "Site staff request materials", detail: "In Requests → Materials, Engineer or Foreman selects New material request. Choose the assigned project, site and source warehouse. Select existing materials, enter needed quantities, Needed by and Purpose, then submit. On mobile the whole active catalog appears first. The list shows material names, SKU and units without warehouse stock counts. Tap a material and enter the requested quantity; warehouse availability is checked during source assignment and approval. Mobile requests use today’s Philippine date automatically. Admin or assigned Warehouse Staff chooses one linked source warehouse on the request details before approval reserves stock. Tap any catalog material, including one with zero stock, to open its quantity form. Empty site inventory offers Request materials. Tapping a site-stock material opens the request form with that material selected. Submitting a request does not reserve or deduct stock." },
      { title: "Engineer or Admin reviews", detail: "Open the request number. An authorized independent Engineer, or Admin, enters approved quantities under Manager decision and selects Save decision. Enter zero to reject a line and provide a reason for any reduction or rejection. Engineers cannot approve their own requests. Approval reserves available warehouse stock; on-hand stock does not change yet." },
      { title: "Warehouse releases stock", detail: "Admin or assigned Warehouse staff opens the approved request and selects Release beside the material under Release materials. Enter the actual quantity and dispatch date, select a company vehicle or describe external transport, and enter the driver and delivery reference. Partial releases leave the reserved remainder outstanding. Dispatch deducts source warehouse stock and places the released quantity in transit." },
      { title: "The site checker inspects delivery", detail: "At the destination, assigned Engineer/Foreman or Admin opens the request's Site receipts. Check the material, transport details and actual usable quantity, then select Material check and Confirm receipt. Accepted with quality note requires a quality note. Receipt adds only the accepted quantity to site stock. Missing or damaged quantities stay in transit until Admin records the authorized variance; do not receive goods that did not arrive." },
      { title: "Record actual use separately", detail: "On web, open the project's Materials tab → Record use. On mobile, use Record Material Use for the selected site. Select the material, date and quantity actually used, and enter the usage reference. Record use deducts site stock and posts material cost to that project. Remaining delivered stock stays at the site; it is not deducted again from the warehouse." },
    ],
    result: "Every quantity is traceable from the source warehouse to delivery, site stock and actual use, with actors and transport references.",
    tips: ["If 300 bags arrive and only 100 are used, record receipt of 300 and use of 100. The other 200 remain in site inventory.", "Approval is not delivery. Check Requested, Approved, Reserved, Dispatched, Received and In transit on the request; use History to see who acted and when.", "If the warehouse has no stock or the material is missing from the catalog, use Requests → Out-of-stock reports. Do not create a duplicate catalog material or enter fictitious stock.", "The requester or Admin can cancel an eligible request before any dispatch; cancellation releases its reservation. Once a delivery has been posted, ask Admin to use the supported correction flow.", "If a submission fails, retain the form and retry after correcting the cause. Check History before starting another transaction if the previous result is uncertain."],
  },
  {
    id: "sourcing", title: "No stock or missing catalog material", description: "Report the shortage inside Requests and let Admin source it.", href: "/requests?view=missing", roles: siteTeam,
    before: "First check the material name, unit, source warehouse, search and stock availability.",
    steps: [
      { title: "Report the shortage", detail: "Open Requests and its Out-of-stock reports section. On web, enter the assigned project/site, warehouse, material, unit, quantity, needed date and reason. Mobile material requests no longer contain a separate shortage-report form. Request an existing catalog material normally even when stock is zero; tell Admin if the item does not exist in the catalog. Delivery discrepancies are recorded through actual accepted quantities and inspection notes, not this sourcing report. Do not invent a substitute catalog item." },
      { title: "Admin reviews and sources", detail: "Admin chooses the linked source warehouse if the report is awaiting one, then checks whether the material exists. Use Add catalog material only for a genuinely new item. Purchase material opens a supplier purchase linked to the shortage and its source warehouse; choose the existing catalog item and quantity to source." },
      { title: "Receive the warehouse purchase", detail: "Follow supplier inspection and receipt. A purchase approval alone does not make warehouse stock available." },
      { title: "Create the linked site request", detail: "After warehouse receipt, Admin selects the Catalog material, Quantity for site and Site request note on the report, then selects Create site request. The linked request still needs Engineer approval before warehouse release and site receipt. A partial request leaves a quantity remaining; follow its linked requests rather than submitting duplicates." },
      { title: "Follow the report's status", detail: "Site request created means the shortage has been linked to site requests; it does not mean delivery is complete. Open the linked request numbers to check approval, dispatch and receipt. If sourcing is no longer needed, Admin can use Dismiss report with a reason when permitted." },
    ],
    result: "The shortage has a sourcing history and follows the same controlled warehouse-to-site delivery process.",
    tips: ["The former separate Missing materials screen is now part of Requests. Past reports remain available.", "Zero stock means source or replenish; it does not authorize staff to add uncatalogued materials or edit balances."],
  },
  {
    id: "purchases", title: "Supplier purchasing: the seven stages", description: "Requests, owner approval, quotations, orders, inspection, receipt and payment.", href: "/purchase-orders", roles: financeTeam,
    before: "Admin maintains suppliers, catalog materials and the destination warehouse. Finance reviews purchasing and handles permitted payments.",
    steps: [
      { title: "Material request, when needed", detail: "Link an approved project material request when sourcing for a site. Admin can also buy warehouse stock without a project request." },
      { title: "Purchase approval", detail: "An Admin supplier-purchase submission up to and including ₱50,000 issues automatically. Above ₱50,000, it appears under Waiting for owner approval in Purchasing; Admin selects Review and approves or rejects it before issuance and supplier-price posting. Finance can view it but cannot give owner approval. This is separate from Engineer approval of a site material request." },
      { title: "Supplier quotation, when used", detail: "Admin can save and compare formal supplier quotations, then link the chosen quotation. Quotation supplier, materials, quantities and prices must match the purchase. A quotation is optional for a direct purchase from a known supplier." },
      { title: "Create the purchase order", detail: "Admin selects Add supplier items, chooses the supplier and delivery warehouse, and adds each material with its quantity and unit price. Check the calculated line totals and order total before submitting. Add an expected delivery date or note when useful." },
      { title: "Inspect the supplier delivery", detail: "Admin or assigned Warehouse staff records the delivery reference, delivered quantities, accepted quantities and condition. Rejected quantities do not become usable stock." },
      { title: "Receive accepted inventory", detail: "Use Add accepted stock for the saved inspection. This posts the accepted receipt into the destination warehouse at the purchase price. Partial deliveries leave the remaining quantity outstanding." },
      { title: "Record supplier payment", detail: "Admin or Finance uses the pencil beside Supplier Payment to record cash or check details against the purchase's remaining balance. Fully paid rows open payment history. Payments apply to the purchase, not separately to every displayed item line." },
    ],
    result: "The purchase has a delivery/stock history and a separate payment history. Receipt increases stock once; payment settles the supplier balance.",
    tips: ["Paid does not mean received. If payment is complete but inventory is missing, check the saved inspection, posted receipt and destination warehouse. Never record another receipt just to make the paid label change.", "A later supplier price does not rewrite earlier receipt or project cost snapshots. Actual use draws from the newest available receipt price batches under the system's costing rule.", "The seven stages describe the purchasing process. Choose any request or quotation link in the purchase form before saving; the amount then determines whether the order issues immediately or waits for approval. Request and quotation links are optional for direct warehouse purchasing. Delivery inspection and inventory receipt remain required."],
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
    id: "site-purchases", title: "Engineer: site purchases and receipt expenses", description: "Record inventory materials, receipt expenses or diesel against the selected project/site.", href: "/site-purchases", roles: ["admin", "finance", "engineer"],
    before: "The Engineer needs an assigned active site and a readable receipt photo. Inventory material purchases also require existing catalog materials.",
    steps: [
      { title: "Choose the purchase type", detail: "On mobile choose the project/site on Home, open Buy at hardware store, then New purchase. Choose the actual hardware store, add existing materials with quantities and unit prices, then attach the receipt photo. The total is calculated. Tap Check purchase to review the materials, quantities, unit prices and total, then Submit. There is no cash-source selector. History is a separate button on the same page. On web, choose Receipt expense or Inventory materials; itemized stock receipts still require the supplier and material quantities." },
      { title: "Use the automatic mobile details", detail: "The purchase uses the project/site selected on Home, today’s Philippine date, a generated system reference and Company cash. There is no manual date, receipt-number, payment-source or notes field. Submit for review; no stock or material cost is posted at submission. Retrying keeps the original date and reference." },
      { title: "Record diesel instead", detail: "On mobile open Vehicle History, select a vehicle currently at the Home site and choose Add diesel receipt. Enter the total and attach the receipt. The system generates today’s Philippine posting date and a reference. Up to ₱50,000 posts one project expense; higher amounts require Admin approval. Tap a diesel receipt for that vehicle’s history at this site. Admin/Finance can also view diesel history on the vehicle detail page." },
      { title: "Enter an inventory receipt", detail: "On web, for Inventory materials enter receipt number and date, then materials, quantities and unit prices. Check each line and the receipt total. The date must not be in the future under Philippine business time." },
      { title: "Identify who paid", detail: "Web itemized purchases retain Company cash or Own money and optional notes. Mobile material purchases require the hardware store, item quantities, unit prices and receipt photo; Company cash is automatic. Wait for confirmation before creating another receipt." },
      { title: "Admin or Finance checks the purchase", detail: "For Inventory materials, the reviewer verifies the receipt, site, items and price, then approves or rejects with the required reason. Approval adds the bought quantities directly to that site's stock once. For itemized materials up to ₱50,000, Admin or Finance can approve; above ₱50,000 only Admin can approve. Web receipt-only expenses above ₱50,000 also require Admin and post expense only." },
      { title: "Reimburse or use the stock", detail: "For Own money, Admin or Finance records reimbursement after paying the Engineer back. Site staff separately records actual material use; reimbursement does not add stock again." },
    ],
    result: "Approved itemized materials appear in site stock at the receipt price. Receipt expenses appear in project costs without adding stock. Diesel also appears in vehicle history. Payment and reimbursement never post the cost or stock again.",
    tips: ["Itemized site material purchases follow receipt review; above ₱50,000 only Admin can approve. On mobile, use Add diesel receipt inside a vehicle’s history, enter the total and attach a receipt photo. Diesel up to ₱50,000 posts one project expense automatically; higher amounts wait for Admin. Diesel does not add material stock.", "If approved stock seems missing, open that specific site in Inventory and check the purchase receipt history before submitting again.", "Use a clear supported receipt photo. Mobile accepts an upload under 3 MB; the app prepares camera/gallery images before submission."],
  },
  {
    id: "assets", title: "Equipment, vehicles and reusable custody", description: "Request, hand over, monitor and return assets.", href: "/inventory?type=equipment", roles: ["admin", "engineer", "foreman", "warehouse_staff"],
    before: "Admin registers the asset. Reusable assets are tracked individually, separately from consumable quantities.",
    steps: [
      { title: "Choose the asset type", detail: "Use Equipment or Vehicles in Inventory. Engineer and Foreman request assets from the matching tab in Requests; Warehouse staff checks inventory rather than approving asset requests. Admin enters a simple free-text type in the asset form; separate equipment category and vehicle type setup pages are not needed." },
      { title: "Request and approve", detail: "Assigned site staff selects an available asset and enters its purpose. Mobile inherits the project/site selected on Home and sets today’s Philippine date automatically and does not ask for a needed date or expected return deadline. Web requests can retain an explicit return date. Admin reviews availability and authorizes the handover." },
      { title: "Record custody", detail: "Admin records handover and destination on the approved request. Check the person, asset and site so the system shows who holds it." },
      { title: "Record actual equipment use", detail: "Foreman selects Record equipment hours on the project; Admin uses Record equipment or vehicle use in project costs. Select an asset at the site and enter Use date, Hours used and Work note, with Start photo and After photo. Admin must first set an hourly rate covering that date; the system calculates the cost from actual hours. Do not also enter it as an unrelated expense." },
      { title: "Return the asset", detail: "Admin records its return and condition. Site staff reports damage or unavailable equipment so it is not allocated as available for another request." },
      { title: "Check mobile vehicle history", detail: "Open Vehicle History from Home or Equipment & Vehicles. Search the vehicle name, code or reference, then tap an entry to filter to that vehicle. The selected site's timeline combines location changes, request/handover/return records, operating hours, linked material deliveries and diesel receipts. Past site records remain accessible after the vehicle moves away. Financial rates and costs remain restricted." },
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
      { title: "Review independently", detail: "An authorized independent Engineer or Admin opens the submitted report. Check actual progress and linked entries, then choose Approve report or Return for correction with a Review note explaining the required changes. The preparer cannot review their own report. Approval locks that revision; it does not itself post material use, attendance or equipment charges." },
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
      { title: "Read the notification inbox", detail: "Open Notifications to read alerts and follow links to permitted records. Refresh while online if needed. Alerts are available in the in-app inbox. Phone push notifications and their settings have been removed." },
      { title: "Follow an update prompt", detail: "If Update required appears, select Update now and install the supported release. Reopen the app and use Check again if the prompt remains. A newer release is mandatory only when the server's compatibility rules require it. A compatible version can continue without a mandatory update." },
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
      { title: "Check a location's balance", detail: "In Inventory, use All warehouses for shared warehouse stock and All sites for stock already delivered to permitted sites. Select one warehouse or site to check its own balance and history. All locations is the combined overview, so its total includes both warehouse and site holdings; it is not the quantity available in a single warehouse." },
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
      { title: "Add the supplier", detail: "Admin opens Suppliers → Add supplier. Enter the store name, contact number and address. These are the main fields; More details is optional. Supplier categories are no longer part of setup." },
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
