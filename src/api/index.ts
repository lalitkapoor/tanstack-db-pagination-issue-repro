import { MessagesApi } from "./messages"
import { ThreadsApi } from "./threads"

export class Api {
  public readonly messages: MessagesApi
  public readonly threads: ThreadsApi

  public constructor() {
    this.messages = new MessagesApi()
    this.threads = new ThreadsApi()
  }
}
