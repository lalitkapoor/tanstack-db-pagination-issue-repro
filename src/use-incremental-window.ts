import { useCallback, useEffect, useMemo, useState } from "react"

export interface UseIncrementalWindowOptions<TItem, TCursor> {
  items: Array<TItem>
  pageSize: number
  resetKey: unknown
  getLoadMoreCursor: (items: Array<TItem>) => TCursor | null
  loadMoreRemote: (cursor: TCursor) => Promise<number>
}

export interface UseIncrementalWindowResult<TItem> {
  visibleItems: Array<TItem>
  visibleCount: number
  canLoadMore: boolean
  isLoadingMore: boolean
  loadMore: () => Promise<void>
}

export function useIncrementalWindow<TItem, TCursor>({
  items,
  pageSize,
  resetKey,
  getLoadMoreCursor,
  loadMoreRemote,
}: UseIncrementalWindowOptions<TItem, TCursor>): UseIncrementalWindowResult<TItem> {
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreRemote, setHasMoreRemote] = useState(true)

  useEffect(() => {
    setVisibleCount(pageSize)
    setHasMoreRemote(true)
    setIsLoadingMore(false)
  }, [pageSize, resetKey])

  const visibleItems = useMemo(
    () => items.slice(Math.max(0, items.length - visibleCount)),
    [items, visibleCount]
  )

  const canLoadMore =
    items.length > visibleCount ||
    (hasMoreRemote && items.length >= visibleCount && items.length > 0)

  const loadMore = useCallback(async () => {
    if (isLoadingMore) return

    const nextVisibleCount = visibleCount + pageSize
    if (items.length >= nextVisibleCount) {
      setVisibleCount(nextVisibleCount)
      return
    }

    const cursor = getLoadMoreCursor(items)
    if (cursor == null) return

    setIsLoadingMore(true)
    try {
      const fetchedCount = await loadMoreRemote(cursor)
      setVisibleCount((count) => count + pageSize)
      if (fetchedCount < pageSize) {
        setHasMoreRemote(false)
      }
    } finally {
      setIsLoadingMore(false)
    }
  }, [getLoadMoreCursor, isLoadingMore, items, loadMoreRemote, pageSize, visibleCount])

  return {
    visibleItems,
    visibleCount,
    canLoadMore,
    isLoadingMore,
    loadMore,
  }
}
