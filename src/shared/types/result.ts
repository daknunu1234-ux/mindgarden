import type { ErrorCode } from './errors'

export type Meta = { page?: number; limit?: number; total?: number }

export type ActionResult<T> =
  | { success: true; data: T; meta?: Meta }
  | { success: false; error: { code: ErrorCode; message: string } }

export const ok = <T>(data: T, meta?: Meta): ActionResult<T> => ({ success: true, data, meta })

export const fail = (code: ErrorCode, message: string): ActionResult<never> => ({
  success: false,
  error: { code, message },
})
