import { ProjectListControls, projectListHeader } from "@/components/projects/project-list-controls";
import { PageHeader } from "@/components/ui/page-header";
import { RecordListSkeleton } from "@/components/ui/record-list-view";

export default function Loading() { return <><PageHeader {...projectListHeader} /><ProjectListControls /><RecordListSkeleton storageKey="projects" /></>; }
