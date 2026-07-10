import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createDragonScene } from './three/dragonScene'

function TiltCard({ icon, title, text }: { icon: string; title: string; text: string }) {
  const ref = useRef<HTMLDivElement>(null)

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    // tilt is a hover affordance; skip it for touch so cards don't wobble while scrolling
    if (e.pointerType !== 'mouse') return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    el.style.setProperty('--rx', `${(0.5 - y) * 14}deg`)
    el.style.setProperty('--ry', `${(x - 0.5) * 14}deg`)
    el.style.setProperty('--mx', `${x * 100}%`)
    el.style.setProperty('--my', `${y * 100}%`)
  }

  const onLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  return (
    <div ref={ref} className="tilt-card" onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="tilt-card-glare" />
      <span className="tilt-card-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [progress, setProgress] = useState(0)
  const [loadPct, setLoadPct] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    return createDragonScene(canvasRef.current, {
      onProgress: (f) => setLoadPct(Math.round(f * 100)),
      onReady: () => setReady(true),
    })
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? window.scrollY / max : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.classList.add('visible')
        }
      },
      { threshold: 0.25 },
    )
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="webgl" />
      <div className="progress-bar" style={{ transform: `scaleX(${progress})` }} />

      <div className={`loader ${ready ? 'loader-done' : ''}`}>
        <span className="loader-logo">LUMINA</span>
        <div className="loader-track">
          <div className="loader-fill" style={{ width: `${loadPct}%` }} />
        </div>
        <span className="loader-pct">summoning the dragon &middot; {loadPct}%</span>
      </div>

      <nav className="nav">
        <span className="nav-logo">LUMINA</span>
        <div className="nav-links">
          <a href="#awaken">Awaken</a>
          <a href="#wings">Wings</a>
          <a href="#scales">Scales</a>
          <a href="#ember">Ember</a>
        </div>
      </nav>

      <main>
        <header className="hero">
          <p className="hero-kicker reveal">a dragon &middot; a torch &middot; a flythrough</p>
          <h1 className="hero-title reveal">LUMINA</h1>
          <p className="hero-sub reveal">
            Your cursor is a torch &mdash; move it, or drag a finger, and watch the light crawl
            across her scales. Scroll, and the camera flies around her.
          </p>
          <div className="scroll-hint reveal">
            <span className="scroll-hint-wheel" />
            scroll
          </div>
        </header>

        <section className="chapter chapter-left" id="awaken">
          <div className="chapter-inner reveal">
            <span className="chapter-num">01</span>
            <h2>Awaken</h2>
            <p>
              The camera drifts in close. She notices the torch &mdash; bring your cursor near her
              face and she leans toward the warmth, the light catching each horn and tooth.
            </p>
          </div>
        </section>

        <section className="chapter chapter-right" id="wings">
          <div className="chapter-inner reveal">
            <span className="chapter-num">02</span>
            <h2>Wings</h2>
            <p>
              Halfway around now. From the side, her folded wings span the frame, rim-lit violet
              from behind. Sweep the torch across the membrane and watch it glow from within.
            </p>
          </div>
        </section>

        <section className="chapter chapter-left" id="scales">
          <div className="chapter-inner reveal">
            <span className="chapter-num">03</span>
            <h2>Scales</h2>
            <p>
              Over her shoulder, closer than you should be. Every scale is real geometry &mdash;
              three hundred thousand vertices of it &mdash; with normal-mapped ridges that shift
              as your torchlight moves.
            </p>
          </div>
        </section>

        <section className="chapter chapter-right chapter-ember" id="ember">
          <div className="chapter-inner reveal">
            <span className="chapter-num">04</span>
            <h2>Ember</h2>
            <p>
              The circle closes and her aura ignites &mdash; the cyan shimmer along her silhouette
              turns to molten gold, and the sparks drifting around her scatter from your cursor
              like startled fireflies.
            </p>
          </div>
        </section>

        <section className="cards">
          <h2 className="cards-title reveal">Under the hood</h2>
          <div className="cards-grid">
            <div className="reveal" style={{ transitionDelay: '0ms' }}>
              <TiltCard
                icon="◈"
                title="Real glTF model"
                text="The actual 24 MB dragon — 306k vertices with PBR base color, normal, and roughness maps — lit by an environment probe and tone-mapped with ACES."
              />
            </div>
            <div className="reveal" style={{ transitionDelay: '120ms' }}>
              <TiltCard
                icon="◉"
                title="Cursor torchlight"
                text="A warm point light rides a ray from the camera through your pointer, hovering just in front of the dragon so the lighting follows you around her."
              />
            </div>
            <div className="reveal" style={{ transitionDelay: '240ms' }}>
              <TiltCard
                icon="◬"
                title="Scroll cinematography"
                text="The camera flies a keyframed orbit — six framings, one per section, eased and azimuth-continuous so the whole page is a single unbroken shot."
              />
            </div>
            <div className="reveal" style={{ transitionDelay: '360ms' }}>
              <TiltCard
                icon="⬡"
                title="Fresnel aura"
                text="A second mesh shares the dragon's geometry and renders an additive fresnel rim that pulses, flares on arrival, and turns ember-gold at the finale."
              />
            </div>
          </div>
        </section>

        <footer className="footer reveal">
          <p>Built with Three.js, React &amp; one small dragon.</p>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault()
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            Fly back to the start ↑
          </a>
        </footer>
      </main>
    </>
  )
}
