import * as THREE from 'three';
import { Viewmodel } from '../../src/items/viewmodel.js';
import { KNIFE, PISTOL, SHOVEL, MP40 } from '../../src/items/classes.js';
import { suite, ok, eq, note } from '../assert.js';

const ITENS = [
  { item: MP40, nome: 'MP40', maos: ['mao_dir', 'mao_esq'] },
  { item: PISTOL, nome: 'pistola', maos: ['mao_dir'] },
  { item: KNIFE, nome: 'faca', maos: ['mao_dir'] },
  { item: SHOVEL, nome: 'pá', maos: ['mao_dir', 'mao_esq'] }
];

const alvo = new THREE.Vector3();
const palma = new THREE.Vector3();
const ponta = new THREE.Vector3();

export function run() {
  suite('braços em primeira pessoa');

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);
  const vm = new Viewmodel(camera, 1.6);

  for (const { item, nome, maos } of ITENS) {
    vm.setItem(item);
    ok(`${nome} tem modelo`, vm.item !== null);

    for (const marcador of maos) {
      const no = vm.item.getObjectByName(marcador);
      ok(`${nome} declara ${marcador}`, no !== undefined && no !== null);
      if (!no) continue;

      const braco = marcador === 'mao_dir' ? vm.bracos.dir : vm.bracos.esq;
      ok(`e o braço de ${marcador} aparece`, braco.visible === true);

      // A mão TEM que chegar no marcador. Já errou de dois jeitos: com o osso
      // modelado no -Z o braço apontava pro lado oposto da mão, e com a mão
      // pendurada no cotovelo ela seguia a direção do braço em vez da do
      // antebraço — nos dois casos a arma ficava segura por ninguém.
      no.getWorldPosition(alvo);
      braco.mao.getWorldPosition(palma);
      const erro = palma.distanceTo(alvo);
      note(`${nome}/${marcador}: mão ao marcador`, `${(erro * 100).toFixed(1)} cm`);
      ok(`a mão de ${marcador} alcança ${nome}`, erro < 0.03);

      // E o braço tem que SAIR do ombro na direção da mão. Com o eixo do osso
      // trocado a ponta caía atrás do ombro, fora do enquadramento.
      braco.malhaSuperior.getWorldPosition(ponta);
      const paraMao = alvo.clone().sub(braco.ombro.position).normalize();
      braco.cotovelo.getWorldPosition(ponta);
      const paraCotovelo = ponta.clone().sub(braco.ombro.position).normalize();
      ok(`o braço de ${marcador} sai na direção da mão em ${nome}`,
        paraMao.dot(paraCotovelo) > 0.3);
    }

    // Braço sem nada pra segurar não é desenhado.
    if (!maos.includes('mao_esq')) {
      ok(`${nome} não desenha o braço esquerdo`, vm.bracos.esq.visible === false);
    }
  }

  // Mão vazia é estado de jogo: some o item e somem os dois braços.
  vm.setItem(null);
  eq('mão vazia não tem item', vm.item, null);
  ok('nem braço direito', vm.bracos.dir.visible === false);
  ok('nem braço esquerdo', vm.bracos.esq.visible === false);
}
