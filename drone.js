// Local FPV quad. Not networked. Angle mode: the sticks set a tilt, and the drone levels itself when you let go.
import * as THREE from 'three';

export function createDrone(){
  const group = new THREE.Group();
  group.visible = false;
  group.name = 'fpvDrone';
  const bodyMat = new THREE.MeshStandardMaterial({color:0x2a2e33, roughness:0.45, metalness:0.35});
  const armMat = new THREE.MeshStandardMaterial({color:0x1a1c1f, roughness:0.55, metalness:0.2});
  const propMat = new THREE.MeshStandardMaterial({color:0xc5ccd4, roughness:0.35, metalness:0.15});
  const camMat = new THREE.MeshStandardMaterial({color:0x111111, roughness:0.4, metalness:0.4});
  group.rotation.order = 'YXZ';
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10).scale(1.35, 0.55, 1.05), bodyMat);
  body.castShadow = true; group.add(body);
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.05), camMat);
  cam.position.set(0, -0.02, -0.1); group.add(cam);
  const props = [];
  for (let i = 0; i < 4; i++){
    const a = Math.PI/4 + i * Math.PI/2;
    const ax = Math.cos(a) * 0.18, az = Math.sin(a) * 0.18;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), armMat);
    arm.position.set(ax * 0.5, 0.01, az * 0.5);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ax, 0, az).normalize());
    group.add(arm);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.022, 8), armMat);
    motor.position.set(ax, 0.03, az); group.add(motor);
    const hub = new THREE.Group();
    hub.position.set(ax, 0.048, az);
    const blade = new THREE.BoxGeometry(0.2, 0.006, 0.022);
    const b1 = new THREE.Mesh(blade, propMat), b2 = new THREE.Mesh(blade, propMat);
    b2.rotation.y = Math.PI / 2; hub.add(b1, b2); group.add(hub);
    props.push(hub);
  }
  const state = { on:false, manual:false, x:0, y:2, z:0, yaw:0, pitch:0, roll:0, vx:0, vy:0, vz:0, spin:0 };
  return { group, props, state };
}

// opts: { speed, tilt, dist, height, manual }
// world: { groundH, nearTrees, half }
// rider: { x, y, z, yaw }
// stick: { thr, yaw, pitch, roll } each about -1..1. Angle mode.
export function stepDrone(D, dt, opts, world, rider, stick){
  dt = Math.max(0, Math.min(0.05, dt));
  const speed = opts.speed;
  if (opts.manual){
    const targetPitch = THREE.MathUtils.clamp((stick.pitch || 0) * 0.5, -0.5, 0.5);
    const targetRoll = THREE.MathUtils.clamp((stick.roll || 0) * 0.5, -0.5, 0.5);
    const k = 1 - Math.exp(-dt / 0.16);
    D.pitch += (targetPitch - D.pitch) * k;
    D.roll += (targetRoll - D.roll) * k;
    D.yaw += (stick.yaw || 0) * 1.7 * dt;
    const fwd = speed * THREE.MathUtils.clamp(-D.pitch / 0.5, -1, 1);
    const side = speed * THREE.MathUtils.clamp(D.roll / 0.5, -1, 1);
    const fx = -Math.sin(D.yaw), fz = -Math.cos(D.yaw);
    const rx = Math.cos(D.yaw), rz = -Math.sin(D.yaw);
    D.vx = fx * fwd + rx * side;
    D.vz = fz * fwd + rz * side;
    D.vy = THREE.MathUtils.clamp(stick.thr || 0, -1, 1) * speed * 0.55;
  } else {
    const orbit = Math.sin((D.spin || 0) * 0.35) * 0.55;
    const fx = -Math.sin(rider.yaw), fz = -Math.cos(rider.yaw);
    const rx = Math.cos(rider.yaw), rz = -Math.sin(rider.yaw);
    let tx = rider.x - fx * opts.dist + rx * opts.dist * orbit;
    let tz = rider.z - fz * opts.dist + rz * opts.dist * orbit;
    let ty = rider.y + opts.height;
    const floor = world.groundH(tx, tz) + 2.4;
    if (ty < floor) ty = floor;
    for (const t of world.nearTrees(tx, tz)){
      const dx = tx - t.x, dz = tz - t.z, dist = Math.hypot(dx, dz) || 1;
      if (dist < 4){ tx += dx / dist * (4 - dist); tz += dz / dist * (4 - dist); }
    }
    const k = 1 - Math.exp(-dt * 2.4);
    D.vx = (tx - D.x) * k / Math.max(dt, 1e-4) * dt;
    D.vz = (tz - D.z) * k / Math.max(dt, 1e-4) * dt;
    D.vy = (ty - D.y) * k / Math.max(dt, 1e-4) * dt;
    D.x += (tx - D.x) * k; D.y += (ty - D.y) * k; D.z += (tz - D.z) * k;
    const look = Math.atan2(-(rider.x - D.x), -(rider.z - D.z));
    D.yaw += Math.atan2(Math.sin(look - D.yaw), Math.cos(look - D.yaw)) * (1 - Math.exp(-dt * 3));
    D.pitch += (0 - D.pitch) * k; D.roll += (0 - D.roll) * k;
  }
  if (opts.manual){ D.x += D.vx * dt; D.y += D.vy * dt; D.z += D.vz * dt; }
  // Soft bounds. No crash: stop at the wall, the ground and the ceiling.
  const lim = world.half - 80;
  if (D.x > lim){ D.x = lim; D.vx = Math.min(0, D.vx); }
  if (D.x < -lim){ D.x = -lim; D.vx = Math.max(0, D.vx); }
  if (D.z > lim){ D.z = lim; D.vz = Math.min(0, D.vz); }
  if (D.z < -lim){ D.z = -lim; D.vz = Math.max(0, D.vz); }
  const floor = world.groundH(D.x, D.z) + 0.55;
  if (D.y < floor){ D.y = floor; D.vy = Math.max(0, D.vy); D.pitch *= 0.4; }
  const ceil = floor + 80;
  if (D.y > ceil){ D.y = ceil; D.vy = Math.min(0, D.vy); }
  for (const t of world.nearTrees(D.x, D.z)){
    const dx = D.x - t.x, dz = D.z - t.z, dist = Math.hypot(dx, dz) || 1;
    if (dist < 1.5){
      D.x += dx / dist * (1.5 - dist); D.z += dz / dist * (1.5 - dist);
      const inward = D.vx * dx + D.vz * dz;
      if (inward < 0){ D.vx -= dx / dist * inward; D.vz -= dz / dist * inward; }
    }
  }
  D.spin = (D.spin || 0) + dt * (8 + Math.min(20, Math.hypot(D.vx, D.vz)));
  return D;
}
