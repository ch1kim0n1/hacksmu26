const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const headers: HeadersInit = {
    ...(options?.headers || {}),
  };

  // Only set Content-Type to JSON if body is not FormData
  if (!(options?.body instanceof FormData)) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: unknown = null;
    let message = `API error: ${response.status} ${response.statusText}`;
    try {
      errorData = await response.json();
      const payload = errorData as {
        detail?: string | { msg?: string }[];
        error?: { message?: string };
        message?: string;
      };
      if (typeof payload.detail === "string") {
        message = payload.detail;
      } else if (Array.isArray(payload.detail) && payload.detail.length > 0) {
        const first = payload.detail[0];
        if (first && typeof first === "object" && typeof first.msg === "string") {
          message = first.msg;
        }
      } else if (payload.error?.message) {
        message = payload.error.message;
      } else if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Response body may not be JSON
    }
    throw new ApiError(message, response.status, errorData);
  }

  // Handle empty responses (204 No Content, etc.)
  const contentType = response.headers.get("content-type");
  if (
    response.status === 204 ||
    !contentType ||
    !contentType.includes("application/json")
  ) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export { API_BASE };
