import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordActionMenu } from "@/components/ui/record-action-menu";
import type { EmployeeListView } from "@/lib/data/workforce";

export function EmployeeTable({ employees, count, canManage }: { employees: EmployeeListView[]; count: number; canManage: boolean }) {
  if (employees.length === 0) return <DataTableShell empty={<EmptyState title="No employees found" description="Adjust the filters or register an employee." />}>{null}</DataTableShell>;
  return <><DataTableShell>
    <table className="w-full min-w-[900px] text-left text-sm">
      <thead className="bg-slate-50 text-slate-500"><tr>
        <th scope="col" className="px-5 py-3">Employee</th><th scope="col" className="px-4 py-3">Trade</th><th scope="col" className="px-4 py-3">Phone</th><th scope="col" className="px-4 py-3">Email</th><th scope="col" className="px-4 py-3">Projects</th><th scope="col" className="px-4 py-3 text-right">Status</th><th scope="col" className="px-5 py-3 text-right">Actions</th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">{employees.map((employee) => <tr key={employee.id} className="hover:bg-slate-50/70">
        <td className="px-5 py-4"><Link href={`/employees/${employee.id}`} className="flex items-center gap-3 font-semibold text-[#07152d] hover:text-cyan-700"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-cyan-50 text-xs font-semibold text-cyan-700">{`${employee.first_name[0] ?? ""}${employee.last_name[0] ?? ""}`.toUpperCase()}</span><span>{employee.fullName}<span className="mt-0.5 block text-xs font-normal text-slate-400">{employee.code}</span></span></Link></td>
        <td className="px-4 py-4 text-slate-600">{employee.categoryName}</td>
        <td className="px-4 py-4 text-slate-600">{employee.contactNumber ? <a href={`tel:${employee.contactNumber}`} className="hover:text-cyan-700">{employee.contactNumber}</a> : "—"}</td>
        <td className="max-w-[220px] truncate px-4 py-4 text-slate-600">{employee.emailAddress ? <a href={`mailto:${employee.emailAddress}`} className="hover:text-cyan-700">{employee.emailAddress}</a> : "—"}</td>
        <td className="max-w-[220px] truncate px-4 py-4 text-xs text-slate-500">{employee.activeProjects.length ? employee.activeProjects.join(", ") : "Not assigned"}</td>
        <td className="px-4 py-4 text-right"><Badge variant={employee.status === "active" ? "active" : employee.status === "on_leave" ? "review" : "neutral"}>{employee.status.replace("_", " ")}</Badge></td>
        <td className="px-5 py-4 text-right"><RecordActionMenu name={employee.fullName} actions={[{ label: "View", href: `/employees/${employee.id}` }, ...(canManage && employee.status !== "separated" ? [{ label: "Edit", href: `/employees/${employee.id}/edit` }, { label: "Archive", href: `/employees/${employee.id}` }] : [])]} /></td>
      </tr>)}</tbody>
    </table>
  </DataTableShell><p className="mt-3 text-sm text-slate-500">{count} employee record{count === 1 ? "" : "s"}</p></>;
}
