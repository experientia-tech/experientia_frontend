import 'axios'

declare module 'axios' {
  export interface AxiosRequestConfig {
    meta?: {
      /** Skip global loading overlay */
      silent?: boolean
      /** Skip automatic error dialog */
      skipErrorDialog?: boolean
    }
  }
}
