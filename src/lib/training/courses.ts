import { trainingLessons } from "./lessons.generated";
import type { TrainingLesson } from "./types";

/** Public Google Drive folder that holds every training video (shared as "Anyone with the link → Viewer"). */
export const trainingDriveFolder = "https://drive.google.com/drive/folders/1Bzq8ZgPf4Pyr2_W3pEXjISqBFBNfAde3";
/** The whole course in one video (about 65 minutes). */
export const trainingCompleteCourseDriveId = "1D6LQ79e1W2bG3ULpiz1GlkLT1mBCCuc4";

export type TrainingRoleId = "admin" | "hr" | "engineer" | "foreman" | "warehouse" | "finance" | "driver";
export type TrainingRole = { id: TrainingRoleId; label: string; who: string; uses: string; lessons: readonly TrainingLesson["slug"][] };

export const trainingRoles: readonly TrainingRole[] = [
  { id: "admin", label: "Admin / Owner", who: "You run the company: staff accounts, projects, suppliers and final approvals.", uses: "Web", lessons: ["overview", "getting-started", "admin", "finance", "inventory-equipment-vehicles", "requests"] },
  { id: "hr", label: "HR", who: "You keep employee records, attendance and payroll drafts up to date.", uses: "Web", lessons: ["overview", "getting-started", "hr"] },
  { id: "engineer", label: "Engineer", who: "You approve material requests, buy at the hardware store and review daily reports.", uses: "Web and phone", lessons: ["overview", "getting-started", "engineer-web", "requests", "engineer-mobile"] },
  { id: "foreman", label: "Foreman", who: "You ask for materials, receive deliveries and report the work on site every day.", uses: "Web and phone", lessons: ["overview", "getting-started", "foreman-web", "requests", "foreman-mobile"] },
  { id: "warehouse", label: "Warehouse staff", who: "You release approved stock, receive supplier deliveries and keep the stock right.", uses: "Web and phone", lessons: ["overview", "getting-started", "warehouse-web", "inventory-equipment-vehicles", "warehouse-mobile"] },
  { id: "finance", label: "Finance", who: "You pay suppliers, approve receipts, bill clients and record payroll payments.", uses: "Web", lessons: ["overview", "getting-started", "finance", "requests"] },
  { id: "driver", label: "Driver", who: "You record fuel, repairs and other expenses for your truck on the phone.", uses: "Phone", lessons: ["overview", "driver-mobile"] },
];

const lessonsBySlug = new Map<string, TrainingLesson>(trainingLessons.map((lesson) => [lesson.slug, lesson]));

export function getTrainingRole(id: string) {
  return trainingRoles.find((role) => role.id === id);
}

export function getRoleLessons(role: TrainingRole): TrainingLesson[] {
  return role.lessons.map((slug) => {
    const lesson = lessonsBySlug.get(slug);
    if (!lesson) throw new Error(`Training lesson ${slug} is missing`);
    return lesson;
  });
}

export function drivePreviewUrl(driveId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`;
}

export function formatVideoTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
