import { HttpException, HttpStatus } from "@nestjs/common";
import { msg, type MessageCode } from "@krama/shared";

/** Throw an error carrying an FSD message ID and its exact text (FSD-G04). */
export function fail(code: MessageCode, status: HttpStatus, vars: Record<string, string | number> = {}): never {
  throw new HttpException(msg(code, vars), status);
}

export function problem(message: string, status: HttpStatus, code = "KRAMA"): never {
  throw new HttpException({ code, message }, status);
}
