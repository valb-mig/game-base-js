import { criarMedidor } from '../../src/ui/medidor.js';
import { sintetizar, RECEITAS } from '../../src/core/audio.js';
import { initAjustes, faixa } from '../../src/ui/ajustes.js';
import { suite, ok, eq, near, note } from '../assert.js';

/**
 * As ferramentas de desenvolvimento também são código de produção.
 *
 * Nenhuma asserção aqui mede TEMPO: a suíte roda sob `--virtual-time-budget`
 * e ali `performance.now()` não anda — `custo < 1.5` passa verde com 0,000 ms
 * e não exercita nada. O que se prova é a REGRA: que a estatística acha o
 * engasgo que a média esconde, e que o painel escreve no config de verdade e
 * sabe dizer o que saiu do lugar.
 */
export function run() {
  suite('o medidor acha o engasgo que a média esconde');

  const medidor = criarMedidor();
  // 29 quadros a 60 fps e um de 40 ms: a média dá 17,4 ms e diz "quase 60".
  for (let i = 0; i < 29; i++) medidor.quadro(1 / 60);
  medidor.quadro(0.040);

  const m = medidor.medida();
  eq('guardou os trinta quadros', m.quadros, 30);
  near('a mediana continua sendo o quadro bom', m.p50, 16.7, 0.2);
  near('e o pior quadro aparece inteiro', m.pior, 40, 0.1);
  ok('o engasgo é mais que o dobro da mediana', m.pior > m.p50 * 2);

  const media = (29 * (1000 / 60) + 40) / 30;
  note('média · p50 · pior',
    `${media.toFixed(1)} ms · ${m.p50.toFixed(1)} ms · ${m.pior.toFixed(1)} ms`);
  ok('e a média sozinha diria que está tudo bem', media < 18);

  suite('a janela é rolante: quadro velho sai');

  const rolante = criarMedidor();
  for (let i = 0; i < 400; i++) rolante.quadro(0.100);   // 400 quadros ruins
  for (let i = 0; i < 130; i++) rolante.quadro(1 / 60);  // e a vida melhora
  const depois = rolante.medida();
  eq('a janela não passa de 120 quadros', depois.quadros, 120);
  near('e o desastre de dez quadros atrás já saiu', depois.pior, 16.7, 0.3);

  suite('sem renderer o medidor conta só tempo');

  const magro = criarMedidor();
  magro.quadro(1 / 60);
  eq('nenhuma draw call inventada', magro.medida().chamadas, 0);
  eq('e a linha de desenho nem aparece', magro.linhas().length, 1);

  suite('o painel de ajustes escreve no config de verdade');

  const CONFIG = { EXPOSICAO: 1.6, ALCANCE: 600, COR: 0x7b8558, NINHO: { FUNDO: 2 } };
  const aplicados = [];
  const ajustes = initAjustes({ TESTE: CONFIG }, {
    aplicar: (nome, valor) => aplicados.push([nome, valor]),
    soltarMouse: () => {}
  });

  const painel = document.getElementById('ajustes');
  ok('o painel existe no documento', Boolean(painel));
  ok('e nasce FECHADO, como o F2', !painel.classList.contains('visivel'));

  // A varredura é o que este arquivo põe por cima da lil-gui: ninguém escreve
  // duzentas linhas de `gui.add` pra manter de acordo com o config.
  eq('um controle por número, inclusive o aninhado', ajustes.controles.length, 4);
  eq('e o caminho aninhado não se perde',
    ajustes.controles[3].folha.nome, 'NINHO.FUNDO');

  // A faixa sai do PRÓPRIO valor: sem tabela de mínimo e máximo pros duzentos
  // números, e sem uma segunda fonte de verdade pra manter de acordo.
  eq('a faixa do arrasto começa em zero', faixa(1.6).min, 0);
  near('e vai a três vezes o valor', faixa(1.6).max, 4.8, 0.001);
  eq('inteiro grande anda de um em um', faixa(600).passo, 1);

  // Mexer no controle tem que mexer no OBJETO: se o painel guardasse cópia,
  // ele mostraria um número e o jogo usaria outro. `setValue` é a API de
  // verdade da lil-gui — testar pelo DOM testaria a lil-gui, não isto.
  ajustes.controles[0].controlador.setValue(2.4);
  near('o config mudou de verdade', CONFIG.EXPOSICAO, 2.4, 0.001);
  eq('e quem leu o número no boot foi avisado', aplicados.length, 1);
  eq('com o caminho inteiro do número', aplicados[0][0], 'TESTE.EXPOSICAO');

  suite('e sabe dizer só o que saiu do lugar');

  const mudou = ajustes.mudancas();
  eq('uma linha, não o config inteiro', mudou.length, 1);
  ok('nomeada pelo caminho', mudou[0].startsWith('TESTE.EXPOSICAO:'));
  ok('e dizendo de onde veio', mudou[0].includes('era 1.6'));
  note('a linha copiada', mudou[0]);

  ajustes.controles[3].controlador.setValue(5);
  eq('o número aninhado também é escrito', CONFIG.NINHO.FUNDO, 5);
  ok('e sai com o caminho aninhado inteiro',
    ajustes.mudancas().some((l) => l.startsWith('TESTE.NINHO.FUNDO:')));

  // Cor vira hexadecimal na linha copiada, não um decimal de oito dígitos que
  // ninguém consegue colar em `config.js`.
  ajustes.controles[2].controlador.setValue(0x112233);
  ok('e a cor sai em hexadecimal, colável',
    ajustes.mudancas().some((l) => l.includes('0x112233')));

  suite('o painel solta o mouse ao abrir e devolve ao fechar');

  painel.remove();
  const soltas = [];
  const outro = initAjustes({ VAZIO: {} }, {
    soltarMouse: (razao, solto) => soltas.push([razao, solto])
  });
  outro.alternar(true);
  ok('abriu', outro.aberto);
  eq('avisou quem manda no ponteiro', soltas.at(-1)[0], 'ajustes');
  eq('que o mouse é pra soltar', soltas.at(-1)[1], true);
  outro.alternar(false);
  eq('e ao fechar, que é pra devolver', soltas.at(-1)[1], false);

  // O painel é um nó solto no documento; deixá-lo aí faria a suíte seguinte
  // achar dois `#ajustes` e testar o errado.
  document.getElementById('ajustes')?.remove();

  suite('o tiro é sintetizado, não carregado de arquivo');

  /**
   * Um AudioContext de mentira: a suíte não tem alto-falante, e o que se
   * quer provar não é que tocou — é que a ONDA que sai é um estouro. Som
   * mudo, som estourado e som que não morre passariam por qualquer teste
   * que só perguntasse "gerou alguma coisa".
   */
  const ctxFalso = {
    sampleRate: 48000,
    createBuffer(canais, amostras) {
      const dado = new Float32Array(amostras);
      return { length: amostras, getChannelData: () => dado };
    }
  };

  const onda = sintetizar(ctxFalso, RECEITAS.mp40).getChannelData(0);
  eq('a duração vira amostras na taxa do contexto', onda.length,
    Math.floor(48000 * RECEITAS.mp40.duracao));

  const rms = (de, ate) => {
    let soma = 0;
    for (let i = de; i < ate; i++) soma += onda[i] * onda[i];
    return Math.sqrt(soma / (ate - de));
  };
  const inicio = rms(0, 240);                       // os primeiros 5 ms
  const fim = rms(onda.length - 240, onda.length);  // os últimos 5 ms

  ok('o som existe: o começo não é silêncio', inicio > 0.05);
  ok('e ele MORRE: o fim é uma fração do começo', fim < inicio * 0.2);
  note('rms começo · fim', `${inicio.toFixed(3)} · ${fim.toFixed(4)}`);

  // `tanh` é o que segura o pico: sem ele a soma das três camadas estoura o
  // ±1 e o que se ouve é clipe digital, não tiro.
  let pico = 0;
  for (const v of onda) pico = Math.max(pico, Math.abs(v));
  ok('e nenhuma amostra estoura o ±1', pico <= 1);
  ok('mas ele chega perto: tiro é alto', pico > 0.5);
  note('pico', pico.toFixed(3));

  // Duas receitas diferentes têm que soar diferente, senão a MP40 e a Colt
  // são o mesmo arquivo com dois nomes.
  const colt = sintetizar(ctxFalso, RECEITAS.colt).getChannelData(0);
  ok('a Colt dura mais que a MP40', colt.length > onda.length);
  ok('e o baque na terra é o mais curto de todos',
    sintetizar(ctxFalso, RECEITAS.terra).getChannelData(0).length < onda.length);
}
