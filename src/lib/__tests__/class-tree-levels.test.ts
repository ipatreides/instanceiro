import { CLASS_TREE, ClassNode } from "@/lib/class-tree";

/**
 * Helper: compute max depth of a node's subtree (0 = no children).
 */
function maxDepth(node: ClassNode): number {
  if (!node.children || node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(maxDepth));
}

/**
 * Helper: collect all nodes at a given depth under a node.
 * Depth 0 = direct children, depth 1 = grandchildren, etc.
 */
function nodesAtDepth(node: ClassNode, depth: number): ClassNode[] {
  if (!node.children) return [];
  if (depth === 0) return node.children;
  return node.children.flatMap((child) => nodesAtDepth(child, depth - 1));
}

/**
 * Helper: collect ALL descendant nodes at every depth.
 */
function allDescendants(node: ClassNode): ClassNode[] {
  if (!node.children) return [];
  return node.children.flatMap((child) => [child, ...allDescendants(child)]);
}

const STANDARD_BASES = [
  "Espadachim",
  "Mago",
  "Arqueiro",
  "Mercador",
  "Gatuno",
  "Noviço",
];

describe("Standard class depth structure", () => {
  const standardNodes = CLASS_TREE.filter((n) =>
    STANDARD_BASES.includes(n.name)
  );

  it.each(STANDARD_BASES)(
    "%s has exactly 4 depth levels (base -> 2nd -> trans -> 3rd)",
    (baseName) => {
      const node = standardNodes.find((n) => n.name === baseName)!;
      // Max depth from base is 3 (base=0, 2nd=1, trans=2, 3rd=3)
      expect(maxDepth(node)).toBe(3);
    }
  );

  it("all standard base classes have children at depth 3 (3rd class tier)", () => {
    for (const node of standardNodes) {
      // nodesAtDepth counts from children: 0=2nd, 1=trans, 2=3rd
      const thirdClassNodes = nodesAtDepth(node, 2);
      expect(thirdClassNodes.length).toBeGreaterThan(0);
      // All 3rd class nodes should be leaves
      for (const leaf of thirdClassNodes) {
        expect(leaf.children).toBeUndefined();
      }
    }
  });

  it("total 3rd class count for standard classes is 13", () => {
    // Espadachim: Cavaleiro Rúnico, Guardião Real (2)
    // Mago: Arcano, Feiticeiro (2)
    // Arqueiro: Sentinela, Trovador, Musa (3)
    // Mercador: Mecânico, Bioquímico (2)
    // Gatuno: Sicário, Renegado (2)
    // Noviço: Arcebispo, Shura (2)
    // Total: 13
    let count = 0;
    for (const node of standardNodes) {
      count += nodesAtDepth(node, 2).length;
    }
    expect(count).toBe(13);
  });
});

describe("Taekwon branch structure", () => {
  const taekwon = CLASS_TREE.find((n) => n.name === "Taekwon")!;

  it("has 2 branches", () => {
    expect(taekwon.children).toHaveLength(2);
    const names = taekwon.children!.map((n) => n.name);
    expect(names).toEqual(["Mestre Taekwon", "Espiritualista"]);
  });

  it("each branch has exactly 1 child (2 levels deep from base)", () => {
    for (const branch of taekwon.children!) {
      expect(branch.children).toHaveLength(1);
      // The grandchild should be a leaf
      expect(branch.children![0].children).toBeUndefined();
    }
  });

  it("max depth is 2 (base -> expanded -> expanded leaf)", () => {
    expect(maxDepth(taekwon)).toBe(2);
  });
});

describe("Superaprendiz structure", () => {
  const superAprendiz = CLASS_TREE.find(
    (n) => n.name === "Superaprendiz"
  )!;

  it("has 1 child at depth 1", () => {
    expect(superAprendiz.children).toHaveLength(1);
    expect(superAprendiz.children![0].name).toBe(
      "Superaprendiz Expandido"
    );
  });

  it("child is a leaf (no deeper nodes)", () => {
    expect(superAprendiz.children![0].children).toBeUndefined();
  });

  it("max depth is 1", () => {
    expect(maxDepth(superAprendiz)).toBe(1);
  });
});

describe("Justiceiro structure", () => {
  const justiceiro = CLASS_TREE.find((n) => n.name === "Justiceiro")!;

  it("has 1 child at depth 1", () => {
    expect(justiceiro.children).toHaveLength(1);
    expect(justiceiro.children![0].name).toBe("Insurgente");
  });

  it("child is a leaf (no deeper nodes)", () => {
    expect(justiceiro.children![0].children).toBeUndefined();
  });

  it("max depth is 1", () => {
    expect(maxDepth(justiceiro)).toBe(1);
  });
});

describe("Ninja structure", () => {
  const ninja = CLASS_TREE.find((n) => n.name === "Ninja")!;

  it("has 2 children at depth 1, no deeper", () => {
    expect(ninja.children).toHaveLength(2);
    const names = ninja.children!.map((n) => n.name);
    expect(names).toEqual(["Kagerou", "Oboro"]);
  });

  it("both children are leaves", () => {
    for (const child of ninja.children!) {
      expect(child.children).toBeUndefined();
    }
  });

  it("max depth is 1", () => {
    expect(maxDepth(ninja)).toBe(1);
  });
});

describe("Invocador structure", () => {
  const invocador = CLASS_TREE.find((n) => n.name === "Invocador")!;

  it("has no children", () => {
    expect(invocador.children).toBeUndefined();
  });

  it("max depth is 0", () => {
    expect(maxDepth(invocador)).toBe(0);
  });
});

describe("No class exceeds depth 3 (no 4th classes)", () => {
  it("every base class has max depth <= 3", () => {
    for (const base of CLASS_TREE) {
      expect(maxDepth(base)).toBeLessThanOrEqual(3);
    }
  });

  it("no node anywhere in the tree has children beyond depth 3 from its root", () => {
    for (const base of CLASS_TREE) {
      // Depth 3 nodes (if they exist) should all be leaves
      const depth3Nodes = nodesAtDepth(base, 3);
      for (const node of depth3Nodes) {
        expect(node.children).toBeUndefined();
      }
    }
  });
});
