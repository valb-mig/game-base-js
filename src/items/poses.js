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
    // Baixa e gira o poço do carregador pra dentro, que é pra onde a outra
    // mão iria. Sai do centro, mas continua no enquadramento: a recarga tem
    // que custar a visão do que está à frente e ainda assim ser vista.
    reloadOut: { position: [0.125, -0.175, -0.34], rotation: [0.34, -0.46, 0.62] },
    reloadIn: { position: [0.112, -0.14, -0.36], rotation: [0.2, -0.34, 0.44] }
  },

  mp40: {
    // Arma longa, e isso muda tudo em relação à pistola. Ela fica mais
    // afastada do olho: o modelo tem 616 mm e a origem no meio da caixa, então
    // pose de pistola deixava o tubo da culatra dentro da câmera.
    //
    // E os ÂNGULOS da corrida são bem menores que os da pistola, porque num
    // cano de 61 cm o ângulo é alavanca: os 0,45 rad de caimento da pistola
    // baixam a boca dela 7 cm e baixariam a desta 18, jogando a ponta pra
    // fora da borda de baixo. Medido projetando a boca na tela do viewmodel,
    // que tem 42° e só ±11 cm de altura a 30 cm do olho.
    rest: { position: [0.135, -0.125, -0.29], rotation: [0.045, -0.12, 0.05] },
    sprint: { position: [0.16, -0.15, -0.3], rotation: [-0.12, 0.3, 0.36] },
    // Mira de ferro: translação pura, altura tirada da linha de mira do
    // modelo. Mais recuada que a pistola porque a alça fica sobre a caixa.
    ads: { position: [0, -0.031, -0.44], rotation: [0, 0, 0] },
    // Recarga: inclina o poço pra dentro, que é onde a outra mão troca o
    // carregador. O de 32 é longo, então ela desce mais que a da pistola.
    reloadOut: { position: [0.17, -0.3, -0.3], rotation: [0.3, -0.42, 0.5] },
    reloadIn: { position: [0.155, -0.23, -0.31], rotation: [0.18, -0.3, 0.36] }
  },

  m1943: {
    // cabo já aponta pra frente; a pá fica baixa e cruzada, como quem carrega
    // Recuada e de lado: a pá é comprida, e perto do olho a lâmina tapava
    // justamente o ponto onde a pazada vai cair.
    rest: { position: [0.2, -0.3, -0.52], rotation: [0.3, -0.34, 0.26] },
    sprint: { position: [0.26, -0.4, -0.46], rotation: [-0.3, 0.6, 0.6] },
    // Pazada: ergue, crava pra baixo e à frente, e volta. A lâmina passa
    // pelo chão perto de digAt, que é quando o terreno muda.
    wind: { position: [0.24, -0.12, -0.46], rotation: [0.8, -0.5, -0.06] },
    slash: { position: [0.05, -0.5, -0.62], rotation: [-0.5, -0.18, 0.3] }
  }
};

const FALLBACK = HAND_POSES.kabar;

export function handPose(item) {
  return (item && HAND_POSES[item.id]) || FALLBACK;
}
