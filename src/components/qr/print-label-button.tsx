"use client";

import { Button } from "@/components/ui/button";
import { PrintDocumentButton } from "@/components/ui/print-document-button";

export function PrintLabelButton({ href }: { href?: string }) {
  return href ? <PrintDocumentButton href={href} label="Print label" /> : <Button type="button" onClick={() => window.print()}>Print label</Button>;
}
