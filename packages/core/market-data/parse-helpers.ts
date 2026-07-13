// packages/core/market-data/parse-helpers.ts

export type ParseError =
  | { kind: "missing_field"; provider: string; field: string }
  | { kind: "invalid_type"; provider: string; field: string; expected: string; got: string }
  | { kind: "empty_response"; provider: string };

function formatParseError(e: ParseError): string {
  switch (e.kind) {
    case "missing_field":
      return `Missing required field '${e.field}' from provider '${e.provider}'`;
    case "invalid_type":
      return `Invalid type for field '${e.field}' from provider '${e.provider}': expected ${e.expected}, got ${e.got}`;
    case "empty_response":
      return `Provider '${e.provider}' returned no usable data`;
  }
}

export class ParseFailure extends Error {
  readonly error: ParseError;
  constructor(error: ParseError) {
    super(formatParseError(error));
    this.name = "ParseFailure";
    this.error = error;
  }
}

function get(value: unknown, field: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[field];
}

function toF64(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n) && v.trim() !== "") return n;
  }
  return undefined;
}

function toI64(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n) && v.trim() !== "") return Math.trunc(n);
  }
  return undefined;
}

export function parseRequiredF64(value: unknown, field: string, provider: string): number {
  const raw = get(value, field);
  if (raw === undefined) {
    throw new ParseFailure({ kind: "missing_field", provider, field });
  }
  const n = toF64(raw);
  if (n === undefined) {
    throw new ParseFailure({
      kind: "invalid_type",
      provider,
      field,
      expected: "number or numeric string",
      got: JSON.stringify(raw),
    });
  }
  return n;
}

export function parseOptionalF64(value: unknown, field: string, provider: string): number | null {
  const raw = get(value, field);
  if (raw === undefined || raw === null) return null;
  const n = toF64(raw);
  if (n === undefined) {
    throw new ParseFailure({
      kind: "invalid_type",
      provider,
      field,
      expected: "number or numeric string",
      got: JSON.stringify(raw),
    });
  }
  return n;
}

export function parseRequiredI64(value: unknown, field: string, provider: string): number {
  const raw = get(value, field);
  if (raw === undefined) {
    throw new ParseFailure({ kind: "missing_field", provider, field });
  }
  const n = toI64(raw);
  if (n === undefined) {
    throw new ParseFailure({
      kind: "invalid_type",
      provider,
      field,
      expected: "integer or numeric string",
      got: JSON.stringify(raw),
    });
  }
  return n;
}

export function parseOptionalI64(value: unknown, field: string, provider: string): number | null {
  const raw = get(value, field);
  if (raw === undefined || raw === null) return null;
  const n = toI64(raw);
  if (n === undefined) {
    throw new ParseFailure({
      kind: "invalid_type",
      provider,
      field,
      expected: "integer or numeric string",
      got: JSON.stringify(raw),
    });
  }
  return n;
}
