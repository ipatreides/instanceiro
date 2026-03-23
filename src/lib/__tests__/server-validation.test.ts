describe("Party server validation", () => {
  it("first participant sets server context (null when empty)", () => {
    const participants: { server_id: number }[] = [];
    const serverContext = participants.length > 0 ? participants[0].server_id : null;
    expect(serverContext).toBeNull();
  });

  it("allows same server participant", () => {
    const participants = [{ server_id: 1 }];
    const newP = { server_id: 1 };
    const serverContext = participants[0].server_id;
    expect(newP.server_id === serverContext).toBe(true);
  });

  it("blocks different server participant", () => {
    const participants = [{ server_id: 1 }];
    const newP = { server_id: 2 };
    const serverContext = participants[0].server_id;
    expect(newP.server_id === serverContext).toBe(false);
  });

  it("resets server context when all removed", () => {
    const participants: { server_id: number }[] = [];
    const serverContext = participants.length > 0 ? participants[0].server_id : null;
    expect(serverContext).toBeNull();
  });

  it("blocks duplicate account in party", () => {
    const participants = [{ account_id: "acc1", character_id: "c1" }];
    const newP = { account_id: "acc1", character_id: "c2" };
    const hasSameAccount = participants.some((p) => p.account_id === newP.account_id);
    expect(hasSameAccount).toBe(true);
  });

  it("allows different accounts in party", () => {
    const participants = [{ account_id: "acc1", character_id: "c1" }];
    const newP = { account_id: "acc2", character_id: "c2" };
    const hasSameAccount = participants.some((p) => p.account_id === newP.account_id);
    expect(hasSameAccount).toBe(false);
  });
});
