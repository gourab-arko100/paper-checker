import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { assess } from "../lib/providers";

const sample = "Private document marker that must never be logged.";
const key = "private-provider-key-for-test";

function temporaryEnv(t: TestContext, name: string, value: string) {
  const original = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  });
}

test("Gemini SDK errors are classified without logging the raw response or SDK error", async (t) => {
  temporaryEnv(t, "GEMINI_API_KEY", key);
  const cases = [
    [
      400,
      "INVALID_ARGUMENT",
      "API_KEY_INVALID",
      "Bad credential " + key,
      /API key is missing, invalid/,
      "API_KEY_INVALID",
    ],
    [
      404,
      "NOT_FOUND",
      null,
      "Model missing " + sample,
      /configured model is unavailable/,
      "NOT_FOUND",
    ],
    [
      400,
      "INVALID_ARGUMENT",
      null,
      "GenerateContentRequest.response_json_schema is invalid. " + sample,
      /structured output schema/,
      "INVALID_ARGUMENT",
    ],
    [
      400,
      "INVALID_ARGUMENT",
      null,
      "A parameter is invalid. " + sample,
      /request parameters/,
      "INVALID_ARGUMENT",
    ],
    [
      400,
      "FAILED_PRECONDITION",
      null,
      "Free tier unavailable in this region " + key,
      /billing settings/,
      "FAILED_PRECONDITION",
    ],
    [
      429,
      "RESOURCE_EXHAUSTED",
      null,
      sample,
      /rate limit or quota/,
      "RESOURCE_EXHAUSTED",
    ],
    [
      503,
      "UNAVAILABLE",
      null,
      sample,
      /temporarily unavailable/,
      "UNAVAILABLE",
    ],
  ] as const;
  const warn = t.mock.method(console, "warn", () => {});
  let index = 0;
  t.mock.method(globalThis, "fetch", async () => {
    const [status, code, reason, message] = cases[index++];
    return Response.json(
      {
        error: {
          code: status,
          status: code,
          message,
          details: reason ? [{ reason }] : [],
        },
      },
      { status },
    );
  });
  for (const [status, , , , expected, code] of cases) {
    await assert.rejects(
      assess(sample, { requests: 0, characters: 0 }),
      expected,
    );
    const log = warn.mock.calls.at(-1)?.arguments[1] as {
      httpStatus: number;
      providerCode: string;
    };
    assert.equal(log.httpStatus, status);
    assert.equal(log.providerCode, code);
  }
  assert.doesNotMatch(
    JSON.stringify(warn.mock.calls.map((call) => call.arguments)),
    /Private document marker|private-provider-key/,
  );
});

test("malformed Gemini outputs cannot produce writing scores", async (t) => {
  temporaryEnv(t, "GEMINI_API_KEY", key);
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      candidates: [
        {
          content: { role: "model", parts: [{ text: '{"scores":{}}' }] },
          finishReason: "STOP",
        },
      ],
    }),
  );
  await assert.rejects(
    assess(sample, { requests: 0, characters: 0 }),
    /unexpected or incomplete response/,
  );
});
