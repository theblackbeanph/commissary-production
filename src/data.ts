// ── CONSTANTS ─────────────────────────────────────────────────────────────────
export const BUFFER        = 0.03;
export const PROBLEM_YIELD = 0.70;
export const RISK_HIGH     = 10000; // grams
export const RISK_LOW      = 10000; // grams — alert below 10kg
export const CLEAR_PIN     = "0317";
export const VARIANCE_THRESHOLD = 0.10;

// ── TEAM ──────────────────────────────────────────────────────────────────────
export const TEAM = ["JR", "Aljo", "Don", "Rowell"];

// ── BRANCHES ──────────────────────────────────────────────────────────────────
export const BRANCHES = [
  { label: "Makati", code: "MKT" },
  { label: "BF",     code: "BF"  },
];

// ── RECIPE ALIASES ────────────────────────────────────────────────────────────
// Maps old Firestore-stored names → current display names after a rename.
// Historical records keep their original name; the alias lets the app find them.
export const RECIPE_ALIASES: Record<string, string> = {
  "Salmon Slab":           "Salmon Fillet",
  "Grilled Cheese":        "Tomato Soup",
  "Marinara - Mozzarella": "Marinara Sauce (Blend)",
  "Gyudon Sauce (Loose)":  "Gyudon Sauce",
  "Squid Ink":             "Squid Ink Sauce",
};

// ── SKUS ──────────────────────────────────────────────────────────────────────
export const SKUS = [
  "Beef Brisket", "Beef Shortplate", "Beef Chuck",
  "Chicken Leg Fillet", "Cobbler", "Kimchi", "Mozzarella Block",
  "Pork Shoulder", "Roast Beef", "Salmon Slab", "Smoked Salmon",
  "Salmon Crazy Cut", "Salmon Premium Belly", "Scallops",
  "Bacon Slab", "Prosciutto", "Tomahawk Porkchops",
];

export const SKU_CATEGORY: Record<string, "beef"|"poultry"|"pork"|"seafood"|"others"> = {
  "Beef Brisket":       "beef", "Beef Shortplate": "beef", "Beef Chuck": "beef",
  "Roast Beef":         "beef",
  "Chicken Leg Fillet": "poultry", "Cobbler": "poultry",
  "Pork Shoulder":      "pork", "Bacon Slab": "pork", "Prosciutto": "pork",
  "Tomahawk Porkchops": "pork",
  "Salmon Slab":        "seafood", "Smoked Salmon": "seafood",
  "Salmon Crazy Cut":   "seafood", "Salmon Premium Belly": "seafood", "Scallops": "seafood",
  "Kimchi": "others", "Mozzarella Block": "others",
};

export const SKU_CAT_LABELS: Record<string, string> = {
  beef: "Beef", poultry: "Poultry", pork: "Pork", seafood: "Seafood", others: "Others",
};

// ── RECIPES ───────────────────────────────────────────────────────────────────
export interface Recipe {
  name:     string;
  portionG: number | null;
  prodType: "portion" | "cooked";
}

export const RECIPES: Recipe[] = [
  { name: "Cobbler",                 portionG: 300,  prodType: "portion" },
  { name: "Salmon Fillet",           portionG: 150,  prodType: "portion" },
  { name: "Smoked Salmon",           portionG: 50,   prodType: "portion" },
  { name: "Aburi Salmon",            portionG: 120,  prodType: "portion" },
  { name: "Beef Tapa",               portionG: 120,  prodType: "portion" },
  { name: "Beef Pares",              portionG: 100,  prodType: "cooked"  },
  { name: "Buttermilk Chicken 300g", portionG: 300,  prodType: "portion" },
  { name: "Buttermilk Chicken 150g", portionG: 150,  prodType: "portion" },
  { name: "Chicken BBQ",             portionG: 80,   prodType: "cooked"  },
  { name: "Burger Patty",            portionG: 180,  prodType: "portion" },
  { name: "Adobo Flakes",            portionG: 80,   prodType: "cooked"  },
  { name: "Arroz ala Cubana",        portionG: 130,  prodType: "cooked"  },
  { name: "Roast Beef",              portionG: 120,  prodType: "portion" },
  { name: "Mozzarella Sticks",       portionG: 130,  prodType: "portion" },
  { name: "Kimchi",                  portionG: 500,  prodType: "portion" },
  { name: "Scallops",                portionG: 80,   prodType: "portion" },
  { name: "Bacon Cubes",             portionG: 70,   prodType: "portion" },
  { name: "Prosciutto",              portionG: 35,   prodType: "portion" },
  { name: "Tomahawk Porkchop",       portionG: 600,  prodType: "portion" },
];

