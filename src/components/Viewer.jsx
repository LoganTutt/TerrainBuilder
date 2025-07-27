// == /src/components/Viewer.jsx ==
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three-stdlib';

class TerrainObject {
  constructor(mesh, metadata, scene) {
    this.mesh = mesh;
    this.metadata = metadata;
    this.scene = scene;
    this.connectionMarkers = [];
    this.boxHelper = null;
    this.posOff = null;
    this.addToScene();
  }

  addToScene() {
    this.scene.add(this.mesh);
    this.addConnectionMarkers();
  }

  getPosRTModel(pos) {
    return pos.clone().sub(this.mesh.position.clone());
  }

  setPosition(pos) {
    this.mesh.position.set(...pos)
  }

  setYawRotation(yawRadians) {
    // TODO
    // this.mesh.rotation.z = yawRadians;
  }

  applyTransform(transform) {
    if (transform) {
      this.mesh.geometry.rotateX(transform.rotation[0])
      this.mesh.geometry.rotateY(transform.rotation[1])
      this.mesh.geometry.rotateZ(transform.rotation[2])
      this.mesh.geometry.translate(...(transform.position || [0, 0, 0]));
      this.mesh.geometry.scale(...(transform.scale || [1, 1, 1]))
    }
  }

  addConnectionMarkers() {
    this.metadata.connectors.forEach(conn => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 })
      );
      marker.userData.isConnection = true;
      this.mesh.add(marker);
      marker.position.set(...conn.position)
      this.connectionMarkers.push({ marker, offset: conn.position, normal: conn.normal });
    });
  }


  update() {
    if (this.boxHelper) this.boxHelper.update();
  }

  addBoundingBox() {
    if (this.boxHelper) this.scene.remove(this.boxHelper);
    this.boxHelper = new THREE.BoxHelper(this.mesh, 0xffff00);
    this.scene.add(this.boxHelper);
  }

  removeBoundingBox() {
    if (this.boxHelper) this.scene.remove(this.boxHelper);
    this.boxHelper = null;
  }

  removeFromScene() {
    this.scene.remove(this.mesh);
    this.removeBoundingBox();
    this.connectionMarkers.forEach(({ marker }) => this.scene.remove(marker));
  }

  getWorldConnectors() {
    return this.metadata.connectors.map(conn => ({
      position: new THREE.Vector3(...conn.position).applyMatrix4(this.mesh.matrixWorld),
      normal: new THREE.Vector3(...conn.normal).normalize()
    }));
  }
}
/**
 * @param {TerrainObject} targetObject - The object to place
 * @param {THREE.Vector3} desiredPosition - Where the object would be dropped
 * @param {TerrainObject[]} allObjects - List of existing scene objects
 * @param {number} snapThreshold - Max distance for snapping to a node
 * @param {number} gridSize - Grid size to fallback to if no snap
 */
 function findSnapPositionAndRotation(targetObject, desiredPosition, allObjects, snapThreshold = 5, gridSize = 4) {
  let targetShift = desiredPosition.clone().sub(targetObject.mesh.position)

  const targetConnectors = targetObject.getWorldConnectors().map(
    c => ({position: c.position.clone().add(targetShift), normal:c.normal})
  );
  const sceneConnectors = allObjects
    .filter(o => o !== targetObject)
    .flatMap(o => o.getWorldConnectors());

  let bestMatch = null;
  let minDistance = Infinity;

  for (const source of targetConnectors) {
    for (const target of sceneConnectors) {
      const dist = source.position.distanceTo(target.position);

      if (dist < snapThreshold && dist < minDistance && -source.normal.dot(target.normal) > .95) {
        minDistance = dist;
        bestMatch = { source, target };
      }
    }
  }

  if (bestMatch) {
    const offset = bestMatch.target.position.clone().sub(bestMatch.source.position)
    const newPosition = targetObject.mesh.position.clone().add(offset).add(targetShift);
    return newPosition;
  }

  const basePos = desiredPosition;
  const snappedX = Math.round(basePos.x / gridSize) * gridSize;
  const snappedZ = Math.round(basePos.z / gridSize) * gridSize;
  return new THREE.Vector3(snappedX, basePos.y, snappedZ);
}

