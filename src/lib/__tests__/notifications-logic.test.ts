/**
 * Tests for notification data logic used in the notifications system.
 *
 * AppNotification has: id, user_id, type, payload, is_read, responded,
 * expires_at, created_at. These tests cover filtering, counting, and
 * optimistic update patterns without rendering React.
 */

import type { AppNotification } from "@/lib/types";

function makeNotification(
  overrides: Partial<AppNotification> = {}
): AppNotification {
  return {
    id: "n1",
    user_id: "u1",
    type: "party_confirm",
    payload: {
      party_id: "p1",
      instance_name: "Sala de Odin",
      created_by_username: "host",
    },
    is_read: false,
    responded: false,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Notification logic", () => {
  it("unread count excludes responded notifications", () => {
    const notifications: AppNotification[] = [
      makeNotification({ id: "n1", responded: true, is_read: false }),
      makeNotification({ id: "n2", responded: false, is_read: false }),
      makeNotification({ id: "n3", responded: false, is_read: false }),
    ];
    const unread = notifications.filter((n) => !n.is_read && !n.responded);
    expect(unread).toHaveLength(2);
  });

  it("unread count excludes read notifications", () => {
    const notifications: AppNotification[] = [
      makeNotification({ id: "n1", is_read: true }),
      makeNotification({ id: "n2", is_read: false }),
    ];
    const unread = notifications.filter((n) => !n.is_read && !n.responded);
    expect(unread).toHaveLength(1);
    expect(unread[0].id).toBe("n2");
  });

  it("filters expired unresponded notifications", () => {
    const expired = makeNotification({
      id: "n1",
      responded: false,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const active = makeNotification({
      id: "n2",
      responded: false,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const notifications = [expired, active];

    const now = new Date();
    const actionable = notifications.filter(
      (n) => !n.responded && new Date(n.expires_at) > now
    );
    expect(actionable).toHaveLength(1);
    expect(actionable[0].id).toBe("n2");
  });

  it("keeps expired but responded notifications", () => {
    const expiredResponded = makeNotification({
      id: "n1",
      responded: true,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const notifications = [expiredResponded];

    // Responded notifications are kept regardless of expiry (for history)
    const visible = notifications.filter(
      (n) => n.responded || new Date(n.expires_at) > new Date()
    );
    expect(visible).toHaveLength(1);
  });

  it("validates party_confirm payload has required fields", () => {
    const n = makeNotification({
      type: "party_confirm",
      payload: {
        party_id: "p1",
        instance_name: "Sala de Odin",
        created_by_username: "host",
      },
    });
    expect(n.payload).toHaveProperty("party_id");
    expect(n.payload).toHaveProperty("instance_name");
    expect(n.payload).toHaveProperty("created_by_username");
  });

  it("optimistic update marks notification as responded", () => {
    const notifications: AppNotification[] = [
      makeNotification({ id: "n1" }),
      makeNotification({ id: "n2" }),
    ];

    const targetId = "n1";
    const updated = notifications.map((n) =>
      n.id === targetId ? { ...n, responded: true } : n
    );

    expect(updated[0].responded).toBe(true);
    expect(updated[1].responded).toBe(false);
  });

  it("multiple notifications: only matching ID updated", () => {
    const notifications: AppNotification[] = [
      makeNotification({ id: "n1", is_read: false }),
      makeNotification({ id: "n2", is_read: false }),
      makeNotification({ id: "n3", is_read: false }),
    ];

    const targetId = "n2";
    const updated = notifications.map((n) =>
      n.id === targetId ? { ...n, is_read: true, responded: true } : n
    );

    expect(updated[0].is_read).toBe(false);
    expect(updated[0].responded).toBe(false);
    expect(updated[1].is_read).toBe(true);
    expect(updated[1].responded).toBe(true);
    expect(updated[2].is_read).toBe(false);
    expect(updated[2].responded).toBe(false);
  });
});
