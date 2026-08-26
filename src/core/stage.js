import * as THREE from 'three';
import { CAMERA, GRADE, WORLD } from '../config.js';
import { createSkyTexture, sunDirection } from './sky.js';

/**
 * A curva de tom do jogo.
 *
 * Sai daqui como constante, e não escrita no meio de `createStage`, pra que a
 * suíte possa conferir QUAL curva é sem precisar de um renderer WebGL. A
 * escolha foi medida, não preferida: ver a tabela das sete em `GRADE`.
 */
export const CURVA_DE_TOM = THREE.AgXToneMapping;

// Monta renderer, cena, câmera e luzes. Nada de jogo aqui dentro.
export function createStage() {
  const scene = new THREE.Scene();
  scene.background = createSkyTexture();

  // A névoa é da cor do HORIZONTE, não do zênite. Ela existe pra que o
  // terreno distante se dissolva no céu, e casada com a parte escura do céu
  // ela desenha uma faixa cinza na linha do horizonte que não está lá.
  scene.fog = new THREE.Fog(WORLD.SKY_HORIZONTE, WORLD.FOG_NEAR, WORLD.FOG_FAR);

  const camera = new THREE.PerspectiveCamera(
    CAMERA.FOV,
    innerWidth / innerHeight,
    CAMERA.NEAR,
    CAMERA.FAR
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  // A gradação de cor do jogo mora aqui, nestas duas linhas. Ver `GRADE` em
  // config.js pra tabela das sete curvas medidas — AgX é a única que desatura
  // em vez de empurrar o verde pro neon.
  //
  // Ela alcança tudo que passa por material: terreno, prop, viewmodel e a
  // névoa. E alcança o céu também, mas só porque a textura dele é marcada
  // como LINEAR — ver `createSkyTexture`.
  renderer.toneMapping = CURVA_DE_TOM;
  renderer.toneMappingExposure = GRADE.EXPOSICAO;

  document.body.appendChild(renderer.domElement);

  // Dia encoberto é luz de cúpula, não de holofote: a nuvem espalha o sol por
  // toda a abóbada. Por isso a hemisférica é a luz PRINCIPAL aqui e a
  // direcional só dá o lado — invertidos, o mapa ganhava sombra dura de dia
  // de sol debaixo de um céu fechado, e nada casava.
  // Os dois números saem de `GRADE`, junto com a curva de tom: luz e curva
  // são a mesma decisão vista de dois lados, e separá-las foi o que fez a
  // hemisférica ficar em 2,9 depois que a curva já levantava o quadro.
  // Encoberto é DIA, e dia claro — o que muda é a sombra sumir, não a luz.
  const ceu = new THREE.HemisphereLight(
    WORLD.SKY_HORIZONTE, GRADE.BOUNCE, GRADE.HEMISFERICA
  );
  scene.add(ceu);

  const sun = new THREE.DirectionalLight(WORLD.SOL_COR, GRADE.DIRECIONAL);
  sun.position.copy(sunDirection()).multiplyScalar(200);
  scene.add(sun);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // As luzes saem daqui porque a gradação se julga OLHANDO, e o painel de
  // ajustes precisa mexer nelas com o mapa montado. Ver `ui/ajustes.js`.
  return { scene, camera, renderer, luzes: { ceu, sol: sun } };
}
