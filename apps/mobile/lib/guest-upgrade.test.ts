import { describe, expect, it, vi } from "vitest";

import { confirmGuestEmail, requestGuestEmail } from "./guest-upgrade";

const guestId = "00000000-0000-4013-8000-000000000001";

describe("guest email upgrade", () => {
  it("adds email to the current anonymous user without signing into a new account", async () => {
    const auth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: guestId, is_anonymous: true } },
        error: null,
      }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    };

    await requestGuestEmail(auth, guestId, "  PERSON@example.invalid ");
    expect(auth.updateUser).toHaveBeenCalledWith({
      email: "person@example.invalid",
    });
  });

  it("refuses to upgrade a different or permanent account", async () => {
    const auth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: guestId, is_anonymous: false } },
        error: null,
      }),
      updateUser: vi.fn(),
    };

    await expect(
      requestGuestEmail(auth, guestId, "person@example.invalid"),
    ).rejects.toThrow("not_guest");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("confirms the email change and keeps the same owner id", async () => {
    const auth = {
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      refreshSession: vi.fn().mockResolvedValue({
        data: { user: { id: guestId, is_anonymous: false } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: guestId, is_anonymous: false } },
        error: null,
      }),
    };

    await confirmGuestEmail(auth, guestId, "person@example.invalid", "123456");
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "person@example.invalid",
      token: "123456",
      type: "email_change",
    });
  });

  it("does not report success if verification switches ownership", async () => {
    const auth = {
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      refreshSession: vi
        .fn()
        .mockResolvedValue({ data: { user: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "other", is_anonymous: false } },
        error: null,
      }),
    };

    await expect(
      confirmGuestEmail(auth, guestId, "person@example.invalid", "123456"),
    ).rejects.toThrow("identity_changed");
  });
});
