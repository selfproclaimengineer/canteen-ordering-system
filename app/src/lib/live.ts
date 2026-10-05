import { useEffect, useRef, useState } from 'react';
import type { ServerEvent } from '../../../server/events';

export type LiveEvent = ServerEvent | { type: 'reconnected' };

/** Keeps one WebSocket to the host, reconnects forever, and reports whether it is online. */
export function useLive(onEvent: (e: LiveEvent) => void): boolean {
  const [online, setOnline] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let berhenti = false;
    let timer = 0;
    const sambung = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.onopen = () => {
        setOnline(true);
        handler.current({ type: 'reconnected' });
      };
      ws.onmessage = (m) => handler.current(JSON.parse(String(m.data)) as ServerEvent);
      ws.onclose = () => {
        setOnline(false);
        if (!berhenti) timer = window.setTimeout(sambung, 1500);
      };
      ws.onerror = () => ws?.close();
    };
    sambung();
    return () => {
      berhenti = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return online;
}
