/**
 * Ragnarok Online class hierarchy tree and utilities
 */

export interface ClassNode {
  name: string;
  children?: ClassNode[];
}

export const CLASS_TREE: ClassNode[] = [
  {
    name: "Espadachim",
    children: [
      {
        name: "Cavaleiro",
        children: [
          {
            name: "Lord Knight",
            children: [
              {
                name: "Rune Knight",
                children: [
                  {
                    name: "Rune Knight T",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Cruzado",
        children: [
          {
            name: "Paladino",
            children: [
              {
                name: "Royal Guard",
                children: [
                  {
                    name: "Royal Guard T",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Mago",
    children: [
      {
        name: "Bruxo",
        children: [
          {
            name: "Mestre-Bruxo",
            children: [
              {
                name: "Warlock",
                children: [
                  {
                    name: "Warlock T",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Sábio",
        children: [
          {
            name: "Professor",
            children: [
              {
                name: "Sorcerer",
                children: [
                  {
                    name: "Sorcerer T",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Arqueiro",
    children: [
      {
        name: "Caçador",
        children: [
          {
            name: "Atirador de Elite",
            children: [
              {
                name: "Ranger",
                children: [
                  {
                    name: "Ranger T",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Bardo",
        children: [
          {
            name: "Menestrel",
            children: [
              {
                name: "Trovador",
                children: [
                  {
                    name: "Trovador T",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Odalisca",
        children: [
          {
            name: "Cigana",
            children: [
              {
                name: "Musa",
                children: [
                  {
                    name: "Musa T",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Mercador",
    children: [
      {
        name: "Ferreiro",
        children: [
          {
            name: "Mestre-Ferreiro",
            children: [
              {
                name: "Mecânico",
                children: [
                  {
                    name: "Mecânico T",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Alquimista",
        children: [
          {
            name: "Bioquímico",
            children: [
              {
                name: "Geneticista",
                children: [
                  {
                    name: "Geneticista T",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Gatuno",
    children: [
      {
        name: "Assassino",
        children: [
          {
            name: "Assassino Cruz",
            children: [
              {
                name: "Guillotine Cross",
                children: [
                  {
                    name: "Guillotine Cross T",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Arruaceiro",
        children: [
          {
            name: "Desordeiro",
            children: [
              {
                name: "Shadow Chaser",
                children: [
                  {
                    name: "Shadow Chaser T",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Noviço",
    children: [
      {
        name: "Sacerdote",
        children: [
          {
            name: "Sumo Sacerdote",
            children: [
              {
                name: "Arch Bishop",
                children: [
                  {
                    name: "Arch Bishop T",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Monge",
        children: [
          {
            name: "Mestre",
            children: [
              {
                name: "Shura",
                children: [
                  {
                    name: "Shura T",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Taekwon",
    children: [
      {
        name: "Star Gladiator",
        children: [
          {
            name: "Star Emperor",
          },
        ],
      },
      {
        name: "Soul Linker",
        children: [
          {
            name: "Soul Reaper",
          },
        ],
      },
    ],
  },
  {
    name: "Super Novice",
    children: [
      {
        name: "Super Novice Expandido",
      },
    ],
  },
  {
    name: "Gunslinger",
    children: [
      {
        name: "Rebellion",
        children: [
          {
            name: "Night Watch",
          },
        ],
      },
    ],
  },
  {
    name: "Ninja",
    children: [
      {
        name: "Kagerou",
      },
      {
        name: "Oboro",
      },
    ],
  },
  {
    name: "Summoner",
  },
];

/**
 * Build full class path from root to target class
 * @param targetClass - The class name to find
 * @param tree - Optional custom tree (defaults to CLASS_TREE)
 * @returns Array of class names from root to target, or null if not found
 */
export function buildClassPath(
  targetClass: string,
  tree: ClassNode[] = CLASS_TREE
): string[] | null {
  for (const node of tree) {
    if (node.name === targetClass) {
      return [node.name];
    }

    if (node.children) {
      const childPath = buildClassPath(targetClass, node.children);
      if (childPath) {
        return [node.name, ...childPath];
      }
    }
  }

  return null;
}

/**
 * Get all leaf class names from the tree
 * @param tree - Optional custom tree (defaults to CLASS_TREE)
 * @returns Array of all leaf class names
 */
export function getLeafClasses(tree: ClassNode[] = CLASS_TREE): string[] {
  const leaves: string[] = [];

  function traverse(nodes: ClassNode[]) {
    for (const node of nodes) {
      if (!node.children || node.children.length === 0) {
        leaves.push(node.name);
      } else {
        traverse(node.children);
      }
    }
  }

  traverse(tree);
  return leaves;
}
