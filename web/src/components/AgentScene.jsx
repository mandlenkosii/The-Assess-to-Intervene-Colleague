// The colleague as an orbit: the goal sits at the core, seven agents revolve around it, and every
// message between them is drawn as a lit packet — gold for a hand-off, violet for the core
// coordinating an agent, pink for a correction sent back. The outer ring is the teacher's approval gate.
// Animates only while visible, honours reduced motion, and falls back to SVG without WebGL.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export const AGENTS = [
  { name: "Planner", role: "Reads the rubric and plans the batches" },
  { name: "Marker", role: "Marks each script with quoted evidence" },
  { name: "Reviewer", role: "Re-marks a sample blind and rejects drift" },
  { name: "Diagnostician", role: "Finds each learner's root gap" },
  { name: "Builder", role: "Writes a catch-up task per gap" },
  { name: "Checker", role: "Checks every task before it ships" },
  { name: "Delivery", role: "Sends feedback once you approve" },
];
const agentNames = AGENTS.map((a) => a.name);
const C = {
  bg: "#07070C", gold: "#F2C75C", violet: "#8B7CF6", pink: "#F472B6", silver: "#D8D5E3", ink: "#EDEBF3",
};
const ORBIT_R = 3.6;
const GATE_R = 4.75;
const HALF_W = 5.6;   // world units that must fit left/right
const HALF_H = 3.25;  // and up/down (tilted orbit + labels)
const TRAIL = 9;

function SvgFallback() {
  return (
    <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid meet" aria-hidden="true" className="orbit-fallback">
      <ellipse cx="200" cy="110" rx="170" ry="58" className="orbit-fallback-gate" />
      <ellipse cx="200" cy="110" rx="130" ry="44" className="orbit-fallback-ring" />
      <circle cx="200" cy="110" r="16" className="orbit-fallback-core" />
      {AGENTS.map((a, i) => {
        const t = (i / AGENTS.length) * Math.PI * 2 + Math.PI / 2;
        return <circle key={a.name} cx={200 + Math.cos(t) * 130} cy={110 + Math.sin(t) * 44} r="7" className="orbit-fallback-node" />;
      })}
    </svg>
  );
}

