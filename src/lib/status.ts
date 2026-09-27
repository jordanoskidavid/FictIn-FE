import type { Tone } from "../components/ui/Badge";

export function statusTone(status: string): Tone {
  if (status === "live") return "green";
  if (status === "pending") return "amber";
  return "neutral";
}
