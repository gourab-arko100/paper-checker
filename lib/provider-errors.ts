export class ProviderError extends Error {}
type Provider = "Gemini";
type Failure =
  | "authentication"
  | "permission"
  | "billing"
  | "rate_limit"
  | "request_capacity"
  | "invalid_model"
  | "invalid_parameters"
  | "invalid_schema"
  | "outage"
  | "transport"
  | "timeout"
  | "unexpected_response";

const messages: Record<Failure, string> = {
  authentication: "The API key is missing, invalid, expired, or blocked.",
  permission:
    "The API key or project does not have permission for this request.",
  billing:
    "The API account is blocked by its plan, credits, or billing settings.",
  rate_limit:
    "The provider rate limit or quota was reached. Retry after it resets.",
  request_capacity:
    "The request exceeds the provider’s input or per-request allowance.",
  invalid_model:
    "The configured model is unavailable to this API project. Check GEMINI_MODEL and the model list for your API key.",
  invalid_parameters: "The provider rejected the request parameters.",
  invalid_schema: "The provider rejected the structured output schema.",
  outage: "The provider is temporarily unavailable. Retry later.",
  transport: "The provider connection could not be completed. Retry later.",
  timeout: "The provider request timed out. Retry later.",
  unexpected_response:
    "The provider returned an unexpected or incomplete response.",
};

// Raw provider messages may contain the submitted document, a credential or a URL.
// Use their known patterns only to select a fixed diagnostic. Never emit raw fields.
function failure(
  provider: Provider,
  kind: Failure,
  status: number | null,
  providerCode: string | number | null,
) {
  const message = provider + ": " + messages[kind];
  console.warn("Analysis provider failure", {
    provider,
    kind,
    httpStatus: status,
    providerCode,
    message,
  });
  return new ProviderError(message);
}

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function string(value: unknown) {
  return typeof value === "string" ? value : "";
}
function httpStatus(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value < 600
    ? value
    : null;
}

const googleCodes = [
  "INVALID_ARGUMENT",
  "FAILED_PRECONDITION",
  "PERMISSION_DENIED",
  "UNAUTHENTICATED",
  "NOT_FOUND",
  "RESOURCE_EXHAUSTED",
  "INTERNAL",
  "UNAVAILABLE",
  "DEADLINE_EXCEEDED",
  "API_KEY_INVALID",
  "API_KEY_EXPIRED",
  "API_KEY_SERVICE_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED",
  "API_KEY_IP_ADDRESS_BLOCKED",
  "RATE_LIMIT_EXCEEDED",
  "QUOTA_EXCEEDED",
];
function knownGoogleCode(value: unknown) {
  return typeof value === "string" && googleCodes.includes(value)
    ? value
    : null;
}
export function geminiFailure(error: unknown) {
  const thrown = fields(error);
  const status = httpStatus(thrown.status);
  if (!status) return providerConnectionFailure("Gemini", error);
  let response: Record<string, unknown> = {};
  try {
    response = fields(fields(JSON.parse(string(thrown.message))).error);
  } catch {
    // The SDK may receive a non-JSON upstream failure.
  }
  const details = Array.isArray(response.details) ? response.details : [];
  const reason = details
    .map((detail) => knownGoogleCode(fields(detail).reason))
    .find(Boolean);
  const code =
    reason ?? knownGoogleCode(response.status) ?? httpStatus(response.code);
  const message = string(response.message);
  return failure(
    "Gemini",
    geminiFailureKind(status, code, message),
    status,
    code,
  );
}

function geminiFailureKind(
  status: number,
  code: string | number | null,
  message: string,
): Failure {
  if (
    status === 401 ||
    code === "UNAUTHENTICATED" ||
    (typeof code === "string" && code.startsWith("API_KEY_")) ||
    /\bAPI key (?:not valid|expired|is invalid)\b/i.test(message)
  )
    return "authentication";
  if (status === 403 || code === "PERMISSION_DENIED") return "permission";
  if (status === 429 || code === "RESOURCE_EXHAUSTED") return "rate_limit";
  if (status === 408 || status === 504 || code === "DEADLINE_EXCEEDED")
    return "timeout";
  if (status >= 500) return "outage";
  if (
    status === 404 ||
    code === "NOT_FOUND" ||
    /\bmodel\b.{0,150}\b(?:not found|not supported|not available)\b/i.test(
      message,
    )
  )
    return "invalid_model";
  if (
    code === "FAILED_PRECONDITION" &&
    /\b(?:billing|free tier|country|region)\b/i.test(message)
  )
    return "billing";
  if (
    /\b(?:response[_ ]?(?:json[_ ]?)?schema|schema|valid states)\b/i.test(
      message,
    )
  )
    return "invalid_schema";
  if (
    status === 413 ||
    /\b(?:token limit|context length|input token count|too many tokens)\b/i.test(
      message,
    )
  )
    return "request_capacity";
  return status === 400 || code === "INVALID_ARGUMENT"
    ? "invalid_parameters"
    : "unexpected_response";
}

export function providerConnectionFailure(
  provider: Provider,
  error: unknown,
  signal?: AbortSignal,
) {
  const name = fields(error).name;
  return failure(
    provider,
    signal?.aborted || name === "AbortError" || name === "TimeoutError"
      ? "timeout"
      : "transport",
    null,
    null,
  );
}
export function invalidProviderResponse(
  provider: Provider,
  status: number | null = null,
) {
  return failure(provider, "unexpected_response", status, null);
}
