"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { resolveScannedCode, type ScanResult } from "@/app/(workspace)/scan/actions";
import { Button } from "@/components/ui/button";
import { fieldControlClass } from "@/components/ui/form-field";

type DetectedCode = { rawValue: string };
type NativeBarcodeDetector = { detect(source: HTMLVideoElement): Promise<DetectedCode[]> };
type NativeBarcodeDetectorConstructor = {
  new (options: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

export function QrScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const sessionRef = useRef(0);
  const handlingRef = useRef(false);
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => () => { sessionRef.current += 1; stopRef.current?.(); stopRef.current = null; }, []);

  const stopCamera = () => {
    sessionRef.current += 1;
    stopRef.current?.();
    stopRef.current = null;
    setScanning(false);
  };

  const resolve = async (raw: string) => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    stopCamera();
    setError("");
    setLoading(true);
    try {
      setResult(await resolveScannedCode(raw));
    } catch {
      setResult({ ok: false, message: "Unable to resolve the label right now. Check your connection and try again." });
    } finally {
      setLoading(false);
      handlingRef.current = false;
    }
  };

  const startCamera = async () => {
    if (scanning || loading || !videoRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot access a camera. Enter the printed identifier below.");
      return;
    }
    setError("");
    setResult(null);
    setScanning(true);
    const session = ++sessionRef.current;

    const video = videoRef.current;
    const detectorConstructor = (globalThis as typeof globalThis & { BarcodeDetector?: NativeBarcodeDetectorConstructor }).BarcodeDetector;
    let nativeSupported = Boolean(detectorConstructor);
    if (detectorConstructor?.getSupportedFormats) {
      try { nativeSupported = (await detectorConstructor.getSupportedFormats()).includes("qr_code"); }
      catch { nativeSupported = false; }
    }
    if (sessionRef.current !== session) return;
    if (nativeSupported && detectorConstructor) {
      try {
        const detector = new detectorConstructor({ formats: ["qr_code"] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (sessionRef.current !== session) { stream.getTracks().forEach((track) => track.stop()); return; }
        video.srcObject = stream;
        await video.play();
        if (sessionRef.current !== session) { stream.getTracks().forEach((track) => track.stop()); video.srcObject = null; return; }
        let active = true;
        let frame = 0;
        let lastScan = 0;
        const scanFrame = async (time: number) => {
          if (!active) return;
          if (time - lastScan >= 250 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            lastScan = time;
            try {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) {
                void resolve(codes[0].rawValue);
                return;
              }
            } catch {
              // A transient frame error should not end the camera session.
            }
          }
          if (active) frame = requestAnimationFrame((time) => { void scanFrame(time); });
        };
        stopRef.current = () => {
          active = false;
          cancelAnimationFrame(frame);
          stream.getTracks().forEach((track) => track.stop());
          video.srcObject = null;
        };
        frame = requestAnimationFrame((time) => { void scanFrame(time); });
        return;
      } catch (cause) {
        const stream = video.srcObject;
        if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
        if (sessionRef.current !== session) return;
        if (cause instanceof DOMException && ["NotAllowedError", "NotFoundError", "NotReadableError"].includes(cause.name)) {
          setScanning(false);
          setError("Camera access is unavailable. Enter the printed identifier below.");
          return;
        }
      }
    }

    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (sessionRef.current !== session) return;
      const reader = new BrowserQRCodeReader();
      let stopped = false;
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false }, video,
        (code, _error, scannerControls) => {
          if (stopped || !code || sessionRef.current !== session) return;
          stopped = true;
          scannerControls.stop();
          void resolve(code.getText());
        },
      );
      if (sessionRef.current !== session || stopped) { controls.stop(); return; }
      stopRef.current = () => {
        stopped = true;
        controls.stop();
        video.srcObject = null;
      };
    } catch {
      if (sessionRef.current !== session) return;
      setScanning(false);
      setError("Camera scanning could not start. Enter the printed identifier below.");
    }
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
    <div className="overflow-hidden rounded-xl bg-slate-950">
      <video ref={videoRef} playsInline muted aria-label="QR camera preview" className={`aspect-[4/3] w-full object-cover sm:aspect-video ${scanning ? "block" : "hidden"}`} />
      {!scanning && <div className="grid aspect-[4/3] place-items-center px-5 text-center text-sm text-slate-300 sm:aspect-video">Camera preview appears here when scanning starts.</div>}
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" onClick={() => { void startCamera(); }} disabled={scanning || loading}>Start camera</Button>
      {scanning && <Button type="button" variant="outline" onClick={stopCamera}>Stop camera</Button>}
    </div>
    <form className="mt-6 border-t border-slate-100 pt-5" onSubmit={(event) => { event.preventDefault(); void resolve(manualCode); }}>
      <label htmlFor="manualQrCode" className="block text-sm font-semibold text-slate-800">Enter printed identifier</label>
      <p className="mt-1 text-xs text-slate-500">Use this when the camera is unavailable or the label is damaged.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input id="manualQrCode" value={manualCode} onChange={(event) => setManualCode(event.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={35} placeholder="NQ-…" className={`${fieldControlClass} font-mono uppercase`} />
        <Button type="submit" variant="outline" disabled={loading || !manualCode.trim()}>Look up</Button>
      </div>
    </form>
    {error && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
    {loading && <p role="status" className="mt-4 text-sm text-slate-600">Checking the QR label…</p>}
    {result && (result.ok ? <div className="mt-6 rounded-xl border border-cyan-200 bg-cyan-50/60 p-5" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">{result.resolution.entity_type.replaceAll("_", " ")}</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">{result.resolution.name}</h2>
      {result.resolution.code && <p className="mt-1 text-sm text-slate-600">{result.resolution.code}</p>}
      <div className="mt-4 flex flex-wrap gap-2">{result.actions.map((item) => <Button key={item.href} asChild variant={item.label === "Open record" ? "outline" : "default"} size="sm"><Link href={item.href}>{item.label}</Link></Button>)}</div>
      <p className="mt-4 text-xs text-slate-600">Every action asks for transaction details and checks your access before posting.</p>
    </div> : <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">{result.message}</p>)}
  </section>;
}
