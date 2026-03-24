import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useAppRuntime } from "~/app-runtime"
import {
  getMessageStoreBaseUrl,
  getRecordVersionEventKey,
  type MessageStoreConnectionStatus,
  type MessageStoreServerMessage,
  RawMessageStoreConnection,
} from "~/lib/message-store"
import { getRecordPointerKey, type RecordPointer } from "~/lib/record-pointer"
import { SidebarMessageStoreBridge } from "~/lib/sidebar-message-store-bridge"

type MessageStoreConnectionState = {
  status: MessageStoreConnectionStatus
  connectionUrl: string
  subscriptionKeys: string[]
  lastMessageType: MessageStoreServerMessage["type"] | null
  lastNotificationKey: string | null
  lastVersion: number | null
  lastEventAt: number | null
}

type MessageStoreConnectionContextValue = MessageStoreConnectionState & {
  releaseRecordPointers: (recordPointers: RecordPointer[]) => void
  reconnect: () => void
  retainRecordPointers: (recordPointers: RecordPointer[]) => void
}

const MessageStoreConnectionContext =
  createContext<MessageStoreConnectionContextValue | null>(null)

export function MessageStoreConnectionProvider({
  children,
}: {
  children: ReactNode
}) {
  const runtime = useAppRuntime()
  const subscriptionCountByKeyRef = useRef(new Map<string, number>())
  const recordPointerBySubscriptionKeyRef = useRef(
    new Map<string, RecordPointer>(),
  )
  const sidebarBridgeRef = useRef<SidebarMessageStoreBridge | null>(null)
  const [state, setState] = useState<MessageStoreConnectionState>({
    status: "connecting",
    connectionUrl: "",
    subscriptionKeys: [],
    lastMessageType: null,
    lastNotificationKey: null,
    lastVersion: null,
    lastEventAt: null,
  })

  const connection = useMemo(
    () =>
      new RawMessageStoreConnection({
        baseUrl: getMessageStoreBaseUrl(),
        onStatusChange(status) {
          setState((previous) => ({
            ...previous,
            status,
            connectionUrl: connection.getCurrentConnectionUrl(),
            subscriptionKeys: connection.getSubscriptionKeys(),
          }))
        },
        onMessage(message) {
          sidebarBridgeRef.current?.handleMessage(message)

          setState((previous) => ({
            ...previous,
            connectionUrl: connection.getCurrentConnectionUrl(),
            subscriptionKeys: connection.getSubscriptionKeys(),
            lastMessageType: message.type,
            lastNotificationKey:
              message.type === "notification" ? message.key : previous.lastNotificationKey,
            lastVersion:
              message.type === "notification" ? message.version : previous.lastVersion,
            lastEventAt: Date.now(),
          }))
        },
      }),
    [],
  )

  useEffect(() => {
    connection.connect()
    setState((previous) => ({
      ...previous,
      connectionUrl: connection.getCurrentConnectionUrl(),
      subscriptionKeys: connection.getSubscriptionKeys(),
    }))

    return () => {
      connection.disconnect()
    }
  }, [connection])

  const retainRecordPointers = useCallback(
    (recordPointers: RecordPointer[]) => {
      const subscriptionCountByKey = subscriptionCountByKeyRef.current
      const recordPointerBySubscriptionKey =
        recordPointerBySubscriptionKeyRef.current
      const keysToSubscribe: string[] = []

      for (const recordPointer of recordPointers) {
        const key = getRecordVersionEventKey(recordPointer)
        const previousCount = subscriptionCountByKey.get(key) ?? 0
        subscriptionCountByKey.set(key, previousCount + 1)
        recordPointerBySubscriptionKey.set(key, recordPointer)
        if (previousCount === 0) {
          keysToSubscribe.push(key)
        }
      }

      if (keysToSubscribe.length > 0) {
        connection.subscribeMany(keysToSubscribe)
      }

      setState((previous) => ({
        ...previous,
        subscriptionKeys: connection.getSubscriptionKeys(),
      }))
    },
    [connection],
  )

  const releaseRecordPointers = useCallback(
    (recordPointers: RecordPointer[]) => {
      const subscriptionCountByKey = subscriptionCountByKeyRef.current
      const recordPointerBySubscriptionKey =
        recordPointerBySubscriptionKeyRef.current
      const keysToUnsubscribe: string[] = []

      for (const recordPointer of recordPointers) {
        const key = getRecordVersionEventKey(recordPointer)
        const previousCount = subscriptionCountByKey.get(key)
        if (!previousCount) {
          continue
        }

        if (previousCount === 1) {
          subscriptionCountByKey.delete(key)
          recordPointerBySubscriptionKey.delete(key)
          keysToUnsubscribe.push(key)
          continue
        }

        subscriptionCountByKey.set(key, previousCount - 1)
      }

      if (keysToUnsubscribe.length > 0) {
        connection.unsubscribeMany(keysToUnsubscribe)
      }

      setState((previous) => ({
        ...previous,
        subscriptionKeys: connection.getSubscriptionKeys(),
      }))
    },
    [connection],
  )

  const reconnect = useCallback(() => {
    connection.connect()
    setState((previous) => ({
      ...previous,
      connectionUrl: connection.getCurrentConnectionUrl(),
      subscriptionKeys: connection.getSubscriptionKeys(),
    }))
  }, [connection])

  useEffect(() => {
    const sidebarBridge = new SidebarMessageStoreBridge({
      favorites: runtime.data.collections.favorites,
      recents: runtime.data.collections.recents,
      retainRecordPointers,
      releaseRecordPointers,
      syncRecordValues: runtime.api.records.syncRecordValues.bind(
        runtime.api.records,
      ),
    })

    sidebarBridgeRef.current = sidebarBridge
    sidebarBridge.start()

    return () => {
      sidebarBridge.stop()
      sidebarBridgeRef.current = null
    }
  }, [
    releaseRecordPointers,
    retainRecordPointers,
    runtime.api.records,
    runtime.data.collections.favorites,
    runtime.data.collections.recents,
  ])

  const value = useMemo<MessageStoreConnectionContextValue>(
    () => ({
      ...state,
      releaseRecordPointers,
      reconnect,
      retainRecordPointers,
    }),
    [reconnect, releaseRecordPointers, retainRecordPointers, state],
  )

  return (
    <MessageStoreConnectionContext.Provider value={value}>
      {children}
    </MessageStoreConnectionContext.Provider>
  )
}

