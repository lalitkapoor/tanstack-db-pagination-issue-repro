export type PrimusReconnectScheduledOptions = {
  scheduled?: number
  attempt?: number
  retries?: number
  duration?: number
}

export interface PrimusMessageStoreClient {
  write(data: unknown): void
  end(): void
  destroy(): void
  on(event: "data", cb: (data: unknown) => void): this
  on(event: "error", cb: (error: unknown) => void): this
  on(
    event: "reconnect scheduled",
    cb: (options?: PrimusReconnectScheduledOptions) => void,
  ): this
  on(event: "open" | "reconnect" | "end" | "close", cb: () => void): this
}

type PrimusReconnectOptions = {
  max: number
  min: number
  retries: number
}

type PrimusClientOptions = {
  reconnect: PrimusReconnectOptions
  credentials?: boolean
  transport?: {
    withCredentials?: boolean
    closeOnBeforeunload?: boolean
  }
  websockets?: boolean
}

type PrimusMessageStoreConstructor = new (
  url: string,
  options?: PrimusClientOptions,
) => PrimusMessageStoreClient

const PRIMUS_MESSAGE_STORE_CLIENT_SCRIPT_ID = "primus-message-store-client"
const PRIMUS_MESSAGE_STORE_CLIENT_ASSET_PATH = `${import.meta.env.BASE_URL}primus-message-store-client.js`

declare global {
  interface Window {
    Primus?: PrimusMessageStoreConstructor
  }

  var Primus: PrimusMessageStoreConstructor | undefined
}

let primusClientConstructorPromise: Promise<PrimusMessageStoreConstructor> | null =
  null

function getExistingPrimusConstructor():
  | PrimusMessageStoreConstructor
  | undefined {
  const primus = globalThis.Primus ?? globalThis.window?.Primus
  return typeof primus === "function" ? primus : undefined
}

function loadPrimusClientScript(): Promise<PrimusMessageStoreConstructor> {
  const existingPrimus = getExistingPrimusConstructor()
  if (existingPrimus) {
    return Promise.resolve(existingPrimus)
  }

  if (primusClientConstructorPromise) {
    return primusClientConstructorPromise
  }

  if (typeof document === "undefined") {
    return Promise.reject(
      new Error("Primus client runtime can only load in a browser document"),
    )
  }

  primusClientConstructorPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(
      PRIMUS_MESSAGE_STORE_CLIENT_SCRIPT_ID,
    )
    if (existingScript instanceof HTMLScriptElement) {
      existingScript.addEventListener(
        "load",
        () => {
          const primus = getExistingPrimusConstructor()
          if (!primus) {
            reject(new Error("Primus client runtime did not register"))
            return
          }

          resolve(primus)
        },
        { once: true },
      )
      existingScript.addEventListener(
        "error",
        () => {
          primusClientConstructorPromise = null
          reject(new Error("Failed to load Primus client runtime"))
        },
        { once: true },
      )
      return
    }

    const script = document.createElement("script")
    script.id = PRIMUS_MESSAGE_STORE_CLIENT_SCRIPT_ID
    script.async = true
    script.src = PRIMUS_MESSAGE_STORE_CLIENT_ASSET_PATH
    script.addEventListener(
      "load",
      () => {
        const primus = getExistingPrimusConstructor()
        if (!primus) {
          primusClientConstructorPromise = null
          reject(new Error("Primus client runtime did not register"))
          return
        }

        resolve(primus)
      },
      { once: true },
    )
    script.addEventListener(
      "error",
      () => {
        primusClientConstructorPromise = null
        script.remove()
        reject(new Error("Failed to load Primus client runtime"))
      },
      { once: true },
    )
    document.head.append(script)
  })

  return primusClientConstructorPromise
}

export async function createPrimusMessageStoreClient(
  url: string,
): Promise<PrimusMessageStoreClient> {
  const Primus = await loadPrimusClientScript()

  return new Primus(url, {
    reconnect: {
      max: 8_000,
      min: 4_000,
      retries: 1e20,
    },
    credentials: true,
    transport: {
      withCredentials: true,
      closeOnBeforeunload: false,
    },
  })
}
