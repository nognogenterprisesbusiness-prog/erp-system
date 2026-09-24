import { ErrorState } from "@/components/ui/error-state";

export default function NotFound() {
  return <ErrorState code={404} />;
}
