import { onTestFinished, vi } from "vitest";

export interface CapturedDownload {
  filename: string;
  blob: Blob;
}

/**
 * jsdom can't download files (it doesn't navigate to blob URLs). This captures browser-level downloads (blob URL + <a download>
 * click) so tests can assert the filename and contents the user would receive.
 * Spies are restored automatically after each test (restoreMocks in vitest.config.ts).
 *
 *   const downloads = mockDownloads();
 *   ...click "Download CSV"...
 *   await vi.waitFor(() => expect(downloads).toHaveLength(1));
 *   expect(downloads[0].filename).toBe("attendance.csv");
 *   expect(await downloads[0].blob.text()).toContain("Ana Student");
 */
export function mockDownloads() {
  const downloads: CapturedDownload[] = [];
  const blobs = new Map<string, Blob>();
  const revoked: string[] = [];

  // jsdom 30 implements these; older jsdom doesn't. If missing, shim them for this test only.
  const shimmed = (["createObjectURL", "revokeObjectURL"] as const).filter((name) => !(name in URL));
  for (const name of shimmed) {
    Object.defineProperty(URL, name, { value: () => undefined, configurable: true, writable: true });
  }
  const realClick = HTMLAnchorElement.prototype.click;

  const createSpy = vi.spyOn(URL, "createObjectURL").mockImplementation((obj) => {
    const url = `blob:test/${blobs.size + 1}`;
    blobs.set(url, obj as Blob);
    return url;
  });
  const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
    revoked.push(url);
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const blob = blobs.get(this.href);
    if (blob && this.download) {
      downloads.push({ filename: this.download, blob });
    } else {
      realClick.call(this); // not one of our downloads: behave normally
    }
  });

  onTestFinished(() => {
    // Restore our spies first (restoring later would re-install the shims), then drop the shims.
    createSpy.mockRestore();
    revokeSpy.mockRestore();
    for (const name of shimmed) delete (URL as unknown as Record<string, unknown>)[name];
  });

  return Object.assign(downloads, {
    /** Blob URLs that were released after the download started. */
    revoked,
  });
}
