"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface WSMessage {
  type: string;
  recording_id: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface UseWebSocketReturn {
  lastMessage: WSMessage | null;
  isConnected: boolean;
  send: (data: unknown) => void;
}

const MAX_BACKOFF_MS = 10_000;

export default function useWebSocket(url: string | null): UseWebSocketReturn {
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const urlRef = useRef(url);
  const mountedRef = useRef(true);

  urlRef.current = url;

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!urlRef.current || !mountedRef.current) return;

    cleanup();

    try {
      const ws = new WebSocket(urlRef.current);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        backoffRef.current = 1000;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const parsed: WSMessage = JSON.parse(event.data);
          setLastMessage(parsed);
        } catch {
          // Ignore messages that aren't valid JSON
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror, reconnect logic happens there
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        wsRef.current = null;

        // Auto-reconnect with exponential backoff
        if (urlRef.current) {
          const delay = backoffRef.current;
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && urlRef.current) {
              connect();
            }
          }, delay);
        }
      };
    } catch {
      // Connection creation failed, schedule reconnect
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && urlRef.current) {
          connect();
        }
      }, delay);
    }
  }, [cleanup]);

  useEffect(() => {
    mountedRef.current = true;

    if (url) {
      backoffRef.current = 1000;
      connect();
    } else {
      cleanup();
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [url, connect, cleanup]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { lastMessage, isConnected, send };
}
