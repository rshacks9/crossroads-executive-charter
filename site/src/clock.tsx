import { useSyncExternalStore } from "react";
import { relativeAge } from "./data";

// One shared one-minute clock. The app keeps the same snapshot object until the data changes, so the
// page no longer re-renders every minute; the few things that show an age ("4 min ago") subscribe to
// this clock instead and re-render on their own, without redrawing the maps.

const MINUTE_MS = 60_000;
const listeners = new Set<() => void>();
let minute = 0;
let timer: number | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    timer = window.setInterval(() => {
      minute += 1;
      for (const l of listeners) l();
    }, MINUTE_MS);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Re-renders the calling component once a minute; the value is the number of minutes ticked. */
export function useMinute(): number {
  return useSyncExternalStore(subscribe, () => minute, () => 0);
}

/** An age such as "4 min ago" that stays current by itself. */
export function Ago({ iso }: { iso: string }) {
  useMinute();
  return <>{relativeAge(iso)}</>;
}
