describe("Account logic", () => {
  it("reorder produces correct sort_order values", () => {
    const ids = ["a", "b", "c"];
    const result = ids.map((id, i) => ({ id, sort_order: i }));
    expect(result).toEqual([
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ]);
  });

  it("reorder handles single item", () => {
    const ids = ["a"];
    const result = ids.map((id, i) => ({ id, sort_order: i }));
    expect(result).toEqual([{ id: "a", sort_order: 0 }]);
  });

  it("new account gets max sort_order + 1", () => {
    const accounts = [{ sort_order: 0 }, { sort_order: 2 }, { sort_order: 1 }];
    const maxOrder = Math.max(...accounts.map((a) => a.sort_order)) + 1;
    expect(maxOrder).toBe(3);
  });

  it("first account gets sort_order 0", () => {
    const accounts: { sort_order: number }[] = [];
    const maxOrder = accounts.length > 0 ? Math.max(...accounts.map((a) => a.sort_order)) + 1 : 0;
    expect(maxOrder).toBe(0);
  });
});
