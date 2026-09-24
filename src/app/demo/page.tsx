import { DemoWorkspace } from "@/components/demo/demo-workspace";
import { configuredAppMode } from "@/lib/app-mode";

export default function DemoPage() {
  return <DemoWorkspace canExitToLive={configuredAppMode() !== "local-demo"} />;
}
