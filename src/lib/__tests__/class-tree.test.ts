import {
  CLASS_TREE,
  buildClassPath,
  getLeafClasses,
  ClassNode,
} from "@/lib/class-tree";

describe("CLASS_TREE", () => {
  it("has 11 base classes", () => {
    expect(CLASS_TREE).toHaveLength(11);
    const rootNames = CLASS_TREE.map((n) => n.name);
    expect(rootNames).toEqual([
      "Espadachim",
      "Mago",
      "Arqueiro",
      "Mercador",
      "Gatuno",
      "Noviço",
      "Taekwon",
      "Superaprendiz",
      "Justiceiro",
      "Ninja",
      "Invocador",
    ]);
  });

  it("Invocador has no children (leaf AND root)", () => {
    const invocador = CLASS_TREE.find((n) => n.name === "Invocador");
    expect(invocador).toBeDefined();
    expect(invocador!.children).toBeUndefined();
  });

  it("Ninja has 2 children: Kagerou and Oboro", () => {
    const ninja = CLASS_TREE.find((n) => n.name === "Ninja");
    expect(ninja).toBeDefined();
    expect(ninja!.children).toHaveLength(2);
    const childNames = ninja!.children!.map((n) => n.name);
    expect(childNames).toEqual(["Kagerou", "Oboro"]);
  });
});

describe("buildClassPath", () => {
  it("returns correct path for a leaf class (Cavaleiro Rúnico)", () => {
    expect(buildClassPath("Cavaleiro Rúnico")).toEqual([
      "Espadachim",
      "Cavaleiro",
      "Lorde",
      "Cavaleiro Rúnico",
    ]);
  });

  it("returns correct path for a mid-tier class (Cavaleiro)", () => {
    expect(buildClassPath("Cavaleiro")).toEqual(["Espadachim", "Cavaleiro"]);
  });

  it("returns null for a non-existent class", () => {
    expect(buildClassPath("ClasseInventada")).toBeNull();
  });

  it("returns [name] for a root class", () => {
    expect(buildClassPath("Espadachim")).toEqual(["Espadachim"]);
    expect(buildClassPath("Invocador")).toEqual(["Invocador"]);
  });
});

describe("getLeafClasses", () => {
  it("returns all leaf classes (no children)", () => {
    const leaves = getLeafClasses();
    // Every leaf should not have children in the tree
    for (const leaf of leaves) {
      const path = buildClassPath(leaf);
      expect(path).not.toBeNull();
    }
    // Spot-check some known leaves
    expect(leaves).toContain("Cavaleiro Rúnico");
    expect(leaves).toContain("Arcano");
    expect(leaves).toContain("Invocador");
    expect(leaves).toContain("Kagerou");
    expect(leaves).toContain("Oboro");
    // Mid-tier and root classes should NOT be leaves (except Invocador)
    expect(leaves).not.toContain("Espadachim");
    expect(leaves).not.toContain("Cavaleiro");
    expect(leaves).not.toContain("Ninja");
  });

  it("returns the correct total count of leaf classes (20)", () => {
    const leaves = getLeafClasses();
    expect(leaves).toHaveLength(20);
  });
});
