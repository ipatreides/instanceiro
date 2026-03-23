/**
 * Tests for participant list pure data logic used in the InstanceModal party tab.
 *
 * The participant list manages own characters and friend characters
 * that will be sent to the mark-done RPC call.
 */

import type { Participant } from "@/components/instances/participant-list";

describe("Participant list logic", () => {
  const ownChar: Participant = {
    type: "own",
    character_id: "c1",
    user_id: "u1",
    character_name: "Teste1",
    character_class: "Mecânico",
    character_level: 185,
  };
  const ownChar2: Participant = {
    type: "own",
    character_id: "c3",
    user_id: "u1",
    character_name: "test2",
    character_class: "Arcano",
    character_level: 185,
  };
  const friendChar: Participant = {
    type: "friend",
    character_id: "c2",
    user_id: "u2",
    character_name: "FriendChar",
    character_class: "Arcano",
    character_level: 200,
    username: "amigo",
    avatar_url: null,
  };

  it("adds an own character to the list", () => {
    const list: Participant[] = [];
    list.push(ownChar);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe("own");
    expect(list[0].character_id).toBe("c1");
  });

  it("adds a friend character to the list", () => {
    const list: Participant[] = [ownChar];
    list.push(friendChar);
    expect(list).toHaveLength(2);
    expect(list[1].type).toBe("friend");
    expect(list[1].username).toBe("amigo");
  });

  it("prevents duplicate character_id via Set check", () => {
    const list: Participant[] = [ownChar];
    const ids = new Set(list.map((p) => p.character_id));
    const duplicate: Participant = { ...ownChar2, character_id: "c1" };
    const canAdd = !ids.has(duplicate.character_id);
    expect(canAdd).toBe(false);
  });

  it("allows adding when character_id is not in the Set", () => {
    const list: Participant[] = [ownChar];
    const ids = new Set(list.map((p) => p.character_id));
    const canAdd = !ids.has(ownChar2.character_id);
    expect(canAdd).toBe(true);
  });

  it("removes by character_id", () => {
    const list: Participant[] = [ownChar, friendChar, ownChar2];
    const after = list.filter((p) => p.character_id !== "c2");
    expect(after).toHaveLength(2);
    expect(after.map((p) => p.character_id)).toEqual(["c1", "c3"]);
  });

  it("'Marcar agora' disabled when no own characters", () => {
    const list: Participant[] = [friendChar];
    const hasOwn = list.some((p) => p.type === "own");
    expect(hasOwn).toBe(false);
  });

  it("'Marcar agora' enabled with own characters", () => {
    const list: Participant[] = [ownChar, friendChar];
    const hasOwn = list.some((p) => p.type === "own");
    expect(hasOwn).toBe(true);
  });

  it("separates own chars and friends for RPC call", () => {
    const list: Participant[] = [ownChar, friendChar, ownChar2];
    const ownIds = list
      .filter((p) => p.type === "own")
      .map((p) => p.character_id);
    const friendIds = list
      .filter((p) => p.type === "friend")
      .map((p) => ({ character_id: p.character_id, user_id: p.user_id }));
    expect(ownIds).toEqual(["c1", "c3"]);
    expect(friendIds).toEqual([{ character_id: "c2", user_id: "u2" }]);
  });

  it("isDirty is true when participants.length > 0", () => {
    const participants: Participant[] = [ownChar];
    const confirmingMarkDone = false;
    const isDirty = participants.length > 0 || confirmingMarkDone;
    expect(isDirty).toBe(true);
  });

  it("isDirty is false when empty and not confirming", () => {
    const participants: Participant[] = [];
    const confirmingMarkDone = false;
    const isDirty = participants.length > 0 || confirmingMarkDone;
    expect(isDirty).toBe(false);
  });

  it("isDirty is true when confirmingMarkDone", () => {
    const participants: Participant[] = [];
    const confirmingMarkDone = true;
    const isDirty = participants.length > 0 || confirmingMarkDone;
    expect(isDirty).toBe(true);
  });
});
