import { useEffect, useRef, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Card, CardHeader } from "../../components/ui/Card";
import { Banner } from "../../components/ui/Banner";

interface ScanPayload {
  session_id: string;
  token: string;
}

interface ScanResponse {
  status: "marked" | "already_marked";
}

export function ScanPage() {
  const containerId = "qr-reader";
  const [banner, setBanner] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const processingRef = useRef(false);

  async function handleScan(decodedText: string) {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const payload = JSON.parse(decodedText) as ScanPayload;
      if (!payload.session_id || !payload.token) throw new Error("not fictIn QR");

      const res = await api.post<ScanResponse>("/api/v1/attendance/scan", {
        session_id: payload.session_id,
        token: payload.token,
      });

      if (res.status === "already_marked") {
        setBanner({ tone: "info", text: "You're already marked present for this session." });
      } else {
        setBanner({ tone: "success", text: "Marked present! ✅" });
      }
    } catch (err) {
      if (err instanceof SyntaxError || (err instanceof Error && err.message === "not fictIn QR")) {
        setBanner({ tone: "error", text: "That doesn't look like a fictIn attendance code." });
      } else {
        setBanner({ tone: "error", text: errorMessage(err) });
      }
    } finally {
      setTimeout(() => {
        processingRef.current = false;
      }, 1600);
    }
  }

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      containerId,
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false,
    );

    scanner.render(
      (decodedText) => void handleScan(decodedText),
      () => {
        // ignore per-frame decode errors, they're expected while aiming the camera
      },
    );

    return () => {
      void scanner.clear().catch(() => undefined);
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Scan attendance QR"
          subtitle="Point your camera at the code shown on your professor's screen."
        />
        {banner && (
          <div className="mb-4">
            <Banner tone={banner.tone} onDismiss={() => setBanner(null)}>
              {banner.text}
            </Banner>
          </div>
        )}
        <div id={containerId} className="overflow-hidden rounded-lg" />
      </Card>
    </div>
  );
}
