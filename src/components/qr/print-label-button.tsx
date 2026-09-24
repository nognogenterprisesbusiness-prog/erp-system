"use client";

import { Button } from "@/components/ui/button";

export function PrintLabelButton() {
  return <Button type="button" onClick={() => window.print()}>Print label</Button>;
}