export const RECIPE_CODES: Record<string, string> = {
  "Cobbler":                 "COBB",
  "Salmon Fillet":           "SSLAB",
  "Smoked Salmon":           "SMKSALM",
  "Aburi Salmon":            "ABURI",
  "Beef Tapa":               "TAPA",
  "Beef Pares":              "PARES",
  "Buttermilk Chicken 300g": "BCHX300",
  "Buttermilk Chicken 150g": "BCHX150",
  "Chicken BBQ":             "CBBQ",
  "Burger Patty":            "PATTY",
  "Adobo Flakes":            "ADOBO",
  "Arroz ala Cubana":        "ARROZ",
  "Roast Beef":              "ROAST",
  "Mozzarella Sticks":       "MOZZ",
  "Kimchi":                  "KIMCHI",
  "Scallops":                "SCAL",
  "Bacon Cubes":             "BCN",
  "Prosciutto":              "PRC",
  "Tomahawk Porkchop":       "CHOP",
};

export const RECIPE_PROD_TYPE: Record<string, "portion"|"cooked"> = {
  "Cobbler":                 "portion",
  "Salmon Fillet":           "portion",
  "Smoked Salmon":           "portion",
  "Aburi Salmon":            "portion",
  "Beef Tapa":               "portion",
  "Buttermilk Chicken 300g": "portion",
  "Buttermilk Chicken 150g": "portion",
  "Burger Patty":            "portion",
  "Roast Beef":              "portion",
  "Mozzarella Sticks":       "portion",
  "Kimchi":                  "portion",
  "Scallops":                "portion",
  "Bacon Cubes":             "portion",
  "Prosciutto":              "portion",
  "Tomahawk Porkchop":       "portion",
  "Beef Pares":              "cooked",
  "Chicken BBQ":             "cooked",
  "Adobo Flakes":            "cooked",
  "Arroz ala Cubana":        "cooked",
};

export const SKU_RECIPES: Record<string, string[]> = {
  "Beef Brisket":         ["Beef Pares", "Arroz ala Cubana"],
  "Beef Shortplate":      ["Beef Tapa", "Burger Patty", "Arroz ala Cubana"],
  "Beef Chuck":           ["Burger Patty"],
  "Chicken Leg Fillet":   ["Buttermilk Chicken 300g", "Buttermilk Chicken 150g", "Chicken BBQ"],
  "Cobbler":              ["Cobbler"],
  "Kimchi":               ["Kimchi"],
  "Mozzarella Block":     ["Mozzarella Sticks"],
  "Pork Shoulder":        ["Arroz ala Cubana", "Adobo Flakes"],
  "Roast Beef":           ["Roast Beef"],
  "Salmon Slab":          ["Salmon Fillet", "Aburi Salmon"],
  "Smoked Salmon":        ["Smoked Salmon"],
  "Salmon Crazy Cut":     ["Aburi Salmon"],
  "Salmon Premium Belly": ["Aburi Salmon"],
  "Scallops":             ["Scallops"],
  "Bacon Slab":           ["Bacon Cubes"],
  "Prosciutto":           ["Prosciutto"],
  "Tomahawk Porkchops":   ["Tomahawk Porkchop"],
};

// ── INVENTORY ITEMS ───────────────────────────────────────────────────────────
export const PACKED_ITEMS = [
  "Miso Butter Paste", "Au Jus",
  "Bacon Jam", "Caramelized Onion", "Vodka Sauce", "Squid Ink Sauce", "Truffle Pasta Sauce", "Truffle Mushroom Paste",
  "Loco Moco Gravy", "Squash Soup",
  "Tomato Soup", "Tuna Spread",
  "Flatbread", "Classic Tiramisu", "Hojicha Tiramisu", "Tres Leches",
];

export const LOOSE_ITEMS = [
  "Marinara Sauce", "Marinara Sauce (Blend)", "Gyudon Sauce",
  "Tartar", "Aioli", "Caesar Dressing", "Raspberry Dressing", "Candied Walnut",
  "House Vinaigrette", "Nigiri", "Burger Dressing", "Maple Syrup",
  "Pesto", "Beef Pares Sauce", "Adobo Flakes Sauce",
  "Classic Tiramisu Mascarpone", "Hojicha Tiramisu Mascarpone",
];

