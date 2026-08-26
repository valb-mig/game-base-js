import * as THREE from 'three';
import { BULLET } from '../config.js';

/**
 * Balas em voo.
 *
 * Não é hitscan: a bala é uma entidade que sai a 253 m/s e cai por gravidade
 * no caminho. É o que torna a queda uma mecânica de verdade em vez de um
 * enfeite — a 50 m já é preciso mirar acima, e alvo em movimento exige avanço.
 *
 * O acerto é testado sobre o TRECHO percorrido no quadro, nunca sobre a
 * posição final. A 253 m/s uma bala anda 4,2 m por quadro a 60 fps: testar só
 * onde ela parou faria ela atravessar qualquer parede e qualquer alvo.
 */
export function createBallistics(scene, colliders, {
  onTerrainImpact = null, onFoliage = null
} = {}) {
  const bullets = [];
  const listeners = [];
  // Quem escuta DISPARO, não acerto. São duas perguntas diferentes: o som do
  // tiro sai no cano e o do impacto sai onde a bala bate, e um tiro que não
  // acerta nada continua sendo ouvido.
  const aoDisparar = [];

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const segment = new THREE.Vector3();
  const toCenter = new THREE.Vector3();
  const ray = new THREE.Ray();
  const hitPoint = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const folhagem = new THREE.Vector3();
  const NOTHING = new Set();

  // Fração do trecho abaixo da qual dois acertos contam como simultâneos. A
  // 253 m/s, 0,4% de um quadro é meio centímetro — a espessura de uma tampa
  // de cápsula, que é exatamente onde as regiões se encostam.
  const EMPATE = 0.004;

  // Reaproveitados: resolver acerto é coisa de todo quadro, e alocar uma
  // lista de regiões por bala por alvo seria lixo por quadro.
  const corpo = [];

  function makeTracer() {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(BULLET.TRACER_WIDTH, BULLET.TRACER_WIDTH, 1),
      new THREE.MeshBasicMaterial({
        color: BULLET.TRACER_COLOR, transparent: true, opacity: 0.85, depthWrite: false
      })
    );
    mesh.renderOrder = 3;
    return mesh;
  }

  /**
   * Fração do trecho (0..1) em que ele encosta na esfera do alvo, ou null.
   * Resolve a interseção segmento-esfera pelo ponto mais próximo do centro.
   */
  function sphereHit(start, delta, center, radius) {
    toCenter.copy(center).sub(start);
    const length2 = delta.lengthSq();
    if (length2 < 1e-12) return null;

    const t = THREE.MathUtils.clamp(toCenter.dot(delta) / length2, 0, 1);
    hitPoint.copy(start).addScaledVector(delta, t);
    return hitPoint.distanceTo(center) <= radius ? t : null;
  }

  /**
   * Interseção do trecho da bala com uma CAIXA, no sistema do alvo.
   *
   * Teste de fatias: para cada eixo, o pedaço do trecho que está dentro da
   * faixa da caixa. Sobrando interseção nos três, houve acerto — e `tMin` é
   * onde ele começou.
   */
  function caixaHit(ax, ay, az, dx, dy, dz, c) {
    let entra = 0;
    let sai = 1;

    for (const [origem, passo, menor, maior] of [
      [ax, dx, c.minX, c.maxX],
      [ay, dy, c.minY, c.maxY],
      [az, dz, c.minZ, c.maxZ]
    ]) {
      if (Math.abs(passo) < 1e-9) {
        // paralelo ao eixo: ou está dentro da faixa o tempo todo, ou nunca
        if (origem < menor || origem > maior) return null;
        continue;
      }
      let t1 = (menor - origem) / passo;
      let t2 = (maior - origem) / passo;
      if (t1 > t2) { const troca = t1; t1 = t2; t2 = troca; }
      if (t1 > entra) entra = t1;
      if (t2 < sai) sai = t2;
      if (entra > sai) return null;
    }
    return entra;
  }

  /**
   * Fração do trecho em que ele entra em algum colisor, ou null.
   *
   * Colisor de alvo é pulado: quem resolve alvo é a esfera dele, logo
   * adiante. Sem isso a caixa do boneco vira parede e a bala morre alguns
   * centímetros antes do centro — o tiro "acerta" e não causa dano nenhum.
   *
   * E o colisor de QUEM ATIROU também, por `doAtirador`. A bala de um bot
   * nasce na altura do olho dele, ou seja dentro da caixa dele: sem pular
   * essa caixa, todo tiro de bot morria no quadro em que saía. Medido: 77
   * tiros, zero acertos, a dez metros de um alvo parado. O jogador nunca
   * viu isso porque ele não tem colisor no mundo.
   */
  function wallHit(start, delta, ignore, doAtirador = null) {
    const length = delta.length();
    if (length < 1e-9) return null;

    ray.origin.copy(start);
    ray.direction.copy(delta).divideScalar(length);

    let nearest = null;
    for (const collider of colliders) {
      if (ignore.has(collider) || collider === doAtirador) continue;
      const point = ray.intersectBox(collider.box, hitPoint);
      if (!point) continue;
      const distance = start.distanceTo(point);
      if (distance > length) continue;
      const t = distance / length;
      if (nearest === null || t < nearest) nearest = t;
    }
    return nearest;
  }

  function retire(bullet, atPosition) {
    bullet.spent = true;
    if (atPosition) bullet.position.copy(atPosition);
    // o traçante ainda apaga por um instante depois que a bala morre
    bullet.fade = bullet.tracer ? BULLET.TRACER_FADE : 0;
  }

  function step(bullet, delta, targets, terrain, ignore) {
    from.copy(bullet.position);

    const previousVelocity = bullet.velocity.y;
    bullet.velocity.y -= BULLET.GRAVITY * delta;
    to.copy(from)
      .addScaledVector(bullet.velocity, delta)
      .setY(from.y + (previousVelocity + bullet.velocity.y) * 0.5 * delta);

    segment.copy(to).sub(from);

    let closest = wallHit(from, segment, ignore, bullet.shooter);
    let struck = null;

    let regiaoAtingida = null;
    let melhorOrdem = Infinity;
    for (const target of targets) {
      if (!target.alive) continue;
      // Ninguém atira em si mesmo. A bala nasce na altura do OLHO e a esfera
      // de acerto está no peito: agachado, os dois ficam a 30 cm um do outro,
      // e sem isto o bot se mata no primeiro tiro.
      if (target === bullet.owner) continue;

      // Corpo dividido em regiões, quando o alvo tem: cabeça, capacete,
      // tronco, braços e pernas. Uma esfera só faria o tiro na cabeça valer
      // o mesmo que o tiro na canela, e mirar deixaria de ser habilidade.
      const partes = target.body?.(corpo);
      if (partes) {
        // A bala vai pro sistema do ALVO: uma conta por alvo, em vez de levar
        // dezesseis caixas pro mundo. E é o que permite a caixa acompanhar
        // quem gira sem recalcular nada.
        const giro = target.yaw ?? 0;
        const cos = Math.cos(giro);
        const sen = Math.sin(giro);
        const ox = from.x - target.x;
        const oz = from.z - target.z;

        const lax = ox * cos - oz * sen;
        const lay = from.y - (target.feetY ?? 0);
        const laz = ox * sen + oz * cos;
        const ldx = segment.x * cos - segment.z * sen;
        const ldy = segment.y;
        const ldz = segment.x * sen + segment.z * cos;

        for (const parte of partes) {
          const t = caixaHit(lax, lay, laz, ldx, ldy, ldz, parte);
          if (t === null || t > 1) continue;

          // Empate vai pra REGIÃO MAIS VALIOSA, não pra última testada. Onde
          // cabeça e capacete se encostam o tiro é na cabeça: acertar o menor
          // alvo não pode ser desperdiçado por um milímetro de sobreposição.
          if (closest !== null) {
            const perto = t < closest - EMPATE;
            const empatou = Math.abs(t - closest) <= EMPATE;
            if (!perto && !(empatou && parte.ordem < melhorOrdem)) continue;
          }
          closest = t;
          struck = target;
          regiaoAtingida = parte.regiao;
          melhorOrdem = parte.ordem;
        }
        continue;
      }

      const t = sphereHit(from, segment, target.center(), target.radius);
      if (t === null) continue;
      if (closest !== null && t > closest) continue;
      closest = t;
      struck = target;
      regiaoAtingida = null;
    }

    // terreno: amostra ao longo do trecho, porque ele é curvo e a bala é reta
    let noChao = false;
    if (terrain && closest === null) {
      const steps = Math.max(1, Math.ceil(segment.length() / BULLET.STEP));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        hitPoint.copy(from).addScaledVector(segment, t);
        if (hitPoint.y <= terrain.heightAt(hitPoint.x, hitPoint.z)) {
          closest = t;
          noChao = true;
          break;
        }
      }
    }

    // Mato atravessado vem abaixo, e a bala segue: arbusto é cobertura
    // visual, não blindagem. Quem sabe o que é mato é o mundo — a balística
    // só diz por onde a bala passou, como já faz com o terreno.
    if (onFoliage) {
      if (closest !== null) folhagem.copy(from).addScaledVector(segment, closest);
      else folhagem.copy(to);
      onFoliage(from, folhagem);
    }

    if (closest !== null) {
      hitPoint.copy(from).addScaledVector(segment, closest);
      retire(bullet, hitPoint);

      // Bala no chão marca o terreno. Quem afunda de fato é o mundo — a
      // balística só diz onde bateu e com que força.
      if (noChao && bullet.dig > 0 && onTerrainImpact) {
        onTerrainImpact(hitPoint.x, hitPoint.z, bullet.dig);
      }

      const result = struck
        ? struck.damage(bullet.damage, regiaoAtingida)
        : { target: null, amount: 0, killed: false };
      // `owner` vai junto: sem ele, quem escuta acerto não tem como saber se
      // a bala era dele. Era assim que o acerto de um bot a sessenta metros
      // acendia a marca na mira do jogador.
      for (const listener of listeners) {
        listener({
          ...result, point: hitPoint.clone(), terreno: noChao,
          owner: bullet.owner, regiao: regiaoAtingida
        });
      }
      return;
    }

    bullet.position.copy(to);
    bullet.travelled += segment.length();
    bullet.life -= delta;
    if (bullet.life <= 0 || bullet.travelled > bullet.range) retire(bullet, null);
  }

  return {
    bullets,

    onHit(listener) {
      listeners.push(listener);
    },

    /**
     * Há parede entre dois pontos?
     *
     * Quem atira da boca do cano precisa saber: a boca fica meio metro à
     * frente do olho, e com a arma encostada numa quina isso põe a origem do
     * tiro do outro lado dela — a bala nasceria atravessada.
     *
     * `ignore` é um Set de colisores a pular, e quem pergunta por linha de
     * visão precisa dele: o bot tem colisor próprio, e o raio saindo de
     * dentro dele acusaria parede em todo olhar. Vale também pro colisor do
     * alvo, senão a caixa dele barra a mira até ele mesmo — este é o quarto
     * lugar desta base onde isso apareceu.
     */
    blocked(from, to, ignore = NOTHING) {
      probe.copy(to).sub(from);
      return wallHit(from, probe, ignore) !== null;
    },

    /**
     * Dispara uma bala. `tracer` decide se ela deixa risco, e `gravity` quanto
     * ela cai — quem atira decide, porque a bala do jogador e a do bot não
     * caem igual.
     */
    /** Avisado a cada disparo, de quem quer que seja. */
    onShot(listener) {
      aoDisparar.push(listener);
    },

    spawn(origin, direction, {
      damage, range, tracer = false, dig = 0, shooter = null, owner = null,
      som = null, gravity = BULLET.GRAVITY
    }) {
      const bullet = {
        position: origin.clone(),
        velocity: direction.clone().multiplyScalar(BULLET.SPEED),
        // De onde saiu e pra onde apontava. Só a depuração usa, e é o que
        // permite reconstruir o arco inteiro sem guardar rastro nenhum: com
        // origem, direção e tempo decorrido, a parábola sai de conta.
        origin: origin.clone(),
        aim: direction.clone(),
        damage,
        range,
        dig,
        shooter,
        owner,
        travelled: 0,
        life: BULLET.LIFE,
        spent: false,
        fade: 0,
        tracer: tracer ? makeTracer() : null
      };
      if (bullet.tracer) scene.add(bullet.tracer);
      bullets.push(bullet);
      for (const listener of aoDisparar) {
        listener({ x: origin.x, y: origin.y, z: origin.z, som, owner });
      }
      return bullet;
    },

    update(delta, targets = [], terrain = null) {
      // colisores que pertencem a alvos saem da conta de parede, uma vez só
      const ignore = new Set();
      for (const target of targets) {
        if (target.collider) ignore.add(target.collider);
      }

      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];

        if (!bullet.spent) step(bullet, delta, targets, terrain, ignore);

        if (bullet.tracer) {
          const speed = bullet.velocity.length();
          const length = Math.min(BULLET.TRACER_LENGTH, bullet.travelled);
          bullet.tracer.scale.z = Math.max(0.001, length);
          bullet.tracer.position.copy(bullet.position)
            .addScaledVector(bullet.velocity, -length / (2 * speed));
          bullet.tracer.lookAt(bullet.position);
          bullet.tracer.material.opacity = bullet.spent
            ? 0.85 * Math.max(0, bullet.fade / BULLET.TRACER_FADE)
            : 0.85;
        }

        if (bullet.spent) {
          bullet.fade -= delta;
          if (bullet.fade > 0) continue;

          if (bullet.tracer) {
            scene.remove(bullet.tracer);
            bullet.tracer.geometry.dispose();
            bullet.tracer.material.dispose();
          }
          bullets.splice(i, 1);
        }
      }
    }
  };
}
