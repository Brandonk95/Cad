import * as THREE from 'three'
import type { ThemeColors } from './theme'

/**
 * Print feedback painted on faces as a translucent tint. Every category also has
 * its own pattern (stripes, crosshatch, dots, lines) so it reads without color.
 */
export function makeOverlayMaterial(c: ThemeColors) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    side: THREE.FrontSide,
    uniforms: {
      cOverhang: { value: new THREE.Color(c['print-overhang']) },
      cThin: { value: new THREE.Color(c['print-thin']) },
      cBridge: { value: new THREE.Color(c['print-bridge']) },
      cTiny: { value: new THREE.Color(c['print-tiny']) },
    },
    vertexShader: /* glsl */ `
      attribute float cat;
      varying float vCat;
      varying vec3 vPos;
      void main() {
        vCat = cat;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 cOverhang, cThin, cBridge, cTiny;
      varying float vCat;
      varying vec3 vPos;
      void main() {
        if (vCat < 0.5) discard;
        float k = floor(vCat + 0.5);
        vec3 col; float pat;
        float s = 1.6;
        if (k < 1.5) {          // overhang: diagonal stripes
          col = cOverhang; pat = step(0.5, fract((vPos.x + vPos.y + vPos.z) / s));
        } else if (k < 2.5) {   // thin wall: crosshatch
          col = cThin;
          float a = step(0.6, fract((vPos.x + vPos.z) / s));
          float b = step(0.6, fract((vPos.y - vPos.z) / s));
          pat = max(a, b);
        } else if (k < 3.5) {   // bridge: dots
          col = cBridge;
          vec2 g = fract(vPos.xy / s) - 0.5;
          pat = 1.0 - step(0.28, length(g));
        } else {                // below resolution: horizontal lines
          col = cTiny; pat = step(0.55, fract(vPos.z / (s * 0.6)));
        }
        gl_FragColor = vec4(col, mix(0.38, 0.82, pat));
      }`,
  })
}
