'use client'

import React, { useEffect, useRef, useState } from 'react'
import { initAudio, play } from '../lib/audio'

/**
 * 🚀 SPACE LEGENDS — KJSSE • SSRP
 * - Canvas par sab kuch draw hota hai (ship, rocks, stars, meteors, planets)
 * - Physics simple: velocity + wrapping (agar screen se bahar gaya → opposite side se entry)
 * - Controls:
 * ← → / A D = rotate
 * ↑ / W = thrust forward
 * S = reverse
 * Q = brake
 * SPACE = fire
 * Z = spread shot
 * SHIFT = shield
 * H = hyperspace
 * P = pause
 * R = restart
 * - Mobile: neeche on-screen buttons diye hain
 */

export default function SpaceLegends() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [score, setScore] = useState(0)
  const [high, setHigh] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [gameState, setGameState] = useState('menu') // 'menu', 'playing', 'paused', 'gameOver'
  const [shipColor, setShipColor] = useState('#FFFFFF')
  const [hasMounted, setHasMounted] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  // React renders se bachkar fast game loop — refs me store
  const keysRef = useRef<Record<string, boolean>>({})
  const touchRef = useRef({ left: false, right: false, thrust: false, fire: false, shield: false, brake: false, reverse: false })
  const rafRef = useRef<number>(0)
  const gameRef = useRef<any>({})
  const shipColorRef = useRef('#FFFFFF')
  const gameStateRef = useRef(gameState)

  // Set mounted and touch-device state only on client
  useEffect(() => {
    setHasMounted(true)
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  // High score & color load/save — localStorage
  useEffect(() => {
    try {
      const h = localStorage.getItem('space_high')
      if (h) setHigh(parseInt(h))
      const c = localStorage.getItem('space_ship_color')
      if (c) {
        setShipColor(c)
        shipColorRef.current = c
      }
    } catch {}
  }, [])

  useEffect(() => {
    shipColorRef.current = shipColor
    try {
      localStorage.setItem('space_ship_color', shipColor)
    } catch {}
  }, [shipColor])

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])


  useEffect(() => {
    // ⚙ Canvas + Context
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const DPR = Math.min(2, window.devicePixelRatio || 1)

    // 🔊 Audio boot (first user interaction ke baad fully unlock hota hai)
    initAudio()

    // 🧩 Canvas resize — crisp pixels on HiDPI
    function resize() {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * DPR
      canvas.height = rect.height * DPR
    }
    const onResize = () => resize()

    // 🎲 RNG — seed-based predictable random
    class RNG {
      constructor(public seed = Date.now() % 2147483647) {}
      next() { return (this.seed = (this.seed * 48271) % 2147483647) }
      float() { return (this.next() - 1) / 2147483646 }
      range(a: number, b: number) { return a + this.float() * (b - a) }
      pick<T>(arr: T[]) { return arr[Math.floor(this.float() * arr.length)] }
    }
    const rng = new RNG()

    // 🧠 Game State — sab yahan store hoga
    const game = gameRef.current
    game.t = 0
    game.last = 0
    game.stars = []
    game.planets = []
    game.rocks = []
    game.bullets = []
    game.sparks = []
    game.satellites = []
    game.powerups = []
    game.mines = []
    game.powerupBag = []
    game.ship = null
    game.level = 1
    game.score = 0
    game.lives = 3
    game.shield = 0
    game.obstaclesDestroyed = 0
    game.obstaclesToNextLevel = 10
    game.spawnTimer = 0
    game.meteorTimer = 0
    game.satTimer = 5
    game.powTimer = 10
    game.mineTimer = 15
    game.powerMulti = false
    game.hyperCD = 0


    // 🔄 Screen wrapping — left se nikle to right se aao (and vice-versa)
    function wrap(p: any) {
      const W = canvas.width, H = canvas.height
      if (p.x < -p.r) p.x = W + p.r
      if (p.x > W + p.r) p.x = -p.r
      if (p.y < -p.r) p.y = H + p.r
      if (p.y > H + p.r) p.y = -p.r
    }

    // ✨ Starfield — twinkle-twinkle space vibes
    function addStars() {
      game.stars = []
      const W = canvas.width, H = canvas.height
      for (let i = 0; i < 360; i++) {
        game.stars.push({
          x: rng.range(0, W), y: rng.range(0, H),
          z: rng.pick([0.5, 1, 1.5]), tw: rng.range(0, 6.28)
        })
      }
    }

    // 🪐 Planets — gradient spheres + optional rings
    function addPlanets() {
      game.planets = []
      const W = canvas.width, H = canvas.height
      for (let i = 0; i < 3; i++) {
        const r = rng.range(60 * i + 90, 140 * (i + 1))
        game.planets.push({
          x: rng.range(0, W), y: rng.range(0, H), r,
          hue: rng.range(180, 300), sp: rng.range(0.02, 0.06), a: 0,
          ring: r > 160
        })
      }
    }

    // 🚀 Ship — minimal triangle, responsive controls
    function createShip() {
      return {
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: 0,
        vy: 0,
        a: -Math.PI / 2,
        r: 18,
        thrust: 0,
        brake: 0,
        reload: 0,
        inv: 0
      }
    }

    // ☄ Asteroids & Meteors
    function spawnRock(kind: 'asteroid' | 'meteor' = 'asteroid') {
      const W = canvas.width, H = canvas.height
      const edge = rng.pick(['top', 'bottom', 'left', 'right'])
      const speed = kind === 'meteor'
        ? rng.range(1.5, 2.8)
        : rng.range(0.4, 1.2) + game.level * 0.09
      const r = kind === 'meteor' ? rng.range(10, 18) : rng.range(18, 48)
      let x = 0, y = 0
      if (edge === 'top') { x = rng.range(0, W); y = -r }
      if (edge === 'bottom') { x = rng.range(0, W); y = H + r }
      if (edge === 'left') { x = -r; y = rng.range(0, H) }
      if (edge === 'right') { x = W + r; y = rng.range(0, H) }
      const a = Math.atan2(canvas.height / 2 - y, canvas.width / 2 - x) + rng.range(-0.6, 0.6)
      game.rocks.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r, rot: rng.range(-0.03, 0.03), a: rng.range(0, 6.28),
        kind, hp: kind === 'meteor' ? 1 : Math.ceil(r / 15),
        hitTimer: 0
      })
    }

    //  спутник Satellites — hazard + bonus on destruction
    function spawnSatellite() {
      const W = canvas.width, H = canvas.height
      const y = rng.range(H * 0.2, H * 0.8)
      const dir = rng.pick([-1, 1])
      const x = dir < 0 ? W + 30 : -30
      game.satellites.push({ x, y, vx: dir * rng.range(1.2, 2), vy: rng.range(-0.1, 0.1), r: 16, a: 0 })
    }

    // ⚡ Powerups — shield / hyper / multi / life
    function refillPowerupBag() {
      game.powerupBag = ['shield', 'hyper', 'multi', 'life']
      // Fisher-Yates shuffle
      for (let i = game.powerupBag.length - 1; i > 0; i--) {
        const j = Math.floor(rng.float() * (i + 1));
        [game.powerupBag[i], game.powerupBag[j]] = [game.powerupBag[j], game.powerupBag[i]];
      }
    }

    function spawnPower() {
      if (game.powerupBag.length === 0) {
        refillPowerupBag()
      }
      const W = canvas.width, H = canvas.height
      const type = game.powerupBag.pop()
      game.powerups.push({ x: rng.range(40, W - 40), y: rng.range(40, H - 40), r: 14, type, t: 0 })
    }

    // 💣 Space Mine — new stationary hazard
    function spawnMine() {
      const W = canvas.width, H = canvas.height
      game.mines.push({
        x: rng.range(40, W - 40),
        y: rng.range(40, H - 40),
        vx: rng.range(-0.1, 0.1),
        vy: rng.range(-0.1, 0.1),
        r: 15,
        t: 0,
        fuse: 0, // 0 = not triggered
        hitTimer: 0
      })
    }

    // 🪓 Big rock splits into two — classic!
    function splitRock(rock: any) {
      if (rock.kind === 'meteor' || rock.r < 18) return
      for (let i = 0; i < 2; i++) {
        const a = rng.range(0, 6.28)
        const nr = rock.r * rng.range(0.45, 0.6)
        game.rocks.push({
          x: rock.x, y: rock.y,
          vx: Math.cos(a) * rng.range(0.6, 1.4),
          vy: Math.sin(a) * rng.range(0.6, 1.4),
          r: nr, rot: rock.rot * -1, a: rng.range(0, 6.28),
          kind: 'asteroid', hp: Math.ceil(nr / 15),
          hitTimer: 0
        })
      }
    }

    // 💥 Particle boom — juice+++
    function boom(x: number, y: number, count = 18, speed = 2) {
      for (let i = 0; i < count; i++) {
        const a = rng.range(0, 6.28)
        game.sparks.push({
          x, y,
          vx: Math.cos(a) * speed * rng.range(0.4, 1.6),
          vy: Math.sin(a) * speed * rng.range(0.4, 1.6),
          life: rng.range(0.5, 1.2)
        })
      }
    }

    // 🔫 Fire — SPACE (Z for spread, multi via powerup)
    function fire(ship: any) {
      if (ship.reload > 0) return
      ship.reload = 0.15

      const isMultiPowerup = game.powerMulti
      const isSpreadManual = keysRef.current['KeyZ']

      // Determine number of bullets and spread angle based on power-ups/keys
      const multi = isMultiPowerup ? 3 : (isSpreadManual ? 2 : 1)
      const spread = isMultiPowerup ? 0.2 : (isSpreadManual ? 0.15 : 0)

      for (let i = 0; i < multi; i++) {
        // Calculate the angle for each bullet in the spread
        const da = (i - (multi - 1) / 2) * spread
        const a = ship.a + da
        const sp = 4
        game.bullets.push({
          x: ship.x + Math.cos(a) * ship.r,
          y: ship.y + Math.sin(a) * ship.r,
          vx: ship.vx + Math.cos(a) * sp,
          vy: ship.vy + Math.sin(a) * sp,
          life: 1.2
        })
      }
      play('pew')
    }

    // 🎨 Background render — nebula + planets + stars
    function drawBackground(dt: number) {
      const W = canvas.width, H = canvas.height

      // Solid dark background (dark blue)
      ctx.fillStyle = 'hsl(240, 50%, 10%)'
      ctx.fillRect(0, 0, W, H)

      // Nebula gradient — cinematic feel, layered over dark base
      const g = ctx.createRadialGradient(W * 0.1, H * 0.1, 0, W * 0.6, H * 0.4, Math.max(W, H))
      g.addColorStop(0, 'hsla(220, 70%, 50%, 0.2)')
      g.addColorStop(1, 'hsla(260, 70%, 15%, 0.15)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)

      // Planets
      for (const p of game.planets) {
        p.a += p.sp * dt
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.a)
        const rg = ctx.createRadialGradient(-p.r * 0.4, -p.r * 0.4, p.r * 0.2, 0, 0, p.r)
        rg.addColorStop(0, `hsla(${p.hue}, 80%, 70%, 0.9)`)
        rg.addColorStop(1, `hsla(${p.hue}, 80%, 25%, 0.9)`)
        ctx.fillStyle = rg
        ctx.beginPath()
        ctx.arc(0, 0, p.r, 0, Math.PI * 2)
        ctx.fill()
        if (p.r > 160) {
          ctx.globalAlpha = 0.35
          ctx.strokeStyle = `hsla(${p.hue + 40}, 80%, 75%, 0.8)`
          ctx.lineWidth = 6
          ctx.beginPath()
          ctx.ellipse(0, 0, p.r * 1.6, p.r * 0.6, Math.PI / 6, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        ctx.restore()
      }

      // Stars — twinkle
      ctx.save()
      for (const s of game.stars) {
        s.tw += dt * (0.5 + s.z * 0.2)
        const b = 0.6 + Math.sin(s.tw) * 0.4
        ctx.globalAlpha = 0.3 + b * 0.7
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
        ctx.fillRect(s.x, s.y, s.z, s.z)
      }
      ctx.restore()
    }

    // 🚀 Ship render — triangle + thruster + shield aura
    function drawShip(ship: any, flicker = false) {
      const { x, y, a, r } = ship
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(a)
      if (game.shield > 0) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(game.t * 8)
        ctx.strokeStyle = '#7ee7ff'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      if (!flicker) {
        ctx.strokeStyle = shipColorRef.current
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(r, 0)
        ctx.lineTo(-r * 0.8, -r * 0.7)
        ctx.lineTo(-r * 0.3, 0)
        ctx.lineTo(-r * 0.8, r * 0.7)
        ctx.closePath()
        ctx.stroke()
      }
      if (ship.thrust > 0.1 && !flicker) {
        ctx.strokeStyle = '#9be7ff'
        ctx.beginPath()
        ctx.moveTo(-r * 0.8, 0)
        ctx.lineTo(-r * 1.2 - Math.random() * 6, -3)
        ctx.moveTo(-r * 0.8, 0)
        ctx.lineTo(-r * 1.2 - Math.random() * 6, 3)
        ctx.stroke()
      }
      if (ship.brake > 0.5 && !flicker) {
        ctx.strokeStyle = '#ff9b9b'
        ctx.beginPath()
        ctx.moveTo(r * 0.8, 0)
        ctx.lineTo(r * 1.2 + Math.random() * 6, -3)
        ctx.moveTo(r * 0.8, 0)
        ctx.lineTo(r * 1.2 + Math.random() * 6, 3)
        ctx.stroke()
      }
      ctx.restore()
    }

    // 🪨 Rock draw — jagged outline, meteor color different
    function drawRock(rk: any) {
      ctx.save()
      ctx.translate(rk.x, rk.y)
      ctx.rotate(rk.a)
      ctx.strokeStyle = rk.hitTimer > 0 ? '#FFFFFF' : (rk.kind === 'meteor' ? '#ffcc88' : '#cbd5e1')
      ctx.lineWidth = 2
      ctx.beginPath()
      const n = rk.kind === 'meteor' ? 6 : 10
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2
        const rr = rk.r * (0.7 + 0.4 * Math.sin(i * 1.7 + rk.a * 0.9))
        const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }

    //  спутник Satellite draw — lil panels + dish
    function drawSatellite(s: any) {
      ctx.save()
      ctx.translate(s.x, s.y)
      ctx.rotate(s.a)
      ctx.strokeStyle = '#b3e6ff'
      ctx.lineWidth = 2
      ctx.strokeRect(-8, -6, 16, 12)
      ctx.beginPath()
      ctx.arc(10, 0, 5, -Math.PI / 2, Math.PI / 2)
      ctx.stroke()
      ctx.strokeRect(-26, -4, 16, 8)
      ctx.strokeRect(10, -4, 16, 8)
      ctx.restore()
    }

    // 💣 Space Mine draw
    function drawMine(m: any) {
      ctx.save()
      ctx.translate(m.x, m.y)
      ctx.strokeStyle = m.hitTimer > 0 ? '#FFFFFF' : '#fca5a5'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, m.r, 0, Math.PI * 2)
      ctx.stroke()

      const blinkSpeed = m.fuse > 0 ? 30 : 4
      const blink = Math.sin(m.t * blinkSpeed) > 0
      if (blink) {
        ctx.fillStyle = m.fuse > 0 ? '#ef4444' : '#f87171' // Red / Light Red
        ctx.beginPath()
        ctx.arc(0, 0, m.r * 0.4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    // 🧿 Powerup draw — glyph per type
    function drawPower(p: any) {
      ctx.save()
      ctx.translate(p.x, p.y)
      p.t += 0.03
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(p.t * 3)
      ctx.lineWidth = 2
      const colors = {
        shield: '#7ee7ff',
        hyper: '#d4bfff',
        multi: '#a7f3d0',
        life: '#6ee7b7'
      }
      ctx.strokeStyle = colors[p.type as keyof typeof colors] || '#FFFFFF'

      ctx.beginPath()
      ctx.arc(0, 0, p.r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      if (p.type === 'shield') { ctx.arc(0, 0, p.r * 0.6, 0, Math.PI * 2) }
      if (p.type === 'hyper') { ctx.moveTo(-p.r * 0.6, 0); ctx.lineTo(0, -p.r * 0.6); ctx.lineTo(p.r * 0.6, 0) }
      if (p.type === 'multi') { ctx.moveTo(-5, -5); ctx.lineTo(5, 5); ctx.moveTo(-5, 5); ctx.lineTo(5, -5) }
      if (p.type === 'life') {
        const r = p.r * 0.6
        ctx.moveTo(0, r * 0.4)
        ctx.arc(-r * 0.4, -r * 0.1, r * 0.6, 0.25 * Math.PI, 1.25 * Math.PI)
        ctx.arc(r * 0.4, -r * 0.1, r * 0.6, -0.25 * Math.PI, 0.75 * Math.PI)
        ctx.lineTo(0, r * 0.4)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.restore()
    }

    // 🧰 HUD — score, lives, level, pause/gameover
    function hud() {
      const W = canvas.width, H = canvas.height
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(12, 12, 280, 108)
      ctx.fillStyle = '#e2e8f0'
      ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto'
      ctx.fillText('KJSSE • SSRP', 20, 34)
      ctx.fillText(`Score: ${game.score}`, 20, 56)
      ctx.fillText(`Lives: ${game.lives}   Level: ${game.level}`, 20, 78)
      ctx.fillText(`Destroyed: ${game.obstaclesDestroyed} / ${game.obstaclesToNextLevel}`, 20, 100)
      ctx.restore()
    }

    // 🔍 Circle hit-test
    function collide(a: any, b: any) {
      const dx = a.x - b.x, dy = a.y - b.y
      const rr = (a.r || 0) + (b.r || 0)
      return dx * dx + dy * dy <= rr * rr
    }

    // ♻ Level reset / start
    function reset(levelUp = false) {
      game.rocks.length = 0
      game.bullets.length = 0
      game.sparks.length = 0
      game.satellites.length = 0
      game.powerups.length = 0
      game.mines.length = 0
      game.ship = createShip()
      game.shield = 1.0
      if (levelUp) {
        game.level++
        for (let i = 0; i < 2 + Math.min(6, game.level); i++) spawnRock()
        game.obstaclesDestroyed = 0
        game.obstaclesToNextLevel = 10 + (game.level - 1) * 5
      } else {
        game.level = 1
        for (let i = 0; i < 4; i++) spawnRock()
        game.obstaclesDestroyed = 0
        game.obstaclesToNextLevel = 10
      }
    }

    // 🧼 Full restart (R)
    function fullRestart() {
      game.score = 0
      game.lives = 3
      game.level = 1
      reset(false)
    }

    gameRef.current.fullRestart = fullRestart

    // 🏁 INIT
    resize()
    addStars()
    addPlanets()
    game.ship = createShip()
    refillPowerupBag()

    // 🧮 Core update — inputs → physics → collisions → spawns → score/level
    function update(dt: number) {
      const W = canvas.width, H = canvas.height
      const ship = game.ship
      game.t += dt

      // 🎮 Inputs (keyboard + touch)
      const k = keysRef.current, t = touchRef.current
      if (k['ArrowLeft'] || k['KeyA'] || t.left) ship.a -= 4 * dt
      if (k['ArrowRight'] || k['KeyD'] || t.right) ship.a += 4 * dt
      if (k['ArrowUp'] || k['KeyW'] || t.thrust) ship.thrust = Math.min(1, ship.thrust + 4 * dt)
      else ship.thrust = Math.max(0, ship.thrust - 5 * dt)
      if (k['KeyS'] || t.reverse) ship.brake = Math.min(1, ship.brake + 4 * dt)
      else ship.brake = Math.max(0, ship.brake - 5 * dt)
      if (k['Space'] || t.fire) fire(ship)
      if (k['ShiftLeft'] || k['ShiftRight'] || t.shield) game.shield = Math.min(3.5, game.shield + 0.5 * dt)

      // 🌀 Hyperspace (H)
      if (k['KeyH'] && !game.hyperCD) {
        game.hyperCD = 3
        boom(ship.x, ship.y, 24, 3)
        ship.x = rng.range(80, W - 80)
        ship.y = rng.range(80, H - 80)
        ship.vx *= 0.2
        ship.vy *= 0.2
      }
      if (game.hyperCD) game.hyperCD = Math.max(0, game.hyperCD - dt)

      // 🚀 Ship physics
      // Brake (Q)
      if (k['KeyQ'] || t.brake) {
        ship.vx *= 0.95
        ship.vy *= 0.95
      }

      // Reverse (S)
      if (ship.brake > 0) {
        // also apply braking friction when reversing
        ship.vx *= 0.95
        ship.vy *= 0.95
        // apply backward thrust
        if (ship.brake > 0.5) {
          ship.vx += Math.cos(ship.a + Math.PI) * ship.brake * 0.4
          ship.vy += Math.sin(ship.a + Math.PI) * ship.brake * 0.4
        }
      } else {
        // Normal forward thrust
        ship.vx += Math.cos(ship.a) * ship.thrust * 0.18
        ship.vy += Math.sin(ship.a) * ship.thrust * 0.18
      }
      ship.vx *= 0.985
      ship.vy *= 0.985
      ship.x += ship.vx
      ship.y += ship.vy
      wrap(ship)
      if (ship.reload > 0) ship.reload -= dt
      if (ship.inv > 0) ship.inv -= dt
      if (game.shield > 0) game.shield = Math.max(0, game.shield - dt * 0.3)

      // 🔫 Bullets
      for (let i = game.bullets.length - 1; i >= 0; i--) {
        const b = game.bullets[i]
        b.x += b.vx * (1 + game.level * 0.02)
        b.y += b.vy * (1 + game.level * 0.02)
        b.life -= dt
        if (b.life <= 0) game.bullets.splice(i, 1)
        wrap(b)
      }

      // ☄ Rocks
      for (let i = game.rocks.length - 1; i >= 0; i--) {
        const r = game.rocks[i]
        r.x += r.vx; r.y += r.vy
        r.a += r.rot
        if (r.hitTimer > 0) r.hitTimer -= dt
        wrap(r)
      }

      //  спутник Satellites
      for (let i = game.satellites.length - 1; i >= 0; i--) {
        const s = game.satellites[i]
        s.x += s.vx; s.y += s.vy
        s.a += 0.01
        if (s.x < -40 || s.x > W + 40) game.satellites.splice(i, 1)
      }

      // 💣 Mines
      for (let i = game.mines.length - 1; i >= 0; i--) {
        const m = game.mines[i]
        m.x += m.vx; m.y += m.vy
        m.t += dt
        if (m.hitTimer > 0) m.hitTimer -= dt
        wrap(m)

        // If fuse is lit, countdown
        if (m.fuse > 0) {
          m.fuse -= dt
          if (m.fuse <= 0) {
            // EXPLODE!
            play('boom')
            boom(m.x, m.y, 40, 4)
            const blast = { x: m.x, y: m.y, r: 120 }

            // Check if player is in blast
            if (gameStateRef.current !== 'gameOver' && (game.shield <= 0 && ship.inv <= 0) && collide(blast, ship)) {
              game.lives -= 1; setLives(game.lives)
              boom(ship.x, ship.y, 28, 3)
              ship.x = W / 2; ship.y = H / 2
              ship.vx = 0; ship.vy = 0
              ship.inv = 1.2; game.shield = 1.0
              if (game.lives <= 0) setGameState('gameOver')
            }

            // Check if rocks are in blast
            for (let j = game.rocks.length - 1; j >= 0; j--) {
              const r = game.rocks[j]
              if (collide(blast, r)) {
                boom(r.x, r.y, 16, 2)
                splitRock(r)
                game.rocks.splice(j, 1)
                game.score += r.kind === 'meteor' ? 30 : Math.round(50 + r.r)
                game.obstaclesDestroyed++
              }
            }

            game.mines.splice(i, 1)
          }
          continue
        }

        // Check for ship proximity to trigger
        const shipBody = { x: ship.x, y: ship.y, r: ship.r }
        if (collide({ ...m, r: m.r + 80 }, shipBody)) {
          m.fuse = 1.0
        }
      }

      // ⚡ Powerups collect
      for (let i = game.powerups.length - 1; i >= 0; i--) {
        const p = game.powerups[i]
        if (collide({ x: ship.x, y: ship.y, r: ship.r }, p)) {
          if (p.type === 'shield') game.shield = 3.5
          if (p.type === 'hyper') game.hyperCD = 0
          if (p.type === 'multi') { game.powerMulti = true; setTimeout(() => { game.powerMulti = false }, 8000) }
          if (p.type === 'life') { game.lives = Math.min(5, game.lives + 1) }
          boom(p.x, p.y, 10, 1.5)
          play('power')
          game.powerups.splice(i, 1)
        }
      }

      // ✨ Sparks fade
      for (let i = game.sparks.length - 1; i >= 0; i--) {
        const s = game.sparks[i]
        s.x += s.vx
        s.y += s.vy
        s.life -= dt * 0.8
        if (s.life <= 0) game.sparks.splice(i, 1)
      }

      // 📈 Spawns pacing — balanced chaos
      game.spawnTimer -= dt
      if (game.spawnTimer <= 0) { spawnRock(); game.spawnTimer = Math.max(0.6, 2.5 - game.level * 0.15) }
      game.meteorTimer -= dt
      if (game.meteorTimer <= 0) { spawnRock('meteor'); game.meteorTimer = 2.5 + Math.random() * 2.5 - game.level * 0.05 }
      game.satTimer -= dt
      if (game.satTimer <= 0) { spawnSatellite(); game.satTimer = 6 + Math.random() * 5 }
      game.powTimer -= dt
      if (game.powTimer <= 0) { spawnPower(); game.powTimer = 6 + Math.random() * 5 }
      game.mineTimer -= dt
      if (game.mineTimer <= 0) { spawnMine(); game.mineTimer = 12 + Math.random() * 8 }


      // 🔫 vs ENTITIES — bullet collisions
      for (let j = game.bullets.length - 1; j >= 0; j--) {
        const b = game.bullets[j]

        // vs Rocks
        for (let i = game.rocks.length - 1; i >= 0; i--) {
          const r = game.rocks[i]
          if (collide({ x: r.x, y: r.y, r: r.r }, { x: b.x, y: b.y, r: 6 })) {
            r.hp -= 1
            r.hitTimer = 0.1
            game.bullets.splice(j, 1)
            boom(b.x, b.y, 6, 1.2)
            if (r.hp <= 0) {
              boom(r.x, r.y, 16, 2)
              play('boom')
              splitRock(r)
              game.rocks.splice(i, 1)
              game.score += r.kind === 'meteor' ? 30 : Math.round(50 + r.r)
              game.obstaclesDestroyed++
            }
            break
          }
        }
        if (!game.bullets[j]) continue

        // vs Mines
        for (let i = game.mines.length - 1; i >= 0; i--) {
          const m = game.mines[i]
          if (m.fuse <= 0 && collide(m, { x: b.x, y: b.y, r: 6 })) {
            m.fuse = 1.0 // trigger the fuse
            m.hitTimer = 0.1
            game.bullets.splice(j, 1)
            boom(b.x, b.y, 6, 1.2)
            break
          }
        }
      }

      // ☠ Hazards vs Ship
      const shipBody = { x: ship.x, y: ship.y, r: ship.r * 0.9 }
      if (gameStateRef.current !== 'gameOver') {
        // rocks hit
        for (let i = game.rocks.length - 1; i >= 0; i--) {
          const r = game.rocks[i]
          if (collide(shipBody, r)) {
            if (game.shield > 0 || ship.inv > 0) {
              boom(r.x, r.y, 10, 1.5)
              splitRock(r)
              game.rocks.splice(i, 1)
              game.score += 20
              game.obstaclesDestroyed++
              continue
            }
            // lose a life
            game.lives -= 1
            setLives(game.lives)
            play('hit')
            boom(ship.x, ship.y, 28, 3)
            ship.x = W / 2
            ship.y = H / 2
            ship.vx = 0
            ship.vy = 0
            ship.a = -Math.PI / 2
            ship.inv = 1.2
            game.shield = 1.0
            if (game.lives <= 0) {
              setGameState('gameOver')
              setHigh(h => {
                const nh = Math.max(h, game.score)
                try { localStorage.setItem('space_high', String(nh)) } catch {}
                return nh
              })
            }
            break
          }
        }
        // satellites hit
        for (let i = game.satellites.length - 1; i >= 0; i--) {
          const s = game.satellites[i]
          if (collide(shipBody, { ...s, r: 12 })) {
            if (game.shield > 0 || ship.inv > 0) {
              boom(s.x, s.y, 16, 2)
              continue
            }
            game.lives -= 1
            setLives(game.lives)
            play('hit')
            boom(ship.x, ship.y, 28, 3)
            ship.x = W / 2
            ship.y = H / 2
            ship.vx = 0
            ship.vy = 0
            ship.a = -Math.PI / 2
            ship.inv = 1.2
            game.shield = 1.0
            if (game.lives <= 0) {
              setGameState('gameOver')
              setHigh(h => {
                const nh = Math.max(h, game.score)
                try { localStorage.setItem('space_high', String(nh)) } catch {}
                return nh
              })
            }
            break
          }
        }
      }

      // 🎚 Level progression — destroy obstacles
      if (game.obstaclesDestroyed >= game.obstaclesToNextLevel) {
        reset(true)
      }

      // ↔ Sync lightweight UI bits
      setScore(game.score)
      setLevel(game.level)
      setLives(game.lives)
    }

    // 🖼 Render — everything visible
    function render(dt: number) {
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      drawBackground(dt)

      if (gameStateRef.current !== 'menu') {
        // world
        for (const r of game.rocks) drawRock(r)
        for (const s of game.satellites) drawSatellite(s)
        for (const m of game.mines) drawMine(m)


        // bullets (streak lines, increased size)
        ctx.save()
        ctx.strokeStyle = '#e2e8f0'
        ctx.lineWidth = 7
        for (const b of game.bullets) {
          ctx.beginPath()
          ctx.moveTo(b.x - b.vx * 0.8, b.y - b.vy * 0.8)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
        ctx.restore()

        // sparks
        ctx.save()
        ctx.strokeStyle = '#94a3b8'
        for (const s of game.sparks) {
          ctx.globalAlpha = Math.max(0, s.life)
          ctx.beginPath()
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(s.x - s.vx * 2, s.y - s.vy * 2)
          ctx.stroke()
        }
        ctx.restore()

        // powerups
        for (const p of game.powerups) drawPower(p)

        // ship
        const flicker = (game.ship.inv || 0) > 0 && Math.floor(game.t * 10) % 2 === 0
        if (gameStateRef.current !== 'gameOver') {
          drawShip(game.ship, flicker)
        }


        // hud
        hud()
      }
    }

    // ♾ Main loop — fixed max step, buttery smooth
    function loop(ts: number) {
      const t = ts / 1000
      const dt = Math.min(0.033, game.last ? t - game.last : 0.016)
      game.last = t
      if (gameStateRef.current === 'playing') update(dt)
      render(dt)
      rafRef.current = requestAnimationFrame(loop)
    }

    // ⌨ Keyboard input
    const down = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyS', 'KeyQ'].includes(e.code)) e.preventDefault()
      keysRef.current[e.code] = true
      if (e.code === 'KeyP') {
        setGameState(current => current === 'playing' ? 'paused' : (current === 'paused' ? 'playing' : current))
      }
    }
    const up = (e: KeyboardEvent) => { keysRef.current[e.code] = false }

    // 📱 Touch glue — Part 3 buttons call window.__setTouch(...)
    const setTouch = (k: keyof typeof touchRef.current, v: boolean) => {
      if (gameRef.current) { // Ensure game is initialized
        touchRef.current[k] = v
      }
    }
    ;(window as any).__setTouch = setTouch

    // 🔗 Bind + Start
    window.addEventListener('keydown', down as any, { passive: false })
    window.addEventListener('keyup', up as any)
    window.addEventListener('resize', onResize)
    rafRef.current = requestAnimationFrame(loop)

    // 🧹 Cleanup
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', down as any)
      window.removeEventListener('keyup', up as any)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const handleStartGame = () => {
    if (gameRef.current?.fullRestart) {
      gameRef.current.fullRestart()
      setGameState('playing')
    }
  }

  const menuStyles: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'rgba(15, 23, 42, 0.8)',
    color: '#e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    fontFamily: 'system-ui, sans-serif'
  }

  const buttonStyles: React.CSSProperties = {
    background: '#334155',
    color: '#e2e8f0',
    border: '1px solid #64748b',
    padding: '12px 24px',
    fontSize: '20px',
    cursor: 'pointer',
    marginTop: '20px'
  }

  const infoBoxStyles: React.CSSProperties = {
    background: 'rgba(0,0,0,0.2)',
    padding: '15px',
    borderRadius: '5px',
    textAlign: 'left',
    width: '280px',
    fontSize: '14px'
  }

  const powerupRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '10px 0'
  }

  const touchControlContainer: React.CSSProperties = {
    position: 'absolute',
    bottom: '20px',
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0 20px',
    boxSizing: 'border-box',
    pointerEvents: 'none' // Let clicks pass through the container
  }

  const touchButton: React.CSSProperties = {
    width: '60px',
    height: '60px',
    background: 'rgba(255, 255, 255, 0.2)',
    border: '2px solid rgba(255, 255, 255, 0.4)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '24px',
    userSelect: 'none',
    pointerEvents: 'auto' // Make buttons clickable
  }

  const touchActionGroup: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '15px',
    justifyContent: 'center',
    width: '180px'
  }

  const setTouch = (k: keyof typeof touchRef.current, v: boolean) => {
    if ((window as any).__setTouch) {
      (window as any).__setTouch(k, v)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', background: 'hsl(240, 50%, 10%)' }} />

      {hasMounted && gameState === 'menu' && (
        <div style={menuStyles}>
          <h1 style={{ fontSize: '48px', margin: '0 0 10px 0', letterSpacing: '2px' }}>SPACE LEGENDS</h1>
          <h2 style={{ fontSize: '24px', margin: '0 0 30px 0', color: '#94a3b8' }}>High Score: {high}</h2>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <div style={infoBoxStyles}>
              <h3 style={{ marginTop: 0 }}>Controls:</h3>
              <p style={{ margin: '5px 0' }}>Rotate: ← → / A D</p>
              <p style={{ margin: '5px 0' }}>Thrust: ↑ / W</p>
              <p style={{ margin: '5px 0' }}>Brake / Reverse: Q / S</p>
              <p style={{ margin: '5px 0' }}>Fire / Spread Fire: SPACE / Z</p>
              <p style={{ margin: '5px 0' }}>Shield / Hyperspace: SHIFT / H</p>
              <p style={{ margin: '5px 0' }}>Pause: P</p>
            </div>
            <div style={infoBoxStyles}>
              <h3 style={{ marginTop: 0 }}>Power-Ups:</h3>
              <div style={powerupRowStyle}>
                <svg width="20" height="20" viewBox="-15 -15 30 30"><circle cx="0" cy="0" r="13" stroke="#7ee7ff" strokeWidth="2" fill="none" /><circle cx="0" cy="0" r="8" stroke="#7ee7ff" strokeWidth="2" fill="none" /></svg>
                <span>Temporary energy shield.</span>
              </div>
              <div style={powerupRowStyle}>
                <svg width="20" height="20" viewBox="-10 -10 20 20"><path d="M -8 0 L 0 -8 L 8 0" stroke="#d4bfff" strokeWidth="2.5" fill="none" /></svg>
                <span>Instantly recharges hyperspace.</span>
              </div>
              <div style={powerupRowStyle}>
                <svg width="20" height="20" viewBox="-8 -8 16 16"><line x1="-6" y1="-6" x2="6" y2="6" stroke="#a7f3d0" strokeWidth="2.5" /><line x1="-6" y1="6" x2="6" y2="-6" stroke="#a7f3d0" strokeWidth="2.5" /></svg>
                <span>Fire three bullets at once.</span>
              </div>
              <div style={powerupRowStyle}>
                <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="#6ee7b7" strokeWidth="2" fill="none"/></svg>
                <span>Grants one extra life (max 5).</span>
              </div>
            </div>
          </div>
          <button onClick={handleStartGame} style={buttonStyles}>Start Game</button>
        </div>
      )}

      {hasMounted && gameState === 'paused' && (
        <div style={menuStyles}>
          <h1 style={{ fontSize: '48px' }}>PAUSED</h1>
          <p>Press 'P' to resume</p>
        </div>
      )}

      {hasMounted && gameState === 'gameOver' && (
        <div style={menuStyles}>
          <h1 style={{ fontSize: '48px' }}>GAME OVER</h1>
          <h2 style={{ fontSize: '24px' }}>Final Score: {score}</h2>
          <button onClick={handleStartGame} style={buttonStyles}>Play Again</button>
        </div>
      )}


      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        background: 'rgba(0,0,0,0.35)',
        padding: '8px',
        borderRadius: '4px',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        visibility: gameState === 'playing' || gameState === 'paused' ? 'visible' : 'hidden'
      }}>
        <label htmlFor="shipColor">Ship Color:</label>
        <input
          id="shipColor"
          type="color"
          value={shipColor}
          onChange={(e) => setShipColor(e.target.value)}
          style={{ background: 'none', border: 'none', width: '32px', height: '24px', cursor: 'pointer' }}
        />
      </div>

      {hasMounted && gameState === 'playing' && isTouchDevice && (
        <div style={touchControlContainer}>
          <div style={touchActionGroup}>
            <div style={touchButton} onTouchStart={() => setTouch('left', true)} onTouchEnd={() => setTouch('left', false)} onMouseDown={() => setTouch('left', true)} onMouseUp={() => setTouch('left', false)} onMouseLeave={() => setTouch('left', false)}>
              <span>&#8634;</span>
            </div>
            <div style={touchButton} onTouchStart={() => setTouch('right', true)} onTouchEnd={() => setTouch('right', false)} onMouseDown={() => setTouch('right', true)} onMouseUp={() => setTouch('right', false)} onMouseLeave={() => setTouch('right', false)}>
              <span>&#8635;</span>
            </div>
          </div>
          <div style={{...touchActionGroup, justifyContent: 'flex-end' }}>
            <div style={{...touchButton, fontSize: '14px'}} onTouchStart={() => setTouch('brake', true)} onTouchEnd={() => setTouch('brake', false)} onMouseDown={() => setTouch('brake', true)} onMouseUp={() => setTouch('brake', false)} onMouseLeave={() => setTouch('brake', false)}>
              <span>BRK</span>
            </div>
             <div style={{...touchButton, fontSize: '14px'}} onTouchStart={() => setTouch('reverse', true)} onTouchEnd={() => setTouch('reverse', false)} onMouseDown={() => setTouch('reverse', true)} onMouseUp={() => setTouch('reverse', false)} onMouseLeave={() => setTouch('reverse', false)}>
              <span>REV</span>
            </div>
            <div style={touchButton} onTouchStart={() => setTouch('shield', true)} onTouchEnd={() => setTouch('shield', false)} onMouseDown={() => setTouch('shield', true)} onMouseUp={() => setTouch('shield', false)} onMouseLeave={() => setTouch('shield', false)}>
              <span>🛡️</span>
            </div>
            <div style={touchButton} onTouchStart={() => setTouch('fire', true)} onTouchEnd={() => setTouch('fire', false)} onMouseDown={() => setTouch('fire', true)} onMouseUp={() => setTouch('fire', false)} onMouseLeave={() => setTouch('fire', false)}>
              <span>🔥</span>
            </div>
            <div style={touchButton} onTouchStart={() => setTouch('thrust', true)} onTouchEnd={() => setTouch('thrust', false)} onMouseDown={() => setTouch('thrust', true)} onMouseUp={() => setTouch('thrust', false)} onMouseLeave={() => setTouch('thrust', false)}>
              <span>🚀</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}