import * as THREE from 'three';
import { olhoDoAssento } from './modelo.js';

/**
 * A câmera de dentro do veículo.
 *
 * Ela NÃO é rígida, e isso é metade da sensação de estar num jipe: acelerar
 * joga o corpo pra trás, frear joga pra frente, e o buraco chega pela
 * suspensão. Sem isso a tela translada pelo mapa e o que se sente é voar.
 *
 * Duas coisas já vêm de graça e não estão aqui: a posição do assento sai do
 * NÓ do modelo, que é girado pela rotação completa do corpo — o olho dipa
 * numa frenagem e sobe numa lombada sozinho, porque o assento faz isso. E o
 * pitch/roll do OLHAR fica de fora de propósito: virar a cabeça do jogador
 * junto com a carroceria é o caminho mais curto pra enjoar alguém.
 *
 * O que ela adiciona é o GIRO. Sentado, quem vira é o veículo levando a
 * cabeça junto; sem isso, dirigir em curva faria o mundo rodar em volta de
 * uma cabeça parada, e o jogador teria que corrigir com o mouse a cada curva.
 */

/**
 * O euler em YXZ, e ele NÃO é detalhe.
 *
 * `camera.rotation` decodifica o quaternion em XYZ, mas o PointerLockControls
 * compõe em YXZ — é o primeiro invariante desta base. Escrever
 * `camera.rotation.z = roll` lê yaw e pitch errados, reescreve os três em XYZ,
 * e a orientação inteira embaralha: em certos ângulos de olhar a câmera vira
 * DE CABEÇA PRA BAIXO dentro do veículo. Com um euler YXZ explícito, `y` é o
 * yaw de verdade e `z` é só a rolagem, que é o que `player/view.js` já faz.
 */
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

// Deslocamento em metros por m/s² de aceleração, e o teto.
const INERCIA = 0.012;
const INERCIA_MAX = 0.09;
const VOLTA = 9;          // com que rapidez o corpo volta pro lugar
const ROLAGEM = 0.35;     // fração da rolagem do jipe que vira rolagem de tela

export function criarVista(camera) {
  const olho = new THREE.Vector3();
  const desvio = new THREE.Vector3();
  const alvo = new THREE.Vector3();
  const anterior = { ao: 0, de: 0, yaw: null };

  return {
    /** Recomeça: quem acabou de sentar não herda a inércia da última viagem. */
    reiniciar(veiculo) {
      desvio.set(0, 0, 0);
      anterior.ao = veiculo.corpo.aoLongo;
      anterior.de = veiculo.corpo.deLado;
      anterior.yaw = veiculo.corpo.yaw;
    },

    update(delta, veiculo, lugar) {
      const corpo = veiculo.corpo;
      if (delta <= 0) return;

      /**
       * Giro e rolagem numa escrita só, pelo euler YXZ.
       *
       * O veículo virou e a cabeça vira com ele: `euler.y` é o yaw de verdade
       * nesta ordem, e somar o delta ali não toca no pitch que o jogador
       * escolheu com o mouse. A rolagem entra no mesmo passe — girar em torno
       * do Z não mexe no -Z, ou seja não mexe em pra onde a bala vai.
       */
      let dYaw = 0;
      if (anterior.yaw !== null) {
        dYaw = corpo.yaw - anterior.yaw;
        // O giro do corpo é embrulhado em -π..π; sem desembrulhar aqui,
        // cruzar o limite dava uma volta inteira de câmera num quadro.
        if (dYaw > Math.PI) dYaw -= Math.PI * 2;
        if (dYaw < -Math.PI) dYaw += Math.PI * 2;
      }
      anterior.yaw = corpo.yaw;

      euler.setFromQuaternion(camera.quaternion);
      euler.y += dYaw;
      euler.z = corpo.roll * ROLAGEM;
      camera.quaternion.setFromEuler(euler);

      // Aceleração no sistema do corpo, medida entre quadros. O corpo é jogado
      // CONTRA ela: acelerando pra frente, ele cola no banco.
      const ao = (corpo.aoLongo - anterior.ao) / delta;
      const de = (corpo.deLado - anterior.de) / delta;
      anterior.ao = corpo.aoLongo;
      anterior.de = corpo.deLado;

      alvo.set(
        THREE.MathUtils.clamp(-de * INERCIA, -INERCIA_MAX, INERCIA_MAX),
        0,
        THREE.MathUtils.clamp(-ao * INERCIA, -INERCIA_MAX, INERCIA_MAX)
      );
      desvio.lerp(alvo, Math.min(1, VOLTA * delta));

      olhoDoAssento(veiculo.modelo, veiculo.ficha, lugar.def, corpo, olho);
      // O desvio é no sistema do CORPO: frear joga pra frente do jipe, não pra
      // frente de onde o jogador está olhando.
      const cos = Math.cos(corpo.yaw);
      const sen = Math.sin(corpo.yaw);
      camera.position.set(
        olho.x + desvio.x * cos + desvio.z * sen,
        olho.y + desvio.y,
        olho.z - desvio.x * sen + desvio.z * cos
      );

    }
  };
}

/**
 * Tira a rolagem da câmera sem mexer em pra onde ela olha.
 *
 * Existe porque `camera.rotation.z = 0` não faz isso: ele decodifica o
 * quaternion em XYZ, e o que volta não é a mesma direção de olhar. Quem desce
 * do veículo tem que continuar olhando pro mesmo lugar, aprumado.
 */
export function aprumarVista(camera) {
  euler.setFromQuaternion(camera.quaternion);
  euler.z = 0;
  camera.quaternion.setFromEuler(euler);
}
