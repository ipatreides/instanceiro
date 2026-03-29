/**
 * Ragnarok Online LATAM class hierarchy tree and utilities
 * Source: https://browiki.org/wiki/Classes
 * No 4th classes in LATAM yet — max level 200
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
            name: "Lorde",
            children: [
              { name: "Cavaleiro Rúnico" },
            ],
          },
        ],
      },
      {
        name: "Templário",
        children: [
          {
            name: "Paladino",
            children: [
              { name: "Guardião Real" },
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
            name: "Arquimago",
            children: [
              { name: "Arcano" },
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
              { name: "Feiticeiro" },
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
              { name: "Sentinela" },
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
              { name: "Trovador" },
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
              { name: "Musa" },
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
              { name: "Mecânico" },
            ],
          },
        ],
      },
      {
        name: "Alquimista",
        children: [
          {
            name: "Criador",
            children: [
              { name: "Bioquímico" },
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
        name: "Mercenário",
        children: [
          {
            name: "Algoz",
            children: [
              { name: "Sicário" },
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
              { name: "Renegado" },
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
              { name: "Arcebispo" },
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
              { name: "Shura" },
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
        name: "Mestre Taekwon",
        children: [
          { name: "Mestre Estelar" },
        ],
      },
      {
        name: "Espiritualista",
        children: [
          { name: "Ceifador de Almas" },
        ],
      },
    ],
  },
  {
    name: "Superaprendiz",
    children: [
      { name: "Superaprendiz Expandido" },
    ],
  },
  {
    name: "Justiceiro",
    children: [
      {
        name: "Insurgente",
      },
    ],
  },
  {
    name: "Ninja",
    children: [
      { name: "Kagerou" },
      { name: "Oboro" },
    ],
  },
  {
    name: "Invocador",
  },
];

/**
 * Build full class path from root to target class
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
