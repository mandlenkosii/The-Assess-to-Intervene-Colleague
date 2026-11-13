// The seven agents as a lit 3D pipeline. Every effect maps to something real in the run:
// the butter track fills up to the agent that is working, a glow sits on that agent, a candy spark
// travels back along a correction loop, and the approval ring lights when the teacher approves.
// Renders on demand (only while running or animating), honours reduced motion, and falls back to SVG.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const agentNames = ["Planner", "Marker", "Reviewer", "Diagnostician", "Builder", "Checker", "Delivery"];
const nodePositions = [
  [-4.6, -0.5, 0],
  [-3.1, 0.9, 0],
  [-1.55, 1.65, 0],
  [0, 1.85, 0],
  [1.55, 1.65, 0],
  [3.1, 0.9, 0],
  [4.6, -0.5, 0]
];
const ringPosition = [5.35, -0.1, 0];
// Label positions (percent) used before WebGL starts and by the SVG fallback.
const fallbackLabels = { left: [8, 22, 36, 51, 66, 80, 94], top: [72, 39, 20, 14, 23, 43, 73] };
const COLORS = { night: "#26102E", butter: "#F9E27D", bone: "#FFF6CC", candy: "#FF8FC7", candyDeep: "#C2186B" };
const PULSE_MS = 1100;
const SCENE_HALF_WIDTH = 6.4; // world units that must stay visible left/right of centre
const SCENE_HALF_HEIGHT = 2.1; // and above/below the look-at point, including labels

function SvgFallback() {
  const coordinates = [
    [8, 62], [22, 30], [36, 15], [51, 11], [66, 17], [80, 34], [94, 63]
  ];
  return (
    <svg viewBox="0 0 1000 220" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path className="agent-track" d="M80 137 C220 68, 340 30, 500 24 S780 75, 940 139" />
      {coordinates.map(([x, y], index) => (
        <g key={agentNames[index]} transform={`translate(${x * 10} ${y * 1.65 + 12})`}>
          <circle className="agent-node" r="22" />
          <text className="agent-number" textAnchor="middle" dominantBaseline="central">{index + 1}</text>
        </g>
      ))}
    </svg>
  );
}

