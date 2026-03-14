export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const method = init?.method ?? "GET"
    throw new Error(`[fetchJson] ${method} ${url} failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function persist<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }

  return fetchJson<T>(url, init)
}
