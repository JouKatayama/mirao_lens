import { z } from "zod";

export const hubSpotExportRequestSchema = z
  .object({
    scan_id: z.string().uuid(),
    contact: z
      .object({
        email: z.string().email().max(254),
        firstname: z.string().trim().max(255).optional(),
        lastname: z.string().trim().max(255).optional(),
        company: z.string().trim().max(255).optional(),
        jobtitle: z.string().trim().max(255).optional(),
        phone: z.string().trim().max(100).optional(),
      })
      .strict(),
    reviewed_note: z.string().trim().min(1).max(4000).optional(),
    reviewed_action: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export type HubSpotExportRequest = z.infer<typeof hubSpotExportRequestSchema>;
