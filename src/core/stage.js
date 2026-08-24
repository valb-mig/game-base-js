import * as THREE from 'three';
import { CAMERA, WORLD } from '../config.js';

// Monta renderer, cena, câmera e luzes. Nada de jogo aqui dentro.
export function createStage() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WORLD.SKY_COLOR);
  scene.fog = new THREE.Fog(WORLD.SKY_COLOR, WORLD.FOG_NEAR, WORLD.FOG_FAR);

  const camera = new THREE.PerspectiveCamera(
    CAMERA.FOV,
    innerWidth / innerHeight,
    CAMERA.NEAR,
    CAMERA.FAR
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x4a6b2a, 1.1));

  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { scene, camera, renderer };
}
