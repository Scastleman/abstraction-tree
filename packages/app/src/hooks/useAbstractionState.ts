import { useCallback, useEffect, useRef, useState } from "react";
import type { AbstractionTreeState as State } from "@abstraction-tree/core";

export type AbstractionStateStatus = "loading" | "ready" | "error";
export type StateFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface UseAbstractionStateResult {
  state: State | null;
  status: AbstractionStateStatus;
  error: string | null;
  isRefreshing: boolean;
  retry: () => void;
  refresh: () => void;
}

export async function fetchAbstractionState(
  fetcher: StateFetcher = globalThis.fetch,
  signal?: AbortSignal
): Promise<State> {
  let response: Response;

  try {
    response = await fetcher("/api/state", { signal });
  } catch (error) {
    throw new Error(`Unable to request /api/state: ${errorMessage(error)}`);
  }

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(`/api/state responded with ${response.status}${statusText}.`);
  }

  try {
    return await response.json() as State;
  } catch (error) {
    throw new Error(`Unable to parse /api/state response: ${errorMessage(error)}`);
  }
}

export function useAbstractionState(fetcher: StateFetcher = globalThis.fetch): UseAbstractionStateResult {
  const [state, setStateValue] = useState<State | null>(null);
  const [status, setStatus] = useState<AbstractionStateStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [requestToken, setRequestToken] = useState(0);
  const stateRef = useRef<State | null>(null);

  const setState = useCallback((nextState: State | null) => {
    stateRef.current = nextState;
    setStateValue(nextState);
  }, []);

  const load = useCallback(() => {
    setRequestToken(token => token + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const hadState = stateRef.current !== null;

    setError(null);
    setIsRefreshing(hadState);
    setStatus(hadState ? "ready" : "loading");

    fetchAbstractionState(fetcher, controller.signal)
      .then(nextState => {
        setState(nextState);
        setStatus("ready");
        setError(null);
      })
      .catch(loadError => {
        if (controller.signal.aborted) return;
        setStatus("error");
        setError(errorMessage(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsRefreshing(false);
      });

    return () => controller.abort();
  }, [fetcher, requestToken, setState]);

  return {
    state,
    status,
    error,
    isRefreshing,
    retry: load,
    refresh: load
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Unknown error";
}