export function useMessageStoreConnection() {
  const context = useContext(MessageStoreConnectionContext)
  if (!context) {
    throw new Error(
      "useMessageStoreConnection must be used within MessageStoreConnectionProvider",
    )
  }

  return context
}

function getNormalizedRecordPointers(
  recordPointers: RecordPointer[],
): RecordPointer[] {
  const pointersByKey = new Map<string, RecordPointer>()
  for (const recordPointer of recordPointers) {
    pointersByKey.set(getRecordPointerKey(recordPointer), recordPointer)
  }

  return [...pointersByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, recordPointer]) => recordPointer)
}

export function useRegisterMessageStoreRecordPointers(
  recordPointers: RecordPointer[],
) {
  const { releaseRecordPointers, retainRecordPointers } =
    useMessageStoreConnection()
  const previousRecordPointersRef = useRef<RecordPointer[]>([])
  const normalizedRecordPointers = useMemo(
    () => getNormalizedRecordPointers(recordPointers),
    [recordPointers],
  )

  useEffect(() => {
    const previousPointersByKey = new Map(
      previousRecordPointersRef.current.map((recordPointer) => [
        getRecordPointerKey(recordPointer),
        recordPointer,
      ]),
    )
    const nextPointersByKey = new Map(
      normalizedRecordPointers.map((recordPointer) => [
        getRecordPointerKey(recordPointer),
        recordPointer,
      ]),
    )

    const addedPointers = normalizedRecordPointers.filter((recordPointer) => {
      const key = getRecordPointerKey(recordPointer)
      return !previousPointersByKey.has(key)
    })
    const removedPointers = previousRecordPointersRef.current.filter(
      (recordPointer) => {
        const key = getRecordPointerKey(recordPointer)
        return !nextPointersByKey.has(key)
      },
    )

    if (addedPointers.length > 0) {
      retainRecordPointers(addedPointers)
    }

    if (removedPointers.length > 0) {
      releaseRecordPointers(removedPointers)
    }

    previousRecordPointersRef.current = normalizedRecordPointers
  }, [normalizedRecordPointers, releaseRecordPointers, retainRecordPointers])

  useEffect(() => {
    return () => {
      if (previousRecordPointersRef.current.length > 0) {
        releaseRecordPointers(previousRecordPointersRef.current)
        previousRecordPointersRef.current = []
      }
    }
  }, [releaseRecordPointers])
}
