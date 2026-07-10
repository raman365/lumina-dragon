import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

// import.meta.env.BASE_URL carries Vite's base ('/' in dev, '/lumina-dragon/' on Pages)
const DRAGON_URL = `${import.meta.env.BASE_URL}dragon.glb`
const DRAGON_BYTES = 24269912 // fallback when the server omits content-length
const STAR_COUNT = 2400

// touch devices get fewer particles, a lower DPR cap, and an auto-roaming torch
const IS_TOUCH =
  typeof window !== 'undefined' && window.matchMedia('(hover: none), (pointer: coarse)').matches
const EMBER_COUNT = IS_TOUCH ? 400 : 700
const MAX_DPR = IS_TOUCH ? 1.5 : 2

// ---------- camera path: one keyframe per page section ----------
// p = smoothed scroll fraction; az/el in degrees around the dragon at origin
type CameraKey = { p: number; az: number; el: number; r: number; tx: number; ty: number }
const CAMERA_KEYS: CameraKey[] = [
  { p: 0.0, az: 0, el: 6, r: 15.0, tx: 0.0, ty: 0.6 }, // hero — full front
  { p: 0.19, az: 28, el: 2, r: 9.0, tx: -1.7, ty: 0.2 }, // 01 awaken — close, dragon right
  { p: 0.385, az: 115, el: 18, r: 10.5, tx: 1.7, ty: 0.6 }, // 02 wings — side, dragon left
  { p: 0.577, az: 215, el: 38, r: 6.5, tx: -1.5, ty: 1.0 }, // 03 scales — over the shoulder
  { p: 0.77, az: 322, el: 4, r: 11.0, tx: 1.7, ty: 0.2 }, // 04 ember — dragon left
  { p: 1.0, az: 360, el: 12, r: 14.0, tx: 0.0, ty: 0.4 }, // finale — front again
]

const auraVertex = /* glsl */ `
  varying float vFresnel;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vec3 v = normalize(-mv.xyz);
    vFresnel = pow(1.0 - abs(dot(n, v)), 2.6);
    gl_Position = projectionMatrix * mv;
  }
`

const auraFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying float vFresnel;
  void main() {
    float pulse = 0.85 + 0.15 * sin(uTime * 2.2);
    gl_FragColor = vec4(uColor, vFresnel * uIntensity * pulse);
  }
`

const emberVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec3 uTorch;
  attribute float aSeed;
  varying float vAlpha;
  varying float vWarm;

  void main() {
    vec3 pos = position;
    pos.y = mod(pos.y + uTime * (0.22 + aSeed * 0.4), 11.0) - 5.0;
    pos.x += sin(uTime * (0.4 + aSeed) + aSeed * 40.0) * 0.5;
    pos.z += cos(uTime * (0.35 + aSeed) + aSeed * 30.0) * 0.5;

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vec3 toTorch = world.xyz - uTorch;
    float d = length(toTorch);
    float force = smoothstep(2.6, 0.0, d);
    world.xyz += normalize(toTorch + vec3(0.0001)) * force * 1.6;

    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.0 + aSeed * 1.6) * uPixelRatio * (30.0 / -mv.z);

    vWarm = aSeed;
    vAlpha = 0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 50.0));
    vAlpha *= 1.0 + force * 1.5;
  }
`

const emberFragment = /* glsl */ `
  varying float vAlpha;
  varying float vWarm;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = smoothstep(0.5, 0.03, d);
    glow *= glow;
    if (glow < 0.001) discard;
    vec3 color = mix(vec3(1.0, 0.35, 0.12), vec3(1.0, 0.85, 0.45), vWarm);
    gl_FragColor = vec4(color, glow * vAlpha * 0.8);
  }
`

export interface DragonSceneCallbacks {
  onProgress?: (fraction: number) => void
  onReady?: () => void
}

