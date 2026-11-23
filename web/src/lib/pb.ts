import PocketBase, { type RecordModel } from 'pocketbase'
import type { Clearances, Material, ModelDoc, PrinterProfile, Vec3 } from '../model/types'

// The app is served by PocketBase itself, so the API is same-origin.
export const pb = new PocketBase(window.location.origin)
pb.autoCancellation(false)

export const me = () => pb.authStore.record

// ---------------------------------------------------------------------------
// Printers

const toPrinter = (r: RecordModel): PrinterProfile => ({
  id: r.id,
  name: r.name,
  technology: r.technology,
  bed: [r.bed_x, r.bed_y, r.bed_z] as Vec3,
  nozzle: r.nozzle,
  layer_min: r.layer_min,
  layer_max: r.layer_max,
  multi_material: r.multi_material,
})

const fromPrinter = (p: Omit<PrinterProfile, 'id'>) => ({
  name: p.name,
  technology: p.technology,
  bed_x: p.bed[0],
  bed_y: p.bed[1],
  bed_z: p.bed[2],
  nozzle: p.nozzle,
  layer_min: p.layer_min,
  layer_max: p.layer_max,
  multi_material: p.multi_material,
})

export const listPrinters = async () =>
  (await pb.collection('printers').getFullList({ sort: 'created' })).map(toPrinter)

export const createPrinter = async (p: Omit<PrinterProfile, 'id'>) =>
  toPrinter(await pb.collection('printers').create({ ...fromPrinter(p), owner: me()?.id }))

export const updatePrinter = async (p: PrinterProfile) =>
  toPrinter(await pb.collection('printers').update(p.id, fromPrinter(p)))

export const deletePrinter = (id: string) => pb.collection('printers').delete(id)

// ---------------------------------------------------------------------------
// Materials (system defaults have no owner; users can add their own)

const toMaterial = (r: RecordModel): Material => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  overhang_deg: r.overhang_deg,
  bridge_mm: r.bridge_mm,
  min_perimeters: r.min_perimeters,
  flex: r.flex,
  density: r.density,
  price_per_kg: r.price_per_kg,
  color: r.color || '#C9CED6',
})

export const listMaterials = async () =>
  (await pb.collection('materials').getFullList({ sort: 'sort,name' })).map(toMaterial)

// ---------------------------------------------------------------------------
// Calibration: measured clearances per printer + material

export interface Calibration {
  id: string
  printer: string
  material: string
  clearances: Clearances
  results: Record<string, number>
  updated: string
}

const toCal = (r: RecordModel): Calibration => ({
  id: r.id,
  printer: r.printer,
  material: r.material,
  clearances: { press: r.press, snug: r.snug, slide: r.slide, loose: r.loose },
  results: r.results ?? {},
  updated: r.updated,
})

export const listCalibrations = async () =>
  (await pb.collection('calibrations').getFullList()).map(toCal)

export const saveCalibration = async (printer: string, material: string, clearances: Clearances, results: Record<string, number>) => {
  const data = { printer, material, ...clearances, results, owner: me()?.id }
  const existing = await pb
    .collection('calibrations')
    .getFirstListItem(pb.filter('printer = {:p} && material = {:m}', { p: printer, m: material }))
    .catch(() => null)
  return toCal(existing ? await pb.collection('calibrations').update(existing.id, data) : await pb.collection('calibrations').create(data))
}

// ---------------------------------------------------------------------------
// Projects

export interface ProjectRecord {
  id: string
  name: string
  model: ModelDoc
  printer: string
  material: string
  updated: string
  thumb: string
}

const toProject = (r: RecordModel): ProjectRecord => ({
  id: r.id,
  name: r.name,
  model: r.model ?? { version: 1, units: 'mm', nodes: [] },
  printer: r.printer,
  material: r.material,
  updated: r.updated,
  thumb: r.thumbnail ? pb.files.getURL(r, r.thumbnail, { thumb: '400x300' }) : '',
})

export const listProjects = async () =>
  (await pb.collection('projects').getFullList({ sort: '-updated' })).map(toProject)

export const getProject = async (id: string) => toProject(await pb.collection('projects').getOne(id))

export const createProject = async (name: string, printer?: string, material?: string, model?: ModelDoc) =>
  toProject(
    await pb.collection('projects').create({
      name,
      owner: me()?.id,
      printer: printer || null,
      material: material || null,
      model: model ?? { version: 1, units: 'mm', nodes: [] },
    }),
  )

export const saveProject = async (id: string, data: Partial<{ name: string; model: ModelDoc; printer: string; material: string; thumbnail: Blob }>) => {
  if (data.thumbnail) {
    const form = new FormData()
    for (const [k, v] of Object.entries(data)) {
      if (k === 'thumbnail') form.append('thumbnail', v as Blob, 'thumb.png')
      else form.append(k, typeof v === 'string' ? v : JSON.stringify(v))
    }
    return toProject(await pb.collection('projects').update(id, form))
  }
  return toProject(await pb.collection('projects').update(id, data))
}

export const deleteProject = (id: string) => pb.collection('projects').delete(id)
