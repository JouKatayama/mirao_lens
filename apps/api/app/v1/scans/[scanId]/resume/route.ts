import {
  createPostScanResumeHandler,
  productionScanResumeDependencies,
  SCAN_RESUME_OPTIONS,
} from "../../../../../lib/scan-resume";

export const runtime = "nodejs";
// The resumed stages run in this route's `after()` callback, so it needs the
// same budget as the upload route that normally runs them.
export const maxDuration = 60;

export const POST = createPostScanResumeHandler(
  productionScanResumeDependencies,
);
export { SCAN_RESUME_OPTIONS as OPTIONS };