// Pack size in grams per pack. Loose items listed here display with unit "pack" instead of "g".
// Recipe portioned items can also be listed here when they are pack-tracked (e.g. Kimchi).
export const LOOSE_PACK_SIZES: Record<string, number> = {
  "Kimchi":                        500,
  "Marinara Sauce":              500,
  "Marinara Sauce (Blend)":      300,
  "Gyudon Sauce":               1300,
  "Tartar":                     1000,
  "Aioli":                      1000,
  "Caesar Dressing":             500,
  "Raspberry Dressing":          500,
  "Candied Walnut":              200,
  "House Vinaigrette":           500,
  "Nigiri":                      500,
  "Burger Dressing":             500,
  "Maple Syrup":                 300,
  "Pesto":                       300,
  "Beef Pares Sauce":           1000,
  "Adobo Flakes Sauce":          500,
  "Classic Tiramisu Mascarpone": 1500,
  "Hojicha Tiramisu Mascarpone": 1500,
};

// Full portion guide data for the Portion Guide modal.
// recipePortion = grams per serving at the branch; servings = approx per pack.
export interface LooseGuideEntry {
  id:            string;
  item:          string;
  subType:       string;
  packSize:      number;
  recipePortion: number;
  servings:      number;
  container:     string;
}

export const LOOSE_GUIDE: LooseGuideEntry[] = [
  { id: "L-001", item: "Gyudon Sauce",              subType: "Sauce",    packSize: 1300, recipePortion: 70,  servings: 18, container: "Hotel Pan"    },
  { id: "L-002", item: "Tartar",                    subType: "Sauce",    packSize: 1000, recipePortion: 30,  servings: 33, container: "Large Bottle" },
  { id: "L-003", item: "Aioli",                     subType: "Sauce",    packSize: 1000, recipePortion: 30,  servings: 33, container: "Large Bottle" },
  { id: "L-004", item: "Nigiri",                    subType: "Sauce",    packSize:  500, recipePortion: 20,  servings: 25, container: "Small Bottle" },
  { id: "L-005", item: "Burger Dressing",           subType: "Sauce",    packSize:  500, recipePortion: 30,  servings: 16, container: "Small Bottle" },
  { id: "L-006", item: "Maple Syrup",               subType: "Sauce",    packSize:  300, recipePortion: 30,  servings: 10, container: "Small Bottle" },
  { id: "L-007", item: "Beef Pares Sauce",          subType: "Sauce",    packSize: 1000, recipePortion: 60,  servings: 16, container: "Hotel Pan"    },
  { id: "L-008", item: "Adobo Flakes Sauce",        subType: "Sauce",    packSize:  500, recipePortion: 30,  servings: 16, container: "Hotel Pan"    },
  { id: "L-009", item: "Marinara Sauce",            subType: "Sauce",    packSize:  500, recipePortion: 50,  servings: 10, container: "Hotel Pan"    },
  { id: "L-010", item: "Marinara Sauce (Blend)",    subType: "Sauce",    packSize:  300, recipePortion: 30,  servings: 10, container: "Small Bottle" },
  { id: "L-011", item: "Pesto",                     subType: "Sauce",    packSize:  300, recipePortion: 30,  servings: 10, container: "Hotel Pan"    },
  { id: "L-012", item: "Caesar Dressing",           subType: "Dressing", packSize:  500, recipePortion: 30,  servings: 16, container: "Hotel Pan"    },
  { id: "L-013", item: "House Vinaigrette",         subType: "Dressing", packSize:  500, recipePortion: 20,  servings: 25, container: "Small Bottle" },
  { id: "L-014", item: "Raspberry Dressing",        subType: "Dressing", packSize:  500, recipePortion: 50,  servings: 10, container: "Hotel Pan"    },
  { id: "L-015", item: "Candied Walnut",            subType: "Topping",  packSize:  200, recipePortion: 40,  servings:  5, container: "Hotel Pan"    },
  { id: "L-016", item: "Classic Tiramisu Mascarpone", subType: "Dessert", packSize: 1500, recipePortion: 120, servings: 12, container: "Airtight Container" },
  { id: "L-017", item: "Hojicha Tiramisu Mascarpone", subType: "Dessert", packSize: 1500, recipePortion: 120, servings: 12, container: "Airtight Container" },
];