export default function Viewer() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const objectsRef = useRef([]);
  const selectedObjectRef = useRef(null);
  const draggingRef = useRef(false);

  const ghostRef = useRef(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(50, 50, 50);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    scene.add(new THREE.AmbientLight(0x404040));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 7.5);
    scene.add(light);

    // One Square is 20 units
    const gridHelper = new THREE.GridHelper( 500, 20 );
    scene.add(gridHelper)

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const loadMetadata = async (modelName) => {
      const base = modelName.replace(/\.stl$/, '');
      const res = await fetch(`metadata/${base}.json`);
      return res.json();
    };

    const handleDrop = async (e) => {
      console.log(ghostRef)
      e.preventDefault();

      if (!ghostRef.current) return;
      const obj = ghostRef.current
      obj.mesh.material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
      ghostRef.current = null
      objectsRef.current.push(obj);

    };

    const onMouseDown = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      const hit = intersects.find(i => i.object.type === 'Mesh' && i.object.geometry.type === 'BufferGeometry');

      if (hit) {
        event.preventDefault()
        const obj = objectsRef.current.find(o => o.mesh === hit.object);
        if (obj) {
          if (obj != selectedObjectRef.current && selectedObjectRef.current) {
            selectedObjectRef.current.removeBoundingBox();
            selectedObjectRef.current = null;
          }
          selectedObjectRef.current = obj;
          obj.addBoundingBox();
          draggingRef.current = true;
        }
      } else {
        if (selectedObjectRef.current) {
          selectedObjectRef.current.removeBoundingBox();
          selectedObjectRef.current = null;
        }
      }
    };


    const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), new THREE.MeshBasicMaterial())
    groundPlane.geometry.rotateX(-1.57)
    // scene.add(groundPlane)

    const axesHelper = new THREE.AxesHelper( 5 );
    scene.add( axesHelper )
    

    // TODO: Use DragControls?
    const onDrag = (event) => {
      
      let draggedObj = null
      if (ghostRef.current) {
        draggedObj = ghostRef.current
      } else if (draggingRef.current && selectedObjectRef.current) {
        draggedObj = selectedObjectRef.current
      }
      if (draggedObj) {
        // Turn off camera rotating
        controls.enableRotate = false
        
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects =  raycaster.intersectObject(groundPlane)
        const newPos = findSnapPositionAndRotation(draggedObj, intersects[0].point, objectsRef.current, 50, 25)
        draggedObj.setPosition(newPos)
        draggedObj.update(); 
      }

    };

    const onMouseUp = () => {
      // Turn cameara rotating back on
      controls.enableRotate = true
      draggingRef.current = false;
    };

    const onKeyDown = (e) => {
      if (e.key === 'Delete' && selectedObjectRef.current) {
        selectedObjectRef.current.removeFromScene();
        objectsRef.current = objectsRef.current.filter(o => o !== selectedObjectRef.current);
        selectedObjectRef.current = null;
      }
    };

    let drag_model = undefined;

    mountRef.current.addEventListener('dragenter', async (e) => {
      e.preventDefault();
      // const model = e.dataTransfer.getData('model');
      if (!drag_model) return;
      console.log(drag_model)
      const model = drag_model;
      console.log("here:")
      console.log(model)
      if (!model || ghostRef.current) return;
      const metadata = await loadMetadata(model);
      const loader = new STLLoader();
      loader.load(`models/${model}`, geometry => {
        const material = new THREE.MeshStandardMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4 });
        const mesh = new THREE.Mesh(geometry, material);
        console.log("SetGhost")
        ghostRef.current = new TerrainObject(mesh, metadata, scene, { ghost: true });
        ghostRef.current.applyTransform(metadata.transform);
      });
    });

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const canvas = mountRef.current;
    canvas.addEventListener('drop', handleDrop);
    canvas.addEventListener('dragover', e => e.preventDefault());
    // canvas.addEventListener('dragenter', e => e.preventDefault());
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('dragover', onDrag);
    renderer.domElement.addEventListener('mousemove', onDrag);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);

    window.addEventListener('dragstart', function (e) {
      drag_model = e.dataTransfer.getData('model');
    });
  
    window.addEventListener('dragend', function () {
      drag_model = undefined;
    });
  

    return () => {
      canvas.removeEventListener('drop', handleDrop);
      canvas.removeEventListener('dragover', e => e.preventDefault());
      canvas.removeEventListener('dragenter', e => e.preventDefault());
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      // renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      mountRef.current.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} style={{ flex: 1, height: '100%' }} />;
}