function glowTexture(THREE) {
  const s = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const g = canvas.getContext("2d");
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function AgentScene({ activeAgent, approved = false, isRunning = false, ambient = false, onPulseReady, label = "Seven agents orbiting the colleague's goal and passing work between them" }, ref) {
  const hostRef = useRef(null);
  const labelRefs = useRef([]);
  const coreLabelRef = useRef(null);
  const gateLabelRef = useRef(null);
  const apiRef = useRef(null);
  const props = useRef({});
  const [fallback, setFallback] = useState(true);
  const [hovered, setHovered] = useState(-1);
  props.current = { activeAgent, approved, isRunning, ambient, onPulseReady };

  useImperativeHandle(ref, () => ({
    pulseLoop: (from, to) => apiRef.current?.pulseLoop(from, to),
  }), []);

  useEffect(() => { apiRef.current?.setApproved(approved); }, [approved]);
  useEffect(() => { apiRef.current?.setActive(activeAgent); }, [activeAgent]);
  useEffect(() => { apiRef.current?.wake(); }, [isRunning]);

  useEffect(() => {
    let disposed = false;
    let frameId;
    let renderer;
    let cleanup = () => {};
    const disposables = [];
    const keep = (x) => { disposables.push(x); return x; };

    async function setup() {
      try {
        const THREE = await import("three");
        if (disposed || !hostRef.current) return;
        const host = hostRef.current;
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(C.bg, 0.045);
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        const camDir = new THREE.Vector3(0, 0.36, 1).normalize();
        let camDist = 11;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.setAttribute("aria-hidden", "true");
        host.prepend(renderer.domElement);
        setFallback(false);

        scene.add(new THREE.AmbientLight(0xffffff, 0.35));
        const key = new THREE.DirectionalLight(0xffffff, 1.6);
        key.position.set(-4, 6, 6);
        scene.add(key);
        const coreLight = new THREE.PointLight(C.gold, 18, 9, 1.8);
        scene.add(coreLight);
        const violetRim = new THREE.PointLight(C.violet, 10, 14, 1.5);
        violetRim.position.set(5, -2, -4);
        scene.add(violetRim);

        const glow = keep(glowTexture(THREE));
        const sprite = (color, opacity, scale) => {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
          s.scale.setScalar(scale);
          return s;
        };
        const disposeSprite = (s) => { s.parent?.remove(s); s.material.dispose(); };

        // Stars: a slow, sparse dust field for depth.
        const starCount = 260;
        const starPos = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
          const r = 9 + Math.random() * 14;
          const t = Math.random() * Math.PI * 2;
          starPos[i * 3] = Math.cos(t) * r;
          starPos[i * 3 + 1] = (Math.random() - 0.5) * 12;
          starPos[i * 3 + 2] = Math.sin(t) * r - 4;
        }
        const starGeo = keep(new THREE.BufferGeometry());
        starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
        const stars = new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ color: C.ink, size: 0.045, transparent: true, opacity: 0.55, depthWrite: false })));
        scene.add(stars);

        // Tilt: the whole system leans slightly; pointer movement eases it further.
        const tilt = new THREE.Group();
        tilt.rotation.z = -0.1;
        scene.add(tilt);

        // Core: the goal the colleague is working towards.
        const core = new THREE.Group();
        tilt.add(core);
        const coreBall = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.5, 3)), keep(new THREE.MeshStandardMaterial({
          color: C.gold, emissive: C.gold, emissiveIntensity: 0.65, roughness: 0.3, metalness: 0.2,
        })));
        core.add(coreBall);
        const coreWire = new THREE.LineSegments(
          keep(new THREE.EdgesGeometry(keep(new THREE.IcosahedronGeometry(0.95, 1)))),
          keep(new THREE.LineBasicMaterial({ color: C.violet, transparent: true, opacity: 0.45 })),
        );
        core.add(coreWire);
        const coreHalo = sprite(C.gold, 0.45, 3.6);
        core.add(coreHalo);

        const circle = (r, segments = 160) => {
          const pts = [];
          for (let i = 0; i <= segments; i++) {
            const t = (i / segments) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(t) * r, 0, Math.sin(t) * r));
          }
          return keep(new THREE.BufferGeometry().setFromPoints(pts));
        };
        const orbitLine = new THREE.Line(circle(ORBIT_R), keep(new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: 0.14 })));
        tilt.add(orbitLine);
        const gateMat = keep(new THREE.LineDashedMaterial({ color: C.ink, transparent: true, opacity: 0.16, dashSize: 0.18, gapSize: 0.14 }));
        const gate = new THREE.Line(circle(GATE_R, 220), gateMat);
        gate.computeLineDistances();
        tilt.add(gate);

        // The orbiting agents, with spokes to the core and the hand-off chain between them.
        const orbit = new THREE.Group();
        tilt.add(orbit);
        const agentGeo = keep(new THREE.IcosahedronGeometry(0.27, 2));
        const agents = AGENTS.map((a, i) => {
          const t = (i / AGENTS.length) * Math.PI * 2;
          const mat = keep(new THREE.MeshStandardMaterial({ color: C.silver, emissive: C.gold, emissiveIntensity: 0, roughness: 0.22, metalness: 0.55 }));
          const mesh = new THREE.Mesh(agentGeo, mat);
          mesh.position.set(Math.cos(t) * ORBIT_R, 0, Math.sin(t) * ORBIT_R);
          const halo = sprite(C.gold, 0, 1.6);
          mesh.add(halo);
          orbit.add(mesh);
          return { mesh, mat, halo, scale: 1, glow: 0, phase: i * 0.9 };
        });
        const spokeGeo = keep(new THREE.BufferGeometry().setFromPoints(agents.flatMap((a) => [new THREE.Vector3(), a.mesh.position.clone()])));
        orbit.add(new THREE.LineSegments(spokeGeo, keep(new THREE.LineBasicMaterial({ color: C.violet, transparent: true, opacity: 0.1 }))));
        const chainGeo = keep(new THREE.BufferGeometry().setFromPoints(agents.map((a) => a.mesh.position.clone())));
        orbit.add(new THREE.Line(chainGeo, keep(new THREE.LineBasicMaterial({ color: C.gold, transparent: true, opacity: 0.16 }))));
        const activeSpokeGeo = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
        const activeSpokeMat = keep(new THREE.LineBasicMaterial({ color: C.violet, transparent: true, opacity: 0 }));
        orbit.add(new THREE.Line(activeSpokeGeo, activeSpokeMat));

        // ---- messages between agents ----
        const packets = [];
        const ripples = [];
        const tmpA = new THREE.Vector3();
        const tmpB = new THREE.Vector3();
        const tmpC = new THREE.Vector3();
        const endpoint = (who, out) => {
          if (who === "core") return core.getWorldPosition(out);
          if (who === "gate") return tilt.localToWorld(out.set(Math.cos(1.15) * GATE_R, 0, Math.sin(1.15) * GATE_R));
          return agents[who].mesh.getWorldPosition(out);
        };
        const send = (from, to, color, { duration = 1.1, lift = 0.9, size = 0.55 } = {}) => {
          if (from === to) return;
          const trail = Array.from({ length: TRAIL }, (_, k) => {
            const s = sprite(color, 0, size * (1 - k / (TRAIL + 2)));
            scene.add(s);
            return s;
          });
          packets.push({ from, to, color, trail, age: 0, duration, lift });
          while (packets.length > 14) killPacket(packets.shift());
          wake();
        };
        const killPacket = (p) => p.trail.forEach(disposeSprite);
        const ripple = (at, color) => {
          const s = sprite(color, 0.9, 0.4);
          s.position.copy(at);
          scene.add(s);
          ripples.push({ s, age: 0 });
        };
        const pointOn = (p, t, out) => {
          endpoint(p.from, tmpA);
          endpoint(p.to, tmpB);
          // Arc up and slightly towards the viewer so messages read clearly over the orbit.
          tmpC.copy(tmpA).lerp(tmpB, 0.5).multiplyScalar(0.7);
          tmpC.y += p.lift;
          const u = 1 - t;
          return out.set(
            u * u * tmpA.x + 2 * u * t * tmpC.x + t * t * tmpB.x,
            u * u * tmpA.y + 2 * u * t * tmpC.y + t * t * tmpB.y,
            u * u * tmpA.z + 2 * u * t * tmpC.z + t * t * tmpB.z,
          );
        };

        // ---- state ----
        const state = {
          active: agentNames.indexOf(props.current.activeAgent),
          hovered: -1,
          approved: props.current.approved ? 1 : 0,
          pointer: new THREE.Vector2(),
          tiltTarget: new THREE.Vector2(),
          chatter: 0.6,
          tourStep: 0,
          spin: 0.14,
          inView: true,
          wakeUntil: 0,
        };

        // ---- labels (HTML, projected each frame; depth-dimmed when behind the core) ----
        const screen = [];
        const v = new THREE.Vector3();
        const project = (world, el, dy = 0) => {
          v.copy(world).project(camera);
          const x = ((v.x + 1) / 2) * host.clientWidth;
          const y = ((1 - v.y) / 2) * host.clientHeight + dy;
          if (el) { el.style.transform = `translate(${x}px, ${y}px) translate(-50%, 0)`; }
          return { x, y };
        };
        const camPosNoSway = new THREE.Vector3();
        const updateLabels = () => {
          const coreZ = core.getWorldPosition(tmpA).distanceTo(camera.position);
          agents.forEach((a, i) => {
            a.mesh.getWorldPosition(tmpB);
            const el = labelRefs.current[i];
            screen[i] = project(tmpB, el, 16);
            if (el) {
              const depth = tmpB.distanceTo(camera.position) - coreZ; // < 0 in front of the core, > 0 behind it
              const fade = Math.min(Math.max((depth + 1.5) / 3, 0), 1);
              el.style.opacity = i === state.hovered || i === state.active ? "1" : (0.9 - fade * 0.55).toFixed(3);
              el.style.zIndex = depth > 0 ? "1" : "3";
            }
          });
          project(core.getWorldPosition(tmpA), coreLabelRef.current, 34);
          project(endpoint("gate", tmpA), gateLabelRef.current, -26);
        };

        // ---- frame ----
        const clock = new THREE.Clock();
        const frame = () => {
          frameId = undefined;
          if (disposed) return;
          const dt = Math.min(clock.getDelta(), 0.05);
          const t = clock.elapsedTime;
          const motion = !reduceMotion;
          const { isRunning: running, ambient: tourMode } = props.current;
          const live = running || tourMode;
          // Frame-rate independent easing: the same glide at 30, 60 or 120 fps.
          const ease = (rate) => 1 - Math.exp(-dt * rate);

          if (motion) {
            // Angular speed eases between states, so the orbit never jerks when you hover or a run starts.
            const targetSpin = state.hovered >= 0 ? 0.03 : live ? 0.2 : 0.14;
            state.spin += (targetSpin - state.spin) * ease(2.2);
            orbit.rotation.y += dt * state.spin;
            gate.rotation.y -= dt * 0.03;
            coreWire.rotation.y += dt * 0.25;
            coreWire.rotation.x += dt * 0.08;
            stars.rotation.y += dt * 0.006;
            state.tiltTarget.lerp(state.pointer, ease(3));
            tilt.rotation.x = state.tiltTarget.y * 0.12;
            tilt.rotation.z = -0.1 - state.tiltTarget.x * 0.08;
          }
          const breathe = motion ? Math.sin(t * 1.6) : 0;
          coreHalo.material.opacity = 0.38 + breathe * 0.08 + state.approved * 0.15;
          coreBall.material.emissiveIntensity = 0.6 + breathe * 0.12;

          agents.forEach((a, i) => {
            const isActive = i === state.active && (running || props.current.approved);
            const isHover = i === state.hovered;
            const target = isHover ? 1.45 : isActive ? 1.35 : 1;
            a.scale += (target - a.scale) * (motion ? ease(9) : 1);
            a.mesh.scale.setScalar(a.scale);
            if (motion) a.mesh.position.y = Math.sin(t * 1.3 + a.phase) * 0.07;
            const g = isActive ? 1 : isHover ? 0.6 : 0;
            a.glow += (g - a.glow) * (motion ? ease(6) : 1);
            a.mat.emissiveIntensity = a.glow * 0.8;
            a.halo.material.opacity = a.glow * (0.55 + breathe * 0.1);
          });

          // Active spoke: the core coordinating the agent that is working.
          if (state.active >= 0 && running) {
            const pos = activeSpokeGeo.attributes.position;
            const p = agents[state.active].mesh.position;
            pos.setXYZ(1, p.x, p.y, p.z);
            pos.needsUpdate = true;
            activeSpokeMat.opacity += (0.55 - activeSpokeMat.opacity) * 0.1;
          } else activeSpokeMat.opacity *= 0.9;

          // Approval gate lights up gold.
          state.approved += ((props.current.approved ? 1 : 0) - state.approved) * (motion ? 0.05 : 1);
          gateMat.color.set(state.approved > 0.5 ? C.gold : C.ink);
          gateMat.opacity = 0.16 + state.approved * 0.6;

          // Ambient chatter while working: the core and the active agent keep reporting to each other.
          if (motion && live) {
            state.chatter -= dt;
            if (state.chatter <= 0) {
              if (running && state.active >= 0) {
                Math.random() < 0.5
                  ? send("core", state.active, C.violet, { duration: 0.9, lift: 0.5, size: 0.4 })
                  : send(state.active, "core", C.violet, { duration: 0.9, lift: 0.5, size: 0.4 });
                state.chatter = 1.1 + Math.random() * 0.9;
              } else if (tourMode) {
                // Goal screen: a calm tour of the pipeline, with an occasional correction loop.
                const i = state.tourStep % (AGENTS.length - 1);
                if (i === 2 && state.tourStep % 12 === 2) send(2, 1, C.pink, { lift: 1.4, size: 0.6 });
                else send(i, i + 1, C.gold);
                if (i % 2 === 0) send("core", i + 1, C.violet, { duration: 0.9, lift: 0.4, size: 0.35 });
                state.tourStep++;
                state.chatter = 1.5;
              }
            }
          }

          for (const p of [...packets]) {
            p.age += motion ? dt : p.duration;
            const head = Math.min(p.age / p.duration, 1);
            p.trail.forEach((s, k) => {
              const tt = head - k * 0.035;
              if (tt < 0) { s.material.opacity = 0; return; }
              pointOn(p, Math.min(tt, 1), s.position);
              s.material.opacity = (1 - k / TRAIL) * (head < 1 ? 0.95 : 0);
            });
            if (head >= 1) {
              ripple(endpoint(p.to, new THREE.Vector3()), p.color);
              killPacket(p);
              packets.splice(packets.indexOf(p), 1);
            }
          }
          for (const r of [...ripples]) {
            r.age += motion ? dt : 1;
            const k = Math.min(r.age / 0.7, 1);
            r.s.scale.setScalar(0.4 + k * 1.8);
            r.s.material.opacity = 0.9 * (1 - k);
            if (k >= 1) { disposeSprite(r.s); ripples.splice(ripples.indexOf(r), 1); }
          }

          renderer.render(scene, camera);
          updateLabels();

          const keepGoing = motion && state.inView && !document.hidden;
          if (keepGoing || (!motion && performance.now() < state.wakeUntil)) frameId = requestAnimationFrame(frame);
        };

        const wake = (ms = 300) => {
          state.wakeUntil = Math.max(state.wakeUntil, performance.now() + ms);
          if (frameId == null && !disposed && !document.hidden) {
            clock.getDelta();
            frameId = requestAnimationFrame(frame);
          }
        };

        apiRef.current = {
          pulseLoop(from, to) {
            const a = agentNames.indexOf(from);
            const b = agentNames.indexOf(to);
            if (a < 0 || b < 0) throw new Error(`Unknown agent loop: ${from} → ${to}`);
            send(a, b === agentNames.length - 1 && props.current.approved ? "gate" : b, to === "Delivery" ? C.gold : C.pink, { lift: 1.5, size: 0.65, duration: 1.2 });
          },
          setActive(name) {
            const next = agentNames.indexOf(name);
            if (next === state.active) return;
            // A hand-off: the finishing agent passes its work to the next one.
            if (state.active >= 0 && next >= 0 && props.current.isRunning) send(state.active, next, C.gold);
            state.active = next;
            wake(600);
          },
          setApproved(value) {
            if (value) send(agentNames.indexOf("Delivery"), "gate", C.gold, { lift: 0.8, size: 0.7 });
            wake(1500);
          },
          wake,
        };

        const resize = () => {
          const w = host.clientWidth;
          const h = Math.max(host.clientHeight, 1);
          renderer.setSize(w, h);
          camera.aspect = w / h;
          const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
          camDist = Math.max(HALF_W / (tanHalf * camera.aspect), HALF_H / tanHalf) * 1.02;
          camPosNoSway.copy(camDir).multiplyScalar(camDist);
          camera.position.copy(camPosNoSway);
          camera.lookAt(0, -0.15, 0);
          camera.updateProjectionMatrix();
          wake();
        };
        const ro = new ResizeObserver(resize);
        ro.observe(host);
        const io = new IntersectionObserver(([entry]) => {
          state.inView = entry.isIntersecting;
          if (state.inView) wake();
        });
        io.observe(host);

        // Hover: nearest agent on screen within reach; slows the orbit and shows its role.
        const onMove = (e) => {
          const rect = host.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          state.pointer.set((x / rect.width - 0.5) * 2, (y / rect.height - 0.5) * 2);
          let best = -1;
          let bestD = 34;
          screen.forEach((s, i) => {
            if (!s) return;
            const d = Math.hypot(s.x - x, s.y - 16 - y);
            if (d < bestD) { bestD = d; best = i; }
          });
          if (best !== state.hovered) {
            state.hovered = best;
            setHovered(best);
            host.style.cursor = best >= 0 ? "pointer" : "";
          }
          wake(400);
        };
        const onLeave = () => {
          state.pointer.set(0, 0);
          state.hovered = -1;
          setHovered(-1);
          host.style.cursor = "";
          wake(800);
        };
        const onVisibility = () => { if (!document.hidden) wake(); };
        host.addEventListener("pointermove", onMove);
        host.addEventListener("pointerleave", onLeave);
        document.addEventListener("visibilitychange", onVisibility);
        cleanup = () => {
          ro.disconnect();
          io.disconnect();
          host.removeEventListener("pointermove", onMove);
          host.removeEventListener("pointerleave", onLeave);
          document.removeEventListener("visibilitychange", onVisibility);
          packets.forEach(killPacket);
          ripples.forEach((r) => disposeSprite(r.s));
          scene.traverse((o) => { if (o.isSprite) o.material.dispose(); });
        };

        resize();
        props.current.onPulseReady?.(apiRef.current.pulseLoop);
        wake(1000);
      } catch (error) {
        if (!disposed) {
          console.warn("The 3D agent scene could not start; showing the SVG fallback.", error);
          setFallback(true);
        }
      }
    }

    setup();
    return () => {
      disposed = true;
      if (frameId != null) cancelAnimationFrame(frameId);
      cleanup();
      apiRef.current = null;
      for (const d of disposables) d.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }, []);

  return (
    <div className="agent-scene" ref={hostRef} role="img" aria-label={label}>
      {fallback && <SvgFallback />}
      <div className="agent-scene-labels" aria-hidden="true">
        {AGENTS.map((a, i) => (
          <span
            key={a.name}
            ref={(el) => { labelRefs.current[i] = el; }}
            className={`agent-label${a.name === activeAgent && isRunning ? " is-active" : ""}${i === hovered ? " is-hover" : ""}`}
          >
            <b>{a.name}</b>
            <small>{a.role}</small>
          </span>
        ))}
        <span className="agent-label core-label" ref={coreLabelRef}><b>Goal</b></span>
        <span className={`agent-label gate-label${approved ? " is-open" : ""}`} ref={gateLabelRef}><b>Teacher approval</b></span>
      </div>
    </div>
  );
}

export default forwardRef(AgentScene);
