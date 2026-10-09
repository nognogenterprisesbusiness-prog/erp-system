import type { ManualFigure, ManualGuide } from "./manual";

const screenshots: Record<string, ManualFigure[]> = {
  projects: [
    { src: "/manual/project-identity.webp", title: "Add a project: code and name", width: 703, height: 84, alt: "Empty project code and project name inputs with example placeholders.", marks: [
      { x: 1, y: 5, width: 48, height: 90, label: "Admin enters a unique project code for references and searches." },
      { x: 51, y: 5, width: 48, height: 90, label: "Use a recognizable project name. The text already shown is an example, not a saved project." },
    ] },
    { src: "/manual/project-client.webp", title: "Project client and city", width: 703, height: 176, alt: "Empty client contact fields and city search with example placeholders.", marks: [
      { x: 1, y: 3, width: 98, height: 42, label: "Enter the actual client's name and email, following the format of the examples." },
      { x: 1, y: 54, width: 48, height: 43, label: "Use the client's contact number, not the example number." },
      { x: 51, y: 54, width: 48, height: 43, label: "Search for the city or municipality and choose a result. Clear the selected city before changing it." },
    ] },
  ],
  warehouses: [
    { src: "/manual/warehouse-details.webp", title: "Add a warehouse", width: 753, height: 84, alt: "Empty warehouse code and name fields with WH-CEBU-01 and Cebu Main Warehouse examples.", marks: [
      { x: 1, y: 5, width: 48, height: 90, label: "Admin gives each warehouse its own unique code." },
      { x: 51, y: 5, width: 48, height: 90, label: "Use the actual warehouse name. Set the relevant project and staff links separately before requests begin." },
    ] },
  ],
  suppliers: [
    { src: "/manual/supplier-details.webp", title: "Add a hardware store or supplier", width: 763, height: 176, alt: "Empty supplier name, contact number and address fields with input examples.", marks: [
      { x: 1, y: 3, width: 48, height: 42, label: "Admin enters the store's actual name. Reuse that supplier on future purchases instead of creating duplicates." },
      { x: 51, y: 3, width: 48, height: 42, label: "Enter a usable supplier contact number." },
      { x: 1, y: 54, width: 98, height: 43, label: "Enter the store address. Additional supplier details are optional." },
    ] },
  ],
  people: [
    { src: "/manual/employee-details.webp", title: "Add an employee", width: 753, height: 296, alt: "Empty employee identity and trade fields with example names and contact number.", marks: [
      { x: 1, y: 2, width: 98, height: 25, label: "Admin enters a unique employee code and chooses the worker's category or trade." },
      { x: 1, y: 33, width: 98, height: 25, label: "Enter the worker's actual first and middle names." },
      { x: 1, y: 64, width: 98, height: 31, label: "Complete the last name and contact number. Contact details remain restricted to authorized users." },
    ] },
  ],
  assets: [
    { src: "/manual/equipment-identity.webp", title: "Register equipment", width: 703, height: 296, alt: "Empty equipment code, SKU, name, free-text type, brand and model fields.", marks: [
      { x: 1, y: 2, width: 98, height: 28, label: "Admin enters a unique equipment code. The SKU is optional." },
      { x: 1, y: 38, width: 98, height: 25, label: "Enter the equipment's name and type directly. No separate equipment category setup is required." },
      { x: 1, y: 73, width: 98, height: 25, label: "Add the brand and model when useful for identifying the equipment." },
    ] },
    { src: "/manual/vehicle-details.webp", title: "Register a vehicle", width: 763, height: 176, alt: "Empty vehicle name, free-text type, plate number and location fields.", marks: [
      { x: 1, y: 3, width: 98, height: 42, label: "Admin enters a clear vehicle name and types its vehicle type, such as Dump truck." },
      { x: 1, y: 54, width: 48, height: 43, label: "Use the actual plate number so staff can identify the vehicle." },
      { x: 51, y: 54, width: 48, height: 43, label: "Choose its current location. Registering a vehicle is separate from requesting it and recording custody." },
    ] },
  ],
  reports: [
    { src: "/manual/daily-report-work.webp", title: "Describe the day's work", width: 703, height: 166, alt: "Empty work description and accomplishments fields in a daily report.", marks: [
      { x: 1, y: 3, width: 48, height: 94, label: "Describe the actual work for the selected site and date. The input example is a guide to the expected format." },
      { x: 51, y: 3, width: 48, height: 94, label: "Record what was accomplished. Complete the required report details before submitting for independent review." },
    ] },
  ],
  "site-purchases": [
    { src: "/manual/site-purchase-receipt.webp", title: "Identify the hardware-store receipt", width: 753, height: 84, alt: "Empty receipt number and current receipt date controls in a new site purchase.", marks: [
      { x: 1, y: 5, width: 48, height: 90, label: "Copy the receipt number from the hardware-store receipt." },
      { x: 51, y: 5, width: 48, height: 90, label: "Use the actual receipt date. It cannot be in the future in Philippine time." },
    ] },
    { src: "/manual/site-purchase-items.webp", title: "Enter what was bought", width: 571, height: 84, alt: "Empty material, quantity and unit price controls for a site-purchase line.", marks: [
      { x: 1, y: 5, width: 48, height: 90, label: "Choose an existing catalog material. Check its unit before entering the quantity." },
      { x: 51, y: 5, width: 23, height: 90, label: "Enter the actual quantity bought." },
      { x: 77, y: 5, width: 22, height: 90, label: "Enter the price per unit, not the receipt's grand total. Add another line for a different material." },
    ] },
    { src: "/manual/site-purchase-payment.webp", title: "Record who paid", width: 753, height: 84, alt: "Company cash selected in Paid with and an empty optional note field.", marks: [
      { x: 1, y: 5, width: 48, height: 90, label: "Choose Company cash or Own money accurately. Own money identifies the reimbursement obligation." },
      { x: 51, y: 5, width: 48, height: 90, label: "Add a useful note, then attach a clear receipt photo in the form before submitting. Approval posts stock to the selected site once." },
    ] },
  ],
  finance: [
    { src: "/manual/billing-invoice.webp", title: "Issue a client invoice", width: 858, height: 414, alt: "Empty project invoice form with project selection, amount, issue date, due date and description.", marks: [
      { x: 1, y: 2, width: 48, height: 40, label: "Admin or Finance selects the project. Check its remaining contract value before issuing the invoice." },
      { x: 51, y: 2, width: 48, height: 17, label: "Enter the amount to bill the client. Supplier purchases and payments belong to their own workflows." },
      { x: 1, y: 46, width: 98, height: 18, label: "Choose the issue and due dates." },
      { x: 1, y: 68, width: 98, height: 29, label: "Describe the work or billing period. After issuing, record actual client collections against this invoice." },
    ] },
  ],
  requests: [
    { src: "/manual/request-items.webp", title: "Request available warehouse material", width: 780, height: 160, alt: "Empty searchable material picker and quantity input in a material request.", marks: [
      { x: 1, y: 3, width: 73, height: 94, label: "Search and select a material available from the chosen source warehouse. No matches can mean the warehouse or its stock needs checking." },
      { x: 75, y: 48, width: 24, height: 45, label: "Enter the required quantity. Approval reserves stock; warehouse dispatch and site receipt are later actions." },
    ] },
  ],
  sourcing: [
    { src: "/manual/missing-material.webp", title: "Report material that is unavailable", width: 907, height: 172, alt: "Empty material name, unit, quantity needed and reason inputs in Requests.", marks: [
      { x: 1, y: 3, width: 98, height: 42, label: "Describe the unavailable material and its unit so Admin can match it to the catalog or source it correctly." },
      { x: 1, y: 54, width: 48, height: 43, label: "Enter the quantity the site needs." },
      { x: 51, y: 54, width: 48, height: 43, label: "Explain the work it is needed for. The report does not add inventory; Admin sources it into the warehouse before the approved site-delivery workflow." },
    ] },
  ],
};

export function getGuideFigures(guide: ManualGuide): readonly ManualFigure[] {
  const existing = guide.figure ? [{ ...guide.figure, title: guide.id === "inventory" ? "Add a catalog material" : guide.id === "purchases" ? "Supplier purchase line items" : "Change a selected city" }] : [];
  return [...existing, ...(screenshots[guide.id] ?? [])];
}
