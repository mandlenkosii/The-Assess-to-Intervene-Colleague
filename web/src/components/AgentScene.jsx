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

function AgentScene({ activeAgent, approved = false, onPulseReady }, ref) {
  const hostRef = useRef(null);
  const apiRef = useRef(null);
  const activeAgentRef = useRef(activeAgent);
  const approvedRef = useRef(approved);
  const onPulseReadyRef = useRef(onPulseReady);
  const [fallback, setFallback] = useState(true);

  activeAgentRef.current = activeAgent;
  approvedRef.current = approved;
  onPulseReadyRef.current = onPulseReady;

  useImperativeHandle(ref, () => ({
    pulseLoop: (from, to) => apiRef.current?.pulseLoop(from, to)
  }), []);

  useEffect(() => {
    apiRef.current?.setApproved(approved);
  }, [approved]);

  useEffect(() => {
    let disposed = false;
    let frameId;
    let observer;
    let renderer;
    let scene;
    let camera;
    let pulseTimer;
    let pulseMesh;
    const meshes = [];

    async function setup() {
      try {
        const THREE = await import("three");
        if (disposed || !hostRef.current) return;

        scene = new THREE.Scene();
        scene.background = new THREE.Color("#26102E");
        camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
        camera.position.set(0, 0.45, 13.5);
        camera.lookAt(0, 0.5, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(hostRef.current.clientWidth, hostRef.current.clientHeight);
        hostRef.current.appendChild(renderer.domElement);
        setFallback(false);

        scene.add(new THREE.AmbientLight(0xffffff, 1.45));
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        keyLight.position.set(-3, 5, 8);
        scene.add(keyLight);

        nodePositions.forEach((position, index) => {
          const mesh = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.38, 0),
            new THREE.MeshStandardMaterial({
              color: "#F9E27D",
              emissive: "#000000",
              flatShading: true,
              roughness: 0.5
            })
          );
          mesh.position.set(...position);
          mesh.userData.baseY = position[1];
          mesh.userData.agentName = agentNames[index];
          scene.add(mesh);
          meshes.push(mesh);
        });

        const approvalRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.48, 0.035, 8, 48),
          new THREE.MeshStandardMaterial({
            color: approvedRef.current ? "#F9E27D" : "#FFF6CC",
            emissive: approvedRef.current ? "#F9E27D" : "#000000"
          })
        );
        approvalRing.position.set(5.35, -0.1, 0);
        scene.add(approvalRing);

        apiRef.current = {
          pulseLoop(from, to) {
            const start = agentNames.indexOf(from);
            const end = agentNames.indexOf(to);
            if (start < 0 || end < 0) {
              throw new Error(`Unknown agent loop: ${from} → ${to}`);
            }
            if (pulseMesh) {
              scene.remove(pulseMesh);
              pulseMesh.geometry.dispose();
              pulseMesh.material.dispose();
            }
            if (pulseTimer) window.clearTimeout(pulseTimer);
            const startPoint = new THREE.Vector3(...nodePositions[start]);
            const endPoint = new THREE.Vector3(...nodePositions[end]);
            const control = startPoint.clone().lerp(endPoint, 0.5);
            control.y += 1.1;
            const curve = new THREE.QuadraticBezierCurve3(startPoint, control, endPoint);
            pulseMesh = new THREE.Mesh(
              new THREE.TubeGeometry(curve, 32, 0.035, 6, false),
              new THREE.MeshStandardMaterial({ color: "#FF8FC7", emissive: "#C2186B" })
            );
            scene.add(pulseMesh);
            pulseTimer = window.setTimeout(() => {
              if (!pulseMesh) return;
              scene.remove(pulseMesh);
              pulseMesh.geometry.dispose();
              pulseMesh.material.dispose();
              pulseMesh = undefined;
            }, 900);
          },
          setApproved(value) {
            approvalRing.material.color.set(value ? "#F9E27D" : "#FFF6CC");
            approvalRing.material.emissive.set(value ? "#F9E27D" : "#000000");
            if (value) this.pulseLoop("Checker", "Delivery");
          }
        };
        onPulseReadyRef.current?.(apiRef.current.pulseLoop);

        const resize = () => {
          if (!hostRef.current || !renderer) return;
          const { clientWidth, clientHeight } = hostRef.current;
          renderer.setSize(clientWidth, clientHeight);
          camera.aspect = clientWidth / Math.max(clientHeight, 1);
          camera.updateProjectionMatrix();
        };
        observer = new ResizeObserver(resize);
        observer.observe(hostRef.current);
        resize();

        const render = (time) => {
          if (disposed || document.hidden) return;
          meshes.forEach((mesh, index) => {
            mesh.position.y = mesh.userData.baseY + Math.sin(time * 0.0007 + index) * 0.045;
            const isActive = mesh.userData.agentName === activeAgentRef.current;
            mesh.scale.setScalar(isActive ? 1.25 : 1);
            mesh.material.emissive.set(isActive ? "#F9E27D" : "#000000");
            mesh.material.emissiveIntensity = isActive ? 0.5 : 0;
          });
          renderer.render(scene, camera);
          frameId = requestAnimationFrame(render);
        };
        const start = () => {
          if (frameId == null && !disposed) frameId = requestAnimationFrame(render);
        };
        const stop = () => {
          if (frameId != null) cancelAnimationFrame(frameId);
          frameId = undefined;
        };
        const onVisibilityChange = () => document.hidden ? stop() : start();
        document.addEventListener("visibilitychange", onVisibilityChange);
        apiRef.current.disposeVisibility = () => document.removeEventListener("visibilitychange", onVisibilityChange);
        start();
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
      if (pulseTimer) window.clearTimeout(pulseTimer);
      observer?.disconnect();
      apiRef.current?.disposeVisibility?.();
      apiRef.current = null;
      if (pulseMesh) {
        scene?.remove(pulseMesh);
        pulseMesh.geometry.dispose();
        pulseMesh.material.dispose();
      }
      for (const mesh of meshes) {
        scene?.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      if (scene) {
        scene.traverse((object) => {
          if (object.geometry && !meshes.some((mesh) => mesh.geometry === object.geometry)) {
            object.geometry.dispose();
          }
          if (object.material && !meshes.some((mesh) => mesh.material === object.material)) {
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
              material.dispose();
            }
          }
        });
      }
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }, []);

  return (
    <div className="agent-scene" ref={hostRef} role="img" aria-label="Seven assessment agents connected in sequence">
      {fallback && <SvgFallback />}
      <div className="agent-scene-labels" aria-hidden="true">
        {agentNames.map((name, index) => (
          <span key={name} className={name === activeAgent ? "is-active" : ""} style={{
            left: `${[8, 22, 36, 51, 66, 80, 94][index]}%`,
            top: `${[72, 39, 20, 14, 23, 43, 73][index]}%`
          }}>{name}</span>
        ))}
        <span className="approval-label">Teacher approval</span>
      </div>
    </div>
  );
}

export default forwardRef(AgentScene);
