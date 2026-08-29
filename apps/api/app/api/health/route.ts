export const healthResponse = {
  status: "ok",
  service: "miraio-lens-api",
  version: "0.17.0",
} as const;

export function GET(): Response {
  return Response.json(healthResponse);
}
