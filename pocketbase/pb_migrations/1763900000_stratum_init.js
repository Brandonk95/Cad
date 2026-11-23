/// <reference path="../pb_data/types.d.ts" />

// Stratum schema: printers, materials, calibrations, projects.
// Every user-owned record is visible and editable only by its owner.

const OWNER = "owner = @request.auth.id"
const AUTHED = "@request.auth.id != ''"

const timestamps = () => [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
]

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  // -- printers -------------------------------------------------------------
  const printers = new Collection({
    type: "base",
    name: "printers",
    listRule: OWNER,
    viewRule: OWNER,
    createRule: AUTHED + " && @request.body.owner = @request.auth.id",
    updateRule: OWNER + " && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)",
    deleteRule: OWNER,
    fields: [
      { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: "name", type: "text", required: true, max: 120 },
      { name: "technology", type: "select", required: true, maxSelect: 1, values: ["fdm", "resin", "sls"] },
      { name: "bed_x", type: "number", required: true, min: 1 },
      { name: "bed_y", type: "number", required: true, min: 1 },
      { name: "bed_z", type: "number", required: true, min: 1 },
      { name: "nozzle", type: "number", required: true, min: 0.01 },
      { name: "layer_min", type: "number" },
      { name: "layer_max", type: "number" },
      { name: "multi_material", type: "bool" },
      ...timestamps(),
    ],
    indexes: ["CREATE INDEX idx_printers_owner ON printers (owner)"],
  })
  app.save(printers)

  // -- materials ------------------------------------------------------------
  // owner empty = built-in material visible to everyone signed in.
  const materials = new Collection({
    type: "base",
    name: "materials",
    listRule: AUTHED + " && (owner = '' || owner = @request.auth.id)",
    viewRule: AUTHED + " && (owner = '' || owner = @request.auth.id)",
    createRule: AUTHED + " && @request.body.owner = @request.auth.id",
    updateRule: OWNER,
    deleteRule: OWNER,
    fields: [
      { name: "owner", type: "relation", maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: "name", type: "text", required: true, max: 80 },
      { name: "kind", type: "text", required: true, max: 40 },
      { name: "overhang_deg", type: "number", required: true, min: 0, max: 90 },
      { name: "bridge_mm", type: "number", min: 0 },
      { name: "min_perimeters", type: "number", min: 1 },
      { name: "flex", type: "number", min: 0, max: 1 },
      { name: "density", type: "number", min: 0 },
      { name: "price_per_kg", type: "number", min: 0 },
      { name: "color", type: "text", max: 9 },
      { name: "sort", type: "number" },
      ...timestamps(),
    ],
  })
  app.save(materials)

  const seed = [
    ["PLA", "PLA", 45, 20, 2, 0.1, 1.24, 20],
    ["PETG", "PETG", 40, 12, 2, 0.3, 1.27, 22],
    ["TPU 95A", "TPU", 35, 6, 3, 0.9, 1.21, 30],
    ["ABS / ASA", "ABS", 40, 15, 2, 0.25, 1.05, 22],
    ["Standard resin", "Resin", 30, 5, 1, 0.05, 1.12, 35],
  ]
  seed.forEach(([name, kind, overhang, bridge, perims, flex, density, price], i) => {
    const r = new Record(materials)
    r.set("name", name)
    r.set("kind", kind)
    r.set("overhang_deg", overhang)
    r.set("bridge_mm", bridge)
    r.set("min_perimeters", perims)
    r.set("flex", flex)
    r.set("density", density)
    r.set("price_per_kg", price)
    r.set("color", "#C9CED6")
    r.set("sort", i)
    app.save(r)
  })

  // -- calibrations ---------------------------------------------------------
  const calibrations = new Collection({
    type: "base",
    name: "calibrations",
    listRule: OWNER,
    viewRule: OWNER,
    createRule: AUTHED + " && @request.body.owner = @request.auth.id",
    updateRule: OWNER + " && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)",
    deleteRule: OWNER,
    fields: [
      { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: "printer", type: "relation", required: true, maxSelect: 1, collectionId: printers.id, cascadeDelete: true },
      { name: "material", type: "relation", required: true, maxSelect: 1, collectionId: materials.id, cascadeDelete: true },
      { name: "press", type: "number", min: 0 },
      { name: "snug", type: "number", min: 0 },
      { name: "slide", type: "number", min: 0 },
      { name: "loose", type: "number", min: 0 },
      { name: "results", type: "json", maxSize: 20000 },
      ...timestamps(),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_cal_pm ON calibrations (owner, printer, material)"],
  })
  app.save(calibrations)

  // -- projects -------------------------------------------------------------
  const projects = new Collection({
    type: "base",
    name: "projects",
    listRule: OWNER,
    viewRule: OWNER,
    createRule: AUTHED + " && @request.body.owner = @request.auth.id",
    updateRule: OWNER + " && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)",
    deleteRule: OWNER,
    fields: [
      { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: "name", type: "text", required: true, max: 200 },
      { name: "model", type: "json", maxSize: 5000000 },
      { name: "printer", type: "relation", maxSelect: 1, collectionId: printers.id, cascadeDelete: false },
      { name: "material", type: "relation", maxSelect: 1, collectionId: materials.id, cascadeDelete: false },
      { name: "thumbnail", type: "file", maxSelect: 1, maxSize: 2000000, mimeTypes: ["image/png", "image/jpeg", "image/webp"], thumbs: ["400x300"] },
      ...timestamps(),
    ],
    indexes: ["CREATE INDEX idx_projects_owner ON projects (owner)"],
  })
  app.save(projects)
}, (app) => {
  for (const name of ["projects", "calibrations", "materials", "printers"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name))
    } catch (_) {}
  }
})
