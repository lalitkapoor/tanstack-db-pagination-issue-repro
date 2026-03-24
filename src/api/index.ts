import { RecordsApi } from "./records"
import { MessagesApi } from "./messages"
import { SidebarApi } from "./sidebar"
import { ThreadsApi } from "./threads"

export class Api {
  public readonly messages: MessagesApi
  public readonly records: RecordsApi
  public readonly sidebar: SidebarApi
  public readonly threads: ThreadsApi

  public constructor() {
    this.messages = new MessagesApi()
    this.records = new RecordsApi()
    this.sidebar = new SidebarApi()
    this.threads = new ThreadsApi()
  }
}
