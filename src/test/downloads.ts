import { vi } from "vitest";

export interface CapturedDownload {
  filename: string;
  blob: Blob;
}

/**
 * jsdom can't download files. This captures browser-level downloads (blob URL + <a download>
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

  // jsdom doesn't implement these, so define them before spying.
  for (const name of ["createObjectURL", "revokeObjectURL"] as const) {
    if (!(name in URL)) {
      Object.defineProperty(URL, name, { value: () => undefined, configurable: true, writable: true });
    }
  }

  vi.spyOn(URL, "createObjectURL").mockImplementation((obj) => {
    const url = `blob:test/${blobs.size + 1}`;
    blobs.set(url, obj as Blob);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
    revoked.push(url);
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const blob = blobs.get(this.href);
    if (blob && this.download) downloads.push({ filename: this.download, blob });
  });

  return Object.assign(downloads, {
    /** Blob URLs that were released after the download started. */
    revoked,
  });
}
