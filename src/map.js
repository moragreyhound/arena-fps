import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { parseMapJSON } from './maps/index.js'

// Builds any map definition (built-in or imported JSON) into Three.js + cannon-es.
// Geometry primitives: 'box' | 'cylinder' | 'sphere'. Non-colliding decor is tagged
// with userData.noCollide so bullet raycasts and footsteps ignore it.
export function buildMap(scene, world, groundMaterial, def) {
  const colliderMeshes = []

  function addColliderMesh(mesh, collide) {
    if (collide) {
      colliderMeshes.push(mesh)
      mesh.userData.solid = true
    } else {
      mesh.userData.noCollide = true
    }
    return mesh
  }

  // Ground plane
  const groundW = def.ground.w * 2
  const groundD = def.ground.d * 2
  const groundGeo = new THREE.PlaneGeometry(groundW, groundD)
  const groundMat = new THREE.MeshStandardMaterial({ color: def.ground.color, roughness: 1 })
  const groundMesh = new THREE.Mesh(groundGeo, groundMat)
  groundMesh.rotation.x = -Math.PI / 2
  groundMesh.receiveShadow = true
  scene.add(groundMesh)
  colliderMeshes.push(groundMesh)

  const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMaterial })
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2)
  world.addBody(groundBody)

  if (def.grid) {
    const grid = new THREE.GridHelper(def.ground.w, Math.max(20, Math.round(def.ground.w / 5)), 0x6b5f45, 0x6b5f45)
    grid.position.y = 0.01
    grid.material.opacity = 0.25
    grid.material.transparent = true
    scene.add(grid)
  }

  for (const g of def.geometry) {
    let mesh, body

    if (g.type === 'cylinder') {
      const geo = new THREE.CylinderGeometry(g.r, g.r, g.h, 20)
      const mat = new THREE.MeshStandardMaterial({ color: g.color, roughness: 0.9 })
      mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(g.x, g.y, g.z)
      mesh.castShadow = g.shadow
      mesh.receiveShadow = g.receive
      scene.add(mesh)

      if (g.collide) {
        body = new CANNON.Body({
          mass: 0,
          shape: new CANNON.Cylinder(g.r, g.r, g.h, 12),
          material: groundMaterial,
        })
        body.position.set(g.x, g.y, g.z)
        world.addBody(body)
      }
    } else if (g.type === 'sphere') {
      const geo = new THREE.SphereGeometry(g.r, 20, 14)
      const mat = new THREE.MeshStandardMaterial({ color: g.color, roughness: 0.9 })
      mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(g.x, g.y, g.z)
      mesh.castShadow = g.shadow
      mesh.receiveShadow = g.receive
      scene.add(mesh)

      if (g.collide) {
        body = new CANNON.Body({ mass: 0, shape: new CANNON.Sphere(g.r), material: groundMaterial })
        body.position.set(g.x, g.y, g.z)
        world.addBody(body)
      }
    } else {
      const geo = new THREE.BoxGeometry(g.w, g.h, g.d)
      const mat = new THREE.MeshStandardMaterial({ color: g.color, roughness: 0.9 })
      mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(g.x, g.y, g.z)
      mesh.rotation.y = g.yaw || 0
      mesh.castShadow = g.shadow
      mesh.receiveShadow = g.receive
      scene.add(mesh)

      if (g.collide) {
        body = new CANNON.Body({
          mass: 0,
          shape: new CANNON.Box(new CANNON.Vec3(g.w / 2, g.h / 2, g.d / 2)),
          material: groundMaterial,
        })
        body.position.set(g.x, g.y, g.z)
        body.quaternion.setFromEuler(0, g.yaw || 0, 0)
        world.addBody(body)
      }
    }

    addColliderMesh(mesh, g.collide)
  }

  const spawnPoints = def.spawns.map(s => new THREE.Vector3(s.x, s.y, s.z))

  return { colliderMeshes, spawnPoints, def }
}

export function parseMapText(text) {
  return parseMapJSON(text)
}