// A soft round glow drawn once into a canvas, used for the active-agent halo and sparks.
function glowTexture(THREE) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function AgentScene({ activeAgent, approved = false, isRunning = false, onPulseReady, label = "Seven assessment agents connected in sequence" }, ref) {
  const hostRef = useRef(null);
  const labelRefs = useRef([]);
  const ringLabelRef = useRef(null);
  const apiRef = useRef(null);
  const activeAgentRef = useRef(activeAgent);
  const approvedRef = useRef(approved);
  const isRunningRef = useRef(isRunning);
  const onPulseReadyRef = useRef(onPulseReady);
  const [fallback, setFallback] = useState(true);

  activeAgentRef.current = activeAgent;
  approvedRef.current = approved;
  isRunningRef.current = isRunning;
  onPulseReadyRef.current = onPulseReady;

  useImperativeHandle(ref, () => ({
    pulseLoop: (from, to) => apiRef.current?.pulseLoop(from, to)
  }), []);

  useEffect(() => {
    apiRef.current?.setApproved(approved);
  }, [approved]);

  useEffect(() => {
    apiRef.current?.wake(900);
  }, [activeAgent, isRunning]);

  useEffect(() => {
    let disposed = false;
    let frameId;
    let observer;
    let renderer;
    let scene;
    let camera;
    let removeListeners = () => {};
    const disposables = [];
    const keep = (thing) => { disposables.push(thing); return thing; };

    async function setup() {
      try {
        const THREE = await import("three");
        if (disposed || !hostRef.current) return;
        const host = hostRef.current;
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(COLORS.night);
        scene.fog = new THREE.Fog(COLORS.night, 12, 24);
        camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
        const lookAt = new THREE.Vector3(0, 0.55, 0);
        const cameraBase = new THREE.Vector3(0, 0.45, 13.5);
        camera.position.copy(cameraBase);
        camera.lookAt(lookAt);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(host.clientWidth, host.clientHeight);
        renderer.domElement.setAttribute("aria-hidden", "true");
        host.appendChild(renderer.domElement);
        setFallback(false);

        scene.add(new THREE.HemisphereLight(COLORS.bone, COLORS.night, 1.1));
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
        keyLight.position.set(-3, 5, 8);
        scene.add(keyLight);
        const rimLight = new THREE.DirectionalLight(COLORS.candy, 0.9);
        rimLight.position.set(4, -2, -6);
        scene.add(rimLight);
        const activeLight = new THREE.PointLight(COLORS.butter, 0, 4.5, 1.6);
        scene.add(activeLight);

        // Depth: a faint, sparse field of points behind the pipeline.
        const starCount = 140;
        const starPositions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
          starPositions[i * 3] = (Math.random() - 0.5) * 30;
          starPositions[i * 3 + 1] = (Math.random() - 0.5) * 12;
          starPositions[i * 3 + 2] = -3 - Math.random() * 9;
        }
        const starGeometry = keep(new THREE.BufferGeometry());
        starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
        const stars = new THREE.Points(starGeometry, keep(new THREE.PointsMaterial({
          color: COLORS.bone, size: 0.05, transparent: true, opacity: 0.45, depthWrite: false
        })));
        scene.add(stars);

        // The pipeline track, and a brighter copy that fills up to the working agent.
        const trackCurve = new THREE.CatmullRomCurve3(nodePositions.map((p) => new THREE.Vector3(...p)));
        const TRACK_SEGMENTS = 160;
        const TRACK_RADIAL = 6;
        const trackBase = new THREE.Mesh(
          keep(new THREE.TubeGeometry(trackCurve, TRACK_SEGMENTS, 0.022, TRACK_RADIAL, false)),
          keep(new THREE.MeshBasicMaterial({ color: COLORS.bone, transparent: true, opacity: 0.18 }))
        );
        scene.add(trackBase);
        const progressGeometry = keep(new THREE.TubeGeometry(trackCurve, TRACK_SEGMENTS, 0.04, TRACK_RADIAL, false));
        const progressTube = new THREE.Mesh(progressGeometry, keep(new THREE.MeshBasicMaterial({ color: COLORS.butter })));
        progressGeometry.setDrawRange(0, 0);
        scene.add(progressTube);
        // Where each node sits along the track (0..1), found by sampling the curve once.
        const samples = trackCurve.getSpacedPoints(400);
        const nodeFractions = nodePositions.map((p) => {
          const target = new THREE.Vector3(...p);
          let best = 0;
          samples.forEach((s, i) => { if (s.distanceToSquared(target) < samples[best].distanceToSquared(target)) best = i; });
          return best / 400;
        });

        const glow = keep(glowTexture(THREE));
        const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({
          map: glow, color: COLORS.butter, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        halo.scale.setScalar(2.4);
        scene.add(halo);

        const nodeGeometry = keep(new THREE.IcosahedronGeometry(0.38, 0));
        const meshes = nodePositions.map((position, index) => {
          const mesh = new THREE.Mesh(nodeGeometry, keep(new THREE.MeshStandardMaterial({
            color: COLORS.butter, emissive: COLORS.butter, emissiveIntensity: 0, flatShading: true, roughness: 0.42, metalness: 0.12
          })));
          mesh.position.set(...position);
          mesh.rotation.set(index * 0.6, index * 0.9, 0);
          mesh.userData = { baseY: position[1], agentName: agentNames[index], scale: 1 };
          scene.add(mesh);
          return mesh;
        });

        const ringMaterial = keep(new THREE.MeshStandardMaterial({ color: COLORS.bone, emissive: COLORS.butter, emissiveIntensity: 0, roughness: 0.35, metalness: 0.3 }));
        const approvalRing = new THREE.Mesh(keep(new THREE.TorusGeometry(0.48, 0.035, 10, 64)), ringMaterial);
        approvalRing.position.set(...ringPosition);
        scene.add(approvalRing);

        // State eased each frame so changes glide instead of jumping.
        const state = { progress: 0, ringGlow: approvedRef.current ? 1 : 0, wakeUntil: 0, pointer: { x: 0, y: 0 }, pulses: [] };

        const removePulse = (pulse) => {
          scene.remove(pulse.tube, pulse.spark);
          pulse.tube.geometry.dispose();
          pulse.tube.material.dispose();
          pulse.spark.material.dispose();
        };

        const projectLabels = () => {
          const w = host.clientWidth;
          const h = host.clientHeight;
          const v = new THREE.Vector3();
          const place = (el, x, y, z) => {
            if (!el) return;
            v.set(x, y, z).project(camera);
            el.style.left = `${((v.x + 1) / 2) * w}px`;
            el.style.top = `${((1 - v.y) / 2) * h}px`;
          };
          meshes.forEach((mesh, i) => place(labelRefs.current[i], mesh.position.x, mesh.position.y - 0.66, mesh.position.z));
          // Above the ring, so it never sits on the Delivery label below.
          // Right-aligned to the ring's outer edge (CSS translate -100%) so it never runs off the panel.
          place(ringLabelRef.current, ringPosition[0] + 0.5, ringPosition[1] + 0.85, ringPosition[2]);
        };

        const renderFrame = (time) => {
          frameId = undefined;
          if (disposed || document.hidden) return;
          const running = isRunningRef.current;
          const motion = !reduceMotion;
          const activeIndex = agentNames.indexOf(activeAgentRef.current);

          // Track fill: up to the working agent; full once delivered or approved.
          const targetProgress = approvedRef.current ? 1 : activeIndex >= 0 ? nodeFractions[activeIndex] : 0;
          state.progress += (targetProgress - state.progress) * (motion ? 0.08 : 1);
          if (Math.abs(targetProgress - state.progress) < 0.001) state.progress = targetProgress;
          progressGeometry.setDrawRange(0, Math.round(state.progress * TRACK_SEGMENTS) * TRACK_RADIAL * 6);

          meshes.forEach((mesh, index) => {
            const isActive = index === activeIndex;
            mesh.position.y = mesh.userData.baseY + (running && motion ? Math.sin(time * 0.0012 + index) * 0.06 : 0);
            if (motion) {
              mesh.rotation.y += isActive ? 0.02 : 0.004;
              mesh.rotation.x += 0.002;
            }
            const targetScale = isActive ? 1.28 : 1;
            mesh.userData.scale += (targetScale - mesh.userData.scale) * (motion ? 0.15 : 1);
            mesh.scale.setScalar(mesh.userData.scale);
            const done = approvedRef.current || (activeIndex >= 0 && index < activeIndex);
            mesh.material.emissiveIntensity = isActive ? 0.55 : done ? 0.12 : 0;
          });

          if (activeIndex >= 0 && running) {
            const target = meshes[activeIndex].position;
            activeLight.position.set(target.x, target.y + 0.2, target.z + 1.2);
            activeLight.intensity = 6 + (motion ? Math.sin(time * 0.004) * 1.5 : 0);
            halo.position.copy(target);
            halo.material.opacity = 0.55 + (motion ? Math.sin(time * 0.004) * 0.15 : 0);
          } else {
            activeLight.intensity *= 0.85;
            halo.material.opacity *= 0.85;
          }

          state.ringGlow += ((approvedRef.current ? 1 : 0) - state.ringGlow) * (motion ? 0.08 : 1);
          ringMaterial.emissiveIntensity = state.ringGlow * 0.9;
          ringMaterial.color.set(state.ringGlow > 0.5 ? COLORS.butter : COLORS.bone);
          if (motion) approvalRing.rotation.y += 0.01 + state.ringGlow * 0.02;

          for (const pulse of [...state.pulses]) {
            const t = Math.min((time - pulse.start) / PULSE_MS, 1);
            pulse.spark.position.copy(pulse.curve.getPointAt(motion ? t : 1));
            pulse.spark.material.opacity = 1 - t * 0.6;
            pulse.tube.material.opacity = 0.9 * (1 - t);
            if (t >= 1) {
              removePulse(pulse);
              state.pulses.splice(state.pulses.indexOf(pulse), 1);
            }
          }

          if (motion) {
            stars.rotation.y = Math.sin(time * 0.00004) * 0.08;
            // Parallax scales with distance so it feels the same on wide and narrow panels.
            const sway = cameraBase.z / 13.5;
            camera.position.x += (cameraBase.x + state.pointer.x * 0.5 * sway - camera.position.x) * 0.06;
            camera.position.y += (cameraBase.y - state.pointer.y * 0.25 * sway - camera.position.y) * 0.06;
          }
          camera.position.z = cameraBase.z;
          camera.lookAt(lookAt);
          renderer.render(scene, camera);
          projectLabels();

          const settling = Math.abs(targetProgress - state.progress) > 0 || state.pulses.length > 0;
          if ((running && motion) || settling || time < state.wakeUntil) {
            frameId = requestAnimationFrame(renderFrame);
          }
        };

        apiRef.current = {
          pulseLoop(from, to) {
            const start = agentNames.indexOf(from);
            const end = agentNames.indexOf(to);
            if (start < 0 || end < 0) {
              throw new Error(`Unknown agent loop: ${from} → ${to}`);
            }
            // Corrections arc above the pipeline from the agent that caught the problem back to the one that fixes it.
            const startPoint = new THREE.Vector3(...nodePositions[start]);
            const endPoint = new THREE.Vector3(...(end === agentNames.length - 1 ? ringPosition : nodePositions[end]));
            const control = startPoint.clone().lerp(endPoint, 0.5);
            control.y += 1.2;
            control.z += 0.6;
            const curve = new THREE.QuadraticBezierCurve3(startPoint, control, endPoint);
            const color = to === "Delivery" ? COLORS.butter : COLORS.candy;
            const tube = new THREE.Mesh(
              new THREE.TubeGeometry(curve, 32, 0.03, 6, false),
              new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })
            );
            const spark = new THREE.Sprite(new THREE.SpriteMaterial({
              map: glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
            }));
            spark.scale.setScalar(0.9);
            spark.position.copy(startPoint);
            scene.add(tube, spark);
            // Several corrections can land in one batch; keep the newest few.
            state.pulses.push({ curve, tube, spark, start: performance.now() });
            while (state.pulses.length > 4) removePulse(state.pulses.shift());
            this.wake(PULSE_MS);
          },
          setApproved(value) {
            if (value) this.pulseLoop("Checker", "Delivery");
            else this.wake(600);
          },
          wake(ms = 0) {
            state.wakeUntil = Math.max(state.wakeUntil, performance.now() + ms);
            if (frameId == null && !disposed && !document.hidden) {
              frameId = requestAnimationFrame(renderFrame);
            }
          },
          render() { this.wake(0); }
        };

        const resize = () => {
          if (!renderer) return;
          const { clientWidth, clientHeight } = host;
          renderer.setSize(clientWidth, clientHeight);
          camera.aspect = clientWidth / Math.max(clientHeight, 1);
          // Frame the pipeline: close enough to fill the panel, far enough that all seven agents,
          // the ring and their labels fit at any width (narrow phones pull the camera back).
          const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
          const fitWidth = SCENE_HALF_WIDTH / (tanHalf * camera.aspect);
          const fitHeight = SCENE_HALF_HEIGHT / tanHalf;
          cameraBase.z = Math.max(fitWidth, fitHeight);
          camera.position.z = cameraBase.z;
          scene.fog.near = cameraBase.z;
          scene.fog.far = cameraBase.z + 16;
          camera.updateProjectionMatrix();
          apiRef.current?.wake(0);
        };
        observer = new ResizeObserver(resize);
        observer.observe(host);

        const onPointerMove = (event) => {
          if (reduceMotion) return;
          const rect = host.getBoundingClientRect();
          state.pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
          state.pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
          apiRef.current?.wake(1200);
        };
        const onPointerLeave = () => { state.pointer.x = 0; state.pointer.y = 0; apiRef.current?.wake(1200); };
        const onVisibilityChange = () => {
          if (document.hidden) {
            if (frameId != null) cancelAnimationFrame(frameId);
            frameId = undefined;
          } else apiRef.current?.wake(300);
        };
        host.addEventListener("pointermove", onPointerMove);
        host.addEventListener("pointerleave", onPointerLeave);
        document.addEventListener("visibilitychange", onVisibilityChange);
        removeListeners = () => {
          host.removeEventListener("pointermove", onPointerMove);
          host.removeEventListener("pointerleave", onPointerLeave);
          document.removeEventListener("visibilitychange", onVisibilityChange);
          for (const pulse of state.pulses) removePulse(pulse);
          state.pulses.length = 0;
        };

        resize();
        onPulseReadyRef.current?.(apiRef.current.pulseLoop.bind(apiRef.current));
        apiRef.current.wake(900);
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
      observer?.disconnect();
      removeListeners();
      apiRef.current = null;
      for (const thing of disposables) thing.dispose();
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
        {agentNames.map((name, index) => (
          <span
            key={name}
            ref={(el) => { labelRefs.current[index] = el; }}
            className={name === activeAgent ? "is-active" : ""}
            style={{ left: `${fallbackLabels.left[index]}%`, top: `${fallbackLabels.top[index]}%` }}
          >{name}</span>
        ))}
        <span className="approval-label" ref={ringLabelRef}>Teacher approval</span>
      </div>
    </div>
  );
}

export default forwardRef(AgentScene);