export function createDragonScene(
  canvas: HTMLCanvasElement,
  callbacks: DragonSceneCallbacks = {},
): () => void {
  let disposed = false

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300)
  camera.position.set(0, 1.5, 15)

  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.3

  // ---------- lights ----------
  const rim = new THREE.DirectionalLight('#7b2ff7', 5)
  rim.position.set(-6, 5, -8)
  const fill = new THREE.DirectionalLight('#22d3ee', 1.6)
  fill.position.set(7, 2, 5)
  const hemi = new THREE.HemisphereLight('#4a4a8a', '#0a0a14', 0.9)
  const torch = new THREE.PointLight('#ffb36b', 0, 22, 2) // intensity fades in with pointer
  scene.add(rim, fill, hemi, torch)

  // ---------- dragon ----------
  const dragonGroup = new THREE.Group()
  dragonGroup.scale.setScalar(0.001)
  scene.add(dragonGroup)

  const auraUniforms = {
    uColor: { value: new THREE.Color('#22d3ee') },
    uIntensity: { value: 0.3 },
    uTime: { value: 0 },
  }
  const auraMaterial = new THREE.ShaderMaterial({
    vertexShader: auraVertex,
    fragmentShader: auraFragment,
    uniforms: auraUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  let revealStart = -1
  THREE.Cache.enabled = true
  const loader = new GLTFLoader()
  loader.load(
    DRAGON_URL,
    (gltf) => {
      if (disposed) return
      const model = gltf.scene

      // center on origin and normalize size
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const scale = 7.5 / Math.max(size.x, size.y, size.z)
      model.position.sub(center).multiplyScalar(scale)
      model.scale.setScalar(scale)

      const meshes: THREE.Mesh[] = []
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh)
      })
      for (const mesh of meshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial
        mat.envMapIntensity = 0.7
        // additive fresnel skin over the same geometry
        const aura = new THREE.Mesh(mesh.geometry, auraMaterial)
        aura.position.copy(mesh.position)
        aura.quaternion.copy(mesh.quaternion)
        aura.scale.copy(mesh.scale)
        mesh.parent?.add(aura)
      }

      dragonGroup.add(model)
      revealStart = clock.getElapsedTime()
      callbacks.onReady?.()
    },
    (event) => {
      if (disposed) return
      const total = event.total || DRAGON_BYTES
      callbacks.onProgress?.(Math.min(event.loaded / total, 1))
    },
    (err) => console.error('failed to load dragon.glb:', err),
  )

  // ---------- embers ----------
  const emberGeometry = new THREE.BufferGeometry()
  {
    const pos = new Float32Array(EMBER_COUNT * 3)
    const seed = new Float32Array(EMBER_COUNT)
    for (let i = 0; i < EMBER_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = 2.8 + Math.random() * 6
      pos[i * 3] = Math.cos(angle) * radius
      pos[i * 3 + 1] = Math.random() * 11
      pos[i * 3 + 2] = Math.sin(angle) * radius
      seed[i] = Math.random()
    }
    emberGeometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    emberGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  }
  const emberUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, MAX_DPR) },
    uTorch: { value: new THREE.Vector3(999, 999, 999) },
  }
  const emberMaterial = new THREE.ShaderMaterial({
    vertexShader: emberVertex,
    fragmentShader: emberFragment,
    uniforms: emberUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  scene.add(new THREE.Points(emberGeometry, emberMaterial))

  // ---------- stars ----------
  const starGeometry = new THREE.BufferGeometry()
  {
    const pos = new Float32Array(STAR_COUNT * 3)
    for (let i = 0; i < STAR_COUNT; i++) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      ).normalize()
      const radius = 50 + Math.random() * 60
      pos[i * 3] = dir.x * radius
      pos[i * 3 + 1] = dir.y * radius
      pos[i * 3 + 2] = dir.z * radius
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  }
  const starMaterial = new THREE.PointsMaterial({
    color: '#aebfff',
    size: 0.35,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  })
  const stars = new THREE.Points(starGeometry, starMaterial)
  scene.add(stars)

  // ---------- interaction ----------
  const mouseNDC = new THREE.Vector2(0, 0)
  let pointerActive = false
  const raycaster = new THREE.Raycaster()
  const torchTarget = new THREE.Vector3(0, 0, 8)
  let scrollTarget = 0
  let scrollCurrent = 0

  let lastPointerTime = -10

  const onPointerMove = (e: PointerEvent) => {
    pointerActive = true
    lastPointerTime = clock.getElapsedTime()
    mouseNDC.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
    raycaster.setFromCamera(mouseNDC, camera)
    // torch floats between camera and dragon, a few units short of the origin
    const dist = Math.max(camera.position.length() - 4.5, 2)
    raycaster.ray.at(dist, torchTarget)
  }

  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    scrollTarget = max > 0 ? window.scrollY / max : 0
  }

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    const pr = Math.min(window.devicePixelRatio, MAX_DPR)
    renderer.setPixelRatio(pr)
    emberUniforms.uPixelRatio.value = pr
  }

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerdown', onPointerMove) // taps place the torch on touch screens
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  onScroll()

  // ---------- frame loop ----------
  const auraCyan = new THREE.Color('#22d3ee')
  const auraEmber = new THREE.Color('#ffb700')
  const lookTarget = new THREE.Vector3()
  const autoDir = new THREE.Vector3()
  const clock = new THREE.Clock()
  let raf = 0

  const smooth = (x: number) => x * x * (3 - 2 * x)

  const cameraAt = (p: number) => {
    let i = 0
    while (i < CAMERA_KEYS.length - 2 && p > CAMERA_KEYS[i + 1].p) i++
    const a = CAMERA_KEYS[i]
    const b = CAMERA_KEYS[i + 1]
    const t = smooth(Math.min(Math.max((p - a.p) / (b.p - a.p), 0), 1))
    const az = THREE.MathUtils.degToRad(a.az + (b.az - a.az) * t) + mouseNDC.x * 0.06
    const el = THREE.MathUtils.degToRad(a.el + (b.el - a.el) * t) + mouseNDC.y * 0.04
    // portrait screens: pull the camera back and recentre the look target so
    // the dragon stays framed instead of being cropped by the narrow FOV
    const fit = THREE.MathUtils.clamp(1.35 / camera.aspect, 1, 2)
    const txScale = Math.min(camera.aspect / 1.2, 1)
    const r = (a.r + (b.r - a.r) * t) * fit
    camera.position.set(
      r * Math.cos(el) * Math.sin(az),
      r * Math.sin(el),
      r * Math.cos(el) * Math.cos(az),
    )
    lookTarget.set((a.tx + (b.tx - a.tx) * t) * txScale, a.ty + (b.ty - a.ty) * t, 0)
    camera.lookAt(lookTarget)
  }

  const tick = () => {
    const t = clock.getElapsedTime()
    auraUniforms.uTime.value = t
    emberUniforms.uTime.value = t

    scrollCurrent += (scrollTarget - scrollCurrent) * 0.06
    cameraAt(scrollCurrent)

    // dragon: materialize, bob, and sway toward the cursor
    if (revealStart >= 0) {
      const reveal = Math.min((t - revealStart) / 1.4, 1)
      const eased = 1 - Math.pow(1 - reveal, 3)
      dragonGroup.scale.setScalar(Math.max(eased, 0.001))
      auraUniforms.uIntensity.value =
        (0.22 + 0.55 * smooth(Math.min(Math.max((scrollCurrent - 0.55) / 0.22, 0), 1))) +
        (1 - reveal) * 1.6 // bright flash while materializing
    }
    dragonGroup.position.y = Math.sin(t * 0.8) * 0.18
    dragonGroup.rotation.y += (mouseNDC.x * 0.24 - dragonGroup.rotation.y) * 0.04
    dragonGroup.rotation.x += (-mouseNDC.y * 0.08 - dragonGroup.rotation.x) * 0.04

    // aura shifts cyan -> ember as the last chapter approaches
    const emberMix = smooth(Math.min(Math.max((scrollCurrent - 0.55) / 0.22, 0), 1))
    auraUniforms.uColor.value.copy(auraCyan).lerp(auraEmber, emberMix)

    // torch follows the pointer; on touch screens it roams on its own when
    // the finger has been idle so the effect is still visible without a cursor
    if (IS_TOUCH && t - lastPointerTime > 2.5) {
      pointerActive = true
      autoDir.copy(camera.position).setY(0).normalize()
      const sweep = Math.sin(t * 0.55) * 3.5
      torchTarget.set(
        autoDir.x * 4.5 - autoDir.z * sweep,
        1.2 + Math.sin(t * 0.85) * 1.4,
        autoDir.z * 4.5 + autoDir.x * sweep,
      )
    }
    torch.position.lerp(torchTarget, 0.12)
    torch.intensity += ((pointerActive ? 55 : 0) - torch.intensity) * 0.08
    emberUniforms.uTorch.value.copy(torch.position)

    stars.rotation.y = t * 0.008

    renderer.render(scene, camera)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerdown', onPointerMove)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh || (obj as THREE.Points).isPoints) {
        mesh.geometry?.dispose()
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of mats) {
          if (!mat) continue
          for (const value of Object.values(mat)) {
            if (value instanceof THREE.Texture) value.dispose()
          }
          mat.dispose()
        }
      }
    })
    pmrem.dispose()
    renderer.dispose()
  }
}
