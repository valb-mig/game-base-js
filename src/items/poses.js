/**
 * Como cada item é segurado. Sem three de propósito: são só números, e o
 * viewmodel converte uma vez na troca de item.
 *
 * Isto existe porque pose não é propriedade do viewmodel, é do item. A faca
 * é modelada com a lâmina no +X e precisa de um giro de 90° pra apontar pra
 * frente; a pistola já nasce com o cano no -Z e o mesmo giro a deixava de
 * lado, com o cano apontando pra parede.
 *
 * Cada pose é [x, y, z] de posição e [x, y, z] de rotação, em radianos.
 */

const QUARTER = Math.PI / 2;

export const HAND_POSES = {
  kabar: {
    rest: { position: [0.135, -0.115, -0.48], rotation: [0.08, QUARTER + 0.26, 0.14] },
    sprint: { position: [0.175, -0.165, -0.44], rotation: [-0.24, QUARTER + 0.55, 0.34] },
    // golpe: recolhe pra trás e pra cima, depois cruza a tela de cima pra baixo
    wind: { position: [0.235, -0.055, -0.33], rotation: [0.62, QUARTER + 0.72, -0.34] },
    slash: { position: [-0.075, -0.235, -0.4], rotation: [-0.5, QUARTER - 0.34, 0.86] }
  },

  m1911: {
    // cano já aponta pra frente; só um leve caimento pra dentro
    rest: { position: [0.098, -0.098, -0.42], rotation: [0.05, -0.09, 0.06] },
    sprint: { position: [0.165, -0.205, -0.4], rotation: [-0.45, 0.62, 0.52] },
    // Mira de ferro: translação pura. A altura vem da linha de mira do
    // modelo, e a distância é de braço — perto demais o ferrolho fica mais
    // largo na tela que o alvo e tapa o que se quer acertar.
    ads: { position: [0, -0.0355, -0.5], rotation: [0, 0, 0] },
    // Recarga: a arma desce e gira o poço do carregador pra dentro, que é
    // pra onde a outra mão iria. Fica fora do centro da tela de propósito —
    // recarregar tem que custar a visão do que está à frente.
    // Baixa e gira o poço do carregador pra dentro, que é pra onde a outra
    // mão iria. Sai do centro, mas continua no enquadramento: a recarga tem
    // que custar a visão do que está à frente e ainda assim ser vista.
    reloadOut: { position: [0.125, -0.175, -0.34], rotation: [0.34, -0.46, 0.62] },
    reloadIn: { position: [0.112, -0.14, -0.36], rotation: [0.2, -0.34, 0.44] }
  }
};

const FALLBACK = HAND_POSES.kabar;

export function handPose(item) {
  return (item && HAND_POSES[item.id]) || FALLBACK;
}
