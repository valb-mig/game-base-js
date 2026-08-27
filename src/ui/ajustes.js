import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { consumePress } from '../core/input.js';

/**
 * O painel de ajuste ao vivo, no F3.
 *
 * `config.js` tem duzentos e poucos números de ajuste, e até aqui cada
 * tentativa custava editar o arquivo, recarregar a página, desembarcar de
 * novo e reconstruir a situação em que o número importava. Pra coisa que só
 * se julga OLHANDO — a curva de tom, a força da luz, o caimento de uma pose,
 * a abertura da dispersão — esse ciclo é o trabalho inteiro.
 *
 * Quem desenha é a `lil-gui`, que vem com o three e está em `vendor/`. A
 * versão à mão que estava aqui perdia no que mais importa num painel de
 * ajuste: DIGITAR o valor. Arrastar um deslizador até exatamente 1,35 é
 * impossível, e "exatamente 1,35" é o que se quer quando se está comparando
 * duas gradações.
 *
 * O que continua sendo daqui é o que a lil-gui não sabe: varrer `config.js`
 * sozinho (senão são duzentas linhas de `gui.add` pra manter de acordo com o
 * arquivo), tirar a faixa do próprio valor, avisar quem leu o número no boot,
 * soltar o mouse sem abrir a pausa, e dizer o que saiu do lugar.
 *
 * O painel não é fonte de verdade de nada: ele escreve NO objeto exportado
 * por `config.js`, que continua sendo o dono. E não grava em arquivo — copia
 * as linhas do que mudou pra colar na mão, porque gravar por cima levaria
 * junto os comentários, que nesta base são metade do valor de cada número.
 */

/** Chave que guarda cor em hexadecimal, não número de ajuste. */
const CORES = /(COLOR|COR|BOUNCE)$|^SKY_|^SOL_/;

/**
 * A faixa do deslizador sai do PRÓPRIO valor: não há tabela de mínimo e
 * máximo pros duzentos números, e inventar uma seria uma segunda fonte de
 * verdade pra manter de acordo com a primeira. Três vezes o valor dá espaço
 * pra dobrar e pra zerar, que é o que se faz tateando. E é só a faixa do
 * ARRASTO: digitar passa por cima dela, que é justamente pra isso que a
 * lil-gui entrou.
 */
export function faixa(valor) {
  if (valor === 0) return { min: 0, max: 1, passo: 0.01 };
  const magnitude = Math.abs(valor);
  const inteiro = Number.isInteger(valor) && magnitude > 4;
  return {
    min: valor < 0 ? valor * 3 : 0,
    max: valor < 0 ? 0 : magnitude * 3,
    passo: inteiro ? 1 : Math.max(0.0001, magnitude / 200)
  };
}

const hex = (n) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;

/** Percorre um grupo de config e devolve as folhas mexíveis. */
export function folhas(grupo, prefixo = '') {
  const saida = [];
  for (const [chave, valor] of Object.entries(grupo)) {
    const nome = prefixo ? `${prefixo}.${chave}` : chave;
    if (typeof valor === 'number' && Number.isFinite(valor)) {
      saida.push({ alvo: grupo, chave, nome, cor: CORES.test(chave) });
    } else if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      saida.push(...folhas(valor, nome));
    }
  }
  return saida;
}

/**
 * `grupos` é um objeto { NOME: objetoDoConfig }. `aplicar` roda depois de
 * toda mudança, e é onde mora o que foi lido no boot.
 */
export function initAjustes(grupos, { aplicar = () => {}, soltarMouse = () => {} } = {}) {
  // A lil-gui se prende no canto superior direito por padrão, que aqui já é
  // do radar e do painel do F2. O container próprio é o que a traz pra
  // esquerda sem lutar com o CSS dela.
  const caixa = document.createElement('div');
  caixa.id = 'ajustes';
  caixa.className = 'ajustes';
  document.body.appendChild(caixa);

  const gui = new GUI({ container: caixa, title: 'ajustes · F3', width: 330 });

  // O valor de partida guardado na montagem é o que faz o "o que mudou" ser
  // uma lista curta em vez do config inteiro despejado.
  const controles = [];

  for (const [nomeDoGrupo, grupo] of Object.entries(grupos)) {
    const pasta = gui.addFolder(nomeDoGrupo);
    // Só a primeira nasce aberta: com nove fechadas o painel é uma lista de
    // nomes, e com nove abertas são duzentos controles de uma vez — a mesma
    // inutilidade pelo outro lado.
    if (controles.length) pasta.close();

    for (const folha of folhas(grupo)) {
      const inicial = folha.alvo[folha.chave];
      const { min, max, passo } = faixa(inicial);

      const controlador = folha.cor
        ? pasta.addColor(folha.alvo, folha.chave)
        : pasta.add(folha.alvo, folha.chave, min, max, passo);

      controlador.name(folha.nome).onChange((valor) => {
        // Quem saiu do valor de partida fica marcado: sem isso, achar o que
        // se mexeu num painel de duzentas linhas é rolar procurando.
        controlador.domElement.classList.toggle('mudou', valor !== inicial);
        aplicar(`${nomeDoGrupo}.${folha.nome}`, valor);
      });

      controles.push({ grupo: nomeDoGrupo, folha, inicial, controlador });
    }
  }

  /** As linhas prontas pra colar em `config.js`, só do que saiu do lugar. */
  function mudancas() {
    return controles
      .filter(({ folha, inicial }) => folha.alvo[folha.chave] !== inicial)
      .map(({ grupo, folha, inicial }) => {
        const valor = folha.alvo[folha.chave];
        const escrito = folha.cor
          ? `0x${(valor & 0xffffff).toString(16).padStart(6, '0')}`
          : Math.round(valor * 10000) / 10000;
        return `${grupo}.${folha.nome}: ${escrito},   // era ${folha.cor ? hex(inicial) : inicial}`;
      });
  }

  const recado = { texto: 'nada mudou ainda' };
  const acoes = {
    copiar() {
      const linhas = mudancas();
      recado.texto = linhas.length ? `${linhas.length} linha(s) copiada(s)` : 'nada mudou ainda';
      if (linhas.length) navigator.clipboard?.writeText(linhas.join('\n'));
      aviso.updateDisplay();
    }
  };
  gui.add(acoes, 'copiar').name('copiar o que mudou');
  const aviso = gui.add(recado, 'texto').name('').disable();

  let aberto = false;
  gui.hide();

  function alternar(estado = !aberto) {
    aberto = estado;
    caixa.classList.toggle('visivel', aberto);
    aberto ? gui.show() : gui.hide();
    soltarMouse('ajustes', aberto);
    return aberto;
  }

  return {
    update() {
      if (consumePress('F3')) alternar();
    },
    alternar,
    mudancas,
    /** Os controles da lil-gui, pra que o teste mexa pela API de verdade. */
    controles,
    get aberto() {
      return aberto;
    }
  };
}
