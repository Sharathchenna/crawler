"use client";

// Typed JSON helper: workerd runtime types declare Response.json() as
// unknown, so call sites cast once here instead of everywhere.
export async function apiJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
