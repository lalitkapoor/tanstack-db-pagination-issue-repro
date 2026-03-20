import { MessagesApi } from "./messages"
import { SidebarApi } from "./sidebar"
import { ThreadsApi } from "./threads"

export class Api {
  public readonly messages: MessagesApi
  public readonly sidebar: SidebarApi
  public readonly threads: ThreadsApi

  public constructor() {
    this.messages = new MessagesApi()
    this.sidebar = new SidebarApi()
    this.threads = new ThreadsApi()
  }
}
