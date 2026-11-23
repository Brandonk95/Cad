import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { zipSync, strToU8 } from 'fflate'
import type { Body } from '../model/geometry'

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const safeName = (s: string) => s.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'stratum-part'

export function toSTL(bodies: Body[]): ArrayBuffer {
  const scene = new THREE.Scene()
  for (const b of bodies) scene.add(new THREE.Mesh(b.geometry))
  const out = new STLExporter().parse(scene, { binary: true }) as unknown as DataView
  return out.buffer as ArrayBuffer
}

const hex = (c: string) => (c.startsWith('#') ? c.toUpperCase() : '#C9CED6') + 'FF'

/** 3MF core spec: one object per body, colors as base materials, placed as printed. */
export function to3MF(bodies: Body[], title: string): Uint8Array {
  const colors = [...new Set(bodies.map((b) => b.color))]
  let objects = ''
  let items = ''
  bodies.forEach((b, i) => {
    const pos = b.geometry.getAttribute('position')
    const map = new Map<string, number>()
    const verts: string[] = []
    const tris: string[] = []
    const idx = (k: number) => {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k)
      const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`
      let v = map.get(key)
      if (v === undefined) {
        v = verts.length
        map.set(key, v)
        verts.push(`<vertex x="${x.toFixed(4)}" y="${y.toFixed(4)}" z="${z.toFixed(4)}"/>`)
      }
      return v
    }
    for (let t = 0; t < pos.count / 3; t++) {
      const v1 = idx(t * 3), v2 = idx(t * 3 + 1), v3 = idx(t * 3 + 2)
      if (v1 === v2 || v2 === v3 || v1 === v3) continue
      tris.push(`<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`)
    }
    const id = i + 2
    const name = b.name.replace(/[<>&"]/g, '')
    objects += `<object id="${id}" name="${name}" type="model" pid="1" pindex="${colors.indexOf(b.color)}"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`
    items += `<item objectid="${id}"/>`
  })
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${title.replace(/[<>&"]/g, '')}</metadata>
<metadata name="Application">Stratum</metadata>
<resources><basematerials id="1">${colors.map((c, i) => `<base name="Color ${i + 1}" displaycolor="${hex(c)}"/>`).join('')}</basematerials>${objects}</resources>
<build>${items}</build>
</model>`
  const types = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`
  return zipSync({
    '[Content_Types].xml': strToU8(types),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
  })
}
