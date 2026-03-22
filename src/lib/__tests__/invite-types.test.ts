import type { ScheduleInvite, SchedulePlaceholder, InviteData, ScheduleParticipant } from "@/lib/types";

describe("Schedule Invite Types", () => {
  describe("ScheduleInvite", () => {
    it("has correct structure", () => {
      const invite: ScheduleInvite = {
        id: "test-uuid",
        schedule_id: "schedule-uuid",
        code: "aBcD1234",
        created_by: "user-uuid",
        created_at: "2026-03-22T00:00:00Z",
      };
      expect(invite.code).toBe("aBcD1234");
      expect(invite.code).toHaveLength(8);
    });

    it("code should be 8 characters alphanumeric", () => {
      const validCode = "gLPNILbd";
      expect(validCode).toMatch(/^[a-zA-Z0-9]{8}$/);
    });

    it("rejects invalid code formats", () => {
      const invalidCodes = ["short", "toolongcode123", "has space", "special!@"];
      for (const code of invalidCodes) {
        expect(code).not.toMatch(/^[a-zA-Z0-9]{8}$/);
      }
    });
  });

  describe("SchedulePlaceholder", () => {
    it("has correct structure when unclaimed", () => {
      const placeholder: SchedulePlaceholder = {
        id: "test-uuid",
        schedule_id: "schedule-uuid",
        character_name: "Sniffy",
        character_class: "Arcano",
        added_by: "user-uuid",
        claimed_by: null,
        claimed_character_id: null,
        created_at: "2026-03-22T00:00:00Z",
      };
      expect(placeholder.claimed_by).toBeNull();
      expect(placeholder.claimed_character_id).toBeNull();
    });

    it("has correct structure when claimed", () => {
      const placeholder: SchedulePlaceholder = {
        id: "test-uuid",
        schedule_id: "schedule-uuid",
        character_name: "Sniffy",
        character_class: "Arcano",
        added_by: "user-uuid",
        claimed_by: "claimer-uuid",
        claimed_character_id: "character-uuid",
        created_at: "2026-03-22T00:00:00Z",
      };
      expect(placeholder.claimed_by).toBe("claimer-uuid");
      expect(placeholder.claimed_character_id).toBe("character-uuid");
    });
  });

  describe("InviteData", () => {
    it("has correct structure for open schedule", () => {
      const data: InviteData = {
        schedule: {
          id: "schedule-uuid",
          instance_id: 1,
          character_id: "char-uuid",
          created_by: "user-uuid",
          scheduled_at: "2026-03-22T12:00:00Z",
          status: "open",
          message: "Vamos!",
        },
        instance: {
          id: 1,
          name: "Torre sem Fim",
          start_map: "Alberta",
          liga_tier: null,
          level_required: 50,
        },
        creator: {
          id: "user-uuid",
          username: "ceceu",
          avatar_url: null,
        },
        participants: [],
        placeholders: [],
        user_already_joined: false,
      };
      expect(data.schedule.status).toBe("open");
      expect(data.user_already_joined).toBe(false);
    });

    it("participant count calculation includes placeholders", () => {
      const participants: ScheduleParticipant[] = [
        {
          schedule_id: "s1",
          character_id: "c1",
          user_id: "u1",
          message: null,
          created_at: "2026-03-22T00:00:00Z",
        },
        {
          schedule_id: "s1",
          character_id: "c2",
          user_id: "u2",
          message: null,
          created_at: "2026-03-22T00:00:00Z",
        },
      ];

      const placeholders: SchedulePlaceholder[] = [
        {
          id: "p1",
          schedule_id: "s1",
          character_name: "Sniffy",
          character_class: "Arcano",
          added_by: "u1",
          claimed_by: null,
          claimed_character_id: null,
          created_at: "2026-03-22T00:00:00Z",
        },
      ];

      const unclaimedPlaceholders = placeholders.filter((p) => !p.claimed_by);
      // Total = participants + unclaimed placeholders + 1 (creator)
      const totalCount = participants.length + unclaimedPlaceholders.length + 1;
      expect(totalCount).toBe(4); // 2 participants + 1 placeholder + 1 creator
    });

    it("claimed placeholders are not counted in total", () => {
      const placeholders: SchedulePlaceholder[] = [
        {
          id: "p1",
          schedule_id: "s1",
          character_name: "Sniffy",
          character_class: "Arcano",
          added_by: "u1",
          claimed_by: "u3",
          claimed_character_id: "c3",
          created_at: "2026-03-22T00:00:00Z",
        },
        {
          id: "p2",
          schedule_id: "s1",
          character_name: "Other",
          character_class: "Mago",
          added_by: "u1",
          claimed_by: null,
          claimed_character_id: null,
          created_at: "2026-03-22T00:00:00Z",
        },
      ];

      const unclaimedCount = placeholders.filter((p) => !p.claimed_by).length;
      expect(unclaimedCount).toBe(1); // Only the unclaimed one
    });

    it("max 12 participants check", () => {
      const participantCount = 8;
      const unclaimedPlaceholders = 2;
      const creatorCount = 1;
      const total = participantCount + unclaimedPlaceholders + creatorCount;
      expect(total).toBe(11);
      expect(total < 12).toBe(true); // Can still add one more

      const fullTotal = 9 + 2 + 1;
      expect(fullTotal).toBe(12);
      expect(fullTotal >= 12).toBe(true); // Schedule is full
    });

    it("schedule statuses are valid", () => {
      const validStatuses = ["open", "completed", "expired"];
      for (const status of validStatuses) {
        const data: InviteData = {
          schedule: {
            id: "s",
            instance_id: 1,
            character_id: "c",
            created_by: "u",
            scheduled_at: "2026-03-22T00:00:00Z",
            status: status as "open" | "completed" | "expired",
            message: null,
          },
          instance: { id: 1, name: "Test", start_map: null, liga_tier: null, level_required: 1 },
          creator: { id: "u", username: "test", avatar_url: null },
          participants: [],
          placeholders: [],
          user_already_joined: false,
        };
        expect(["open", "completed", "expired"]).toContain(data.schedule.status);
      }
    });
  });
});
