# game.bf

FPS de classes ambientado em 1945, frente ocidental. Three.js puro, sem build
e sem dependência de npm — abre no navegador e roda.

## Rodar e verificar

```bash
tools/dev.sh serve            # sobe o servidor estático (idempotente)
tools/dev.sh syntax           # parseia todo módulo como ES module
tools/dev.sh check            # sintaxe + suíte; sai != 0 se algo falhar
tools/dev.sh errors index.html            # erro de console na página
tools/dev.sh shot index.html /tmp/a.png   # captura headless
```

`tools/dev.sh check` é o portão: sintaxe, suíte, e o console do jogo já
desembarcado (`index.html?deploy=0`). Rode antes e depois de qualquer mudança.

**Meça antes de deduzir.** Três diagnósticos errados nesta base saíram de
raciocinar sobre o código em vez de instrumentar. Os testes rodam em Chrome
headless em poucos segundos; um `note()` novo custa menos que um palpite.

`tools/model-viewer.html` renderiza a faca em quatro vistas com contagem de
triângulos — abrir no navegador ou capturar com `dev.sh shot`.

## Estrutura

```
src/
  main.js            fiação e loop de render
  config.js          números de ajuste (o padrão que as classes sobrescrevem)
  game/    teams.js  os dois lados e a regra de quem domina o quê
           capture.js  arriar e içar bandeira, sem three
  core/    input.js  teclado bruto · stage.js  renderer, cena, luz
  player/  player.js estado + ordem dos sistemas
           locomotion.js  stance.js  swim.js  spectator.js
           collision.js  view.js  heading.js
  world/   heightfield.js  altura da ilha (matemática pura, sem three)
           deform.js  camada escavável, delta por vértice da malha
           settling.js  o que perde o chão desaba e tomba
           minimap.js  a ilha vista de cima, do mesmo campo de altura
           dummy.js  boneco de treino (alvo de dano)
           terrain.js  malha · water.js  mar · forest.js  árvores e pedras
           base.js  base militar · course.js  campo de treino
           outpost.js  posto de 4 mastros · outposts.js  onde ficam os 12
           props.js  helpers · world.js  monta tudo
  items/   classes.js  models.js  viewmodel.js  drop.js
           knife.js  pistol.js  mp40.js  shovel.js   modelos
           attack.js  firearm.js  ballistics.js  digging.js
           muzzle.js  de onde a bala sai e pra onde ela vai
           poses.js  como cada item é segurado
  ui/      flow.js  máquina de estados e telas
           watchdog.js  vigia de invariantes em jogo
           classcards.js  tacticalmap.js  session.js
           compass.js  objective.js  status.js  prompt.js  hitmarker.js  debug.js
tests/     run.html + suites/
           (aim, compass, movement, jump, stance, terrain, swim, model,
            drop, melee, firearm, ballistics, muzzle, slope, combate,
            flow)
tools/     dev.sh  serve.py (sem cache)  soak.html  model-viewer.html
vendor/    three.js 0.169 local — não vem de CDN
           icons/  game-icons.net, CC BY 3.0 (crédito no README)
```

Nenhum arquivo passa de ~180 linhas. Se um crescer muito, separe por assunto
como já foi feito com `player/` e `ui/`.

## Invariantes

Coisas que já quebraram e não são óbvias lendo o código:

**`camera.rotation.y` não é o yaw.** PointerLockControls compõe a rotação em
YXZ direto no quaternion; `camera.rotation` decodifica em XYZ. Olhando pra
trás, `rotation.y` lê 0° em vez de 180°. A direção do movimento sai de
`player/heading.js`, que usa o eixo X local da câmera — sempre horizontal num
rig yaw+pitch, e nunca degenera. Nunca leia `rotation.y` como yaw.

**A física manda em `eyeY`, não em `camera.position.y`.** `player.eyeY` é a
posição lógica dos olhos; `camera.position.y` só é escrito no fim do frame,
em `view.js`, somando degrau, aterrissagem e balanço. Ler `position.y` como
verdade da física dá resultado errado durante qualquer um desses efeitos.

**No chão, mudar de postura move `eyeY` junto.** Encolher o corpo sem ajustar
`eyeY` faz o jogador "flutuar": `onGround` vira false só de agachar, e com
isso somem o coyote time, o controle de chão e a chance de pular na transição.
`stance.js` cuida disso. No ar é o contrário — `eyeY` fica parado e os pés é
que sobem, e é isso que faz o crouch-jump alcançar plataforma.

**Integração vertical é trapezoidal.** Aplicar a gravidade e mover com o
resultado come `v0·dt/2` por frame, e a altura do pulo passa a depender do
framerate (1,20 m a 30 fps contra 1,31 a 144). `locomotion.js` move pela média
entre a velocidade antes e depois. Há teste pra isso em três framerates.

**`endFrame()` roda todo frame do loop**, inclusive com o jogo pausado. Sem
isso `consumePress` fica com tecla pendurada e dispara no frame errado.

**`RADIUS` e `STEP_HEIGHT` são globais.** Vivem em `collision.js` e valem pro
mundo inteiro. Classe nenhuma deve sobrescrever — só velocidade, pulo, alturas
de postura e vida entram em `movement`.

**O corte de pulo variável não roda no frame do salto.** Num toque rápido o
`keyup` cai entre dois frames; sem essa guarda, o corte comia o pulo inteiro
antes de ele começar. E tem piso (`JUMP_MIN_SPEED`) pra toque curto continuar
sendo pulo.

**O viewmodel tem cena e câmera próprias.** `items/viewmodel.js` desenha por
cima do mundo com o depth limpo. É o que impede o item de atravessar parede e
o que desacopla o tamanho dele na tela do FOV do jogo — com os 70° do mundo,
a faca ocupava 74% da altura da tela.

**O terreno é um campo de altura, não um plano.** `world/heightfield.js` é a
fonte de verdade — a malha em `terrain.js` só desenha o que ele diz, e a
colisão amostra a mesma função. É matemática pura, sem three, justamente pra
poder ser inspecionada fora do navegador.

**Zonas planas não podem se cruzar.** Base e campo de treino achatam o terreno
em volta. Aplicá-las em sequência fazia cada uma puxar o resultado da anterior,
e a base assentava numa altura que não era a dela — o jogador nascia enterrado.
Hoje vence a de maior influência, e `assertFlatZones` estoura na montagem do
mapa se duas se encostarem.

**Nadar é modo de locomoção inteiro**, não redutor de velocidade: sem
gravidade, sem pulo, direção pelo olhar, empuxo puxando pra superfície. Quem
decide é a profundidade do fundo (`SWIM_DEPTH`), não a altura do jogador —
assim entrar e sair da água acontece sozinho.

**Descer ladeira não é cair.** O piso baixa mais rápido do que a gravidade
puxa nos primeiros quadros: sem colar o jogador no chão, descer uma rampa de
40° passava 214 de 220 quadros no ar, com os olhos até 1 m acima do chão,
saltando e aterrissando sem parar — era esse o tremor de ladeira. O limite pra
colar sai da velocidade do quadro (`SNAP_SLOPE`), então beirada de verdade
continua sendo queda: ela baixa mais do que a velocidade explica.

**Degrau é topo de colisor; ladeira é terreno.** A vista só suaviza degrau, e
quem decide é a FONTE do piso (`groundHeightAt` devolve isso), não a altura da
subida. Pela altura o resultado dependia do framerate: a 30 fps uma rampa de
40° sobe 23 cm por quadro, o limiar fixo de 12 cm achava degrau onde não tinha,
e a câmera passava 100 quadros seguidos atrasada.

**O atraso do degrau só vale pra degrau.** Com terreno inclinado o jogador sobe
alguns centímetros todo frame; o limiar antigo de 1 cm deixava a câmera
permanentemente atrasada em qualquer ladeira. Hoje é `STEP_VIEW_MIN`.

**O HUD não inventa número.** Munição e objetivo não existem como sistema, e
por isso não aparecem: o canto do item mostra o rótulo do slot quando o item
não tem munição. Se aparecer contador, é porque o dado existe.

**Apanhar do chão olha o SLOT, não a mão.** Largar a pistola e continuar com
a faca na mão trancava a pistola no chão pra sempre, e largando tudo só o
primeiro item voltava. O item volta pro lugar dele; slot ocupado recusa em vez
de empurrar o que estava lá.

**Alcance pra apanhar é no plano, com folga de um corpo na vertical.** Medindo
em 3D a partir dos olhos, 1,7 m dos 2,4 iam embora só porque o item está no
chão: item largado andando assentava já fora do alcance, e parecia que o jogo
tinha comido ele.

**Item na mão e item no chão saem da mesma fábrica.** `items/models.js` mapeia
o dado do item pro modelo 3D. Largar tem que produzir exatamente o que estava
sendo empunhado, e item sem modelo simplesmente não aparece — nada de caixa
genérica de reserva.

**`player.equipped` pode ser `null`.** Mão vazia é estado de jogo válido, e é
diferente do viewmodel escondido (que é enquanto um menu está aberto). Cuidado
com sentinela: usar `null` como "ainda não desenhei" colide com "mão vazia", e
isso já fez o HUD ficar em branco.

**Objeto caindo testa o trecho percorrido, não só onde parou.** Entre dois
frames um item rápido passa inteiro por dentro de uma caixa; `restHeightAt`
recebe o topo do trecho justamente por isso.

**Nada de medir layout uma vez só.** Quem depende de `clientWidth` tem que
remedir quando o tamanho mudar, inclusive de zero pra alguma coisa: a bússola
media na inicialização, quando o HUD ainda estava oculto, e ficava 0x0 pra
sempre — existia e nunca desenhava.

**O golpe é uma linha do tempo, não um evento.** O clique começa a animação e
o dano só é resolvido no quadro que cruza `MELEE.DAMAGE_AT` — é o que faz o
acerto coincidir com a lâmina passando na tela.

**Mira de corpo a corpo é horizontal, com folga na vertical.** Testar o ângulo
em 3D até o centro do alvo parece certo e não é: colado no boneco, o centro
dele fica meio metro abaixo da linha dos olhos, o ângulo estoura e a facada à
queima-roupa erra.

**Alvo não pode bloquear a mira até si mesmo.** O teste de linha de visão do
golpe ignora o colisor do próprio alvo, senão nada nunca é acertado.

**Ação de clique também tem buffer**, como o pulo: sem ele, clicar no fim do
respiro consumia o clique e não saía golpe nenhum.

**Arma de fogo nasce com o cano no -Z.** É o que faz mirar pelo ferro virar
translação pura, sem rotação pra "acertar" o alinhamento — girar a arma pra
encaixar a mira é o que deixa mira de ferro torta. `SIGHT_HEIGHT` é exportado
pelo modelo justamente pra que o viewmodel não adivinhe a altura da linha.

**Automática é da ficha da arma, não do sistema.** `firearm.auto` decide
entre segurar o gatilho e um tiro por clique. O clique é consumido nos dois
casos — sobrando no buffer ele dispararia sozinho num quadro seguinte — e na
automática ele ainda vale, pra que um toque rápido no fim do respiro não se
perca.

**`ammo` é objeto de módulo, compartilhado entre as suítes.** Uma rajada de
teste esvaziou o carregador da MP40 e quebrou três suítes seguintes, que nem
falavam de munição. Quem gasta munição num teste devolve como encontrou — e o
mesmo vale pro boneco de treino, que uma rajada derruba.

**`setClass` põe a PRIMÁRIA na mão.** Enquanto a primária não existia, ela
punha a pistola, e vários testes passaram a depender disso sem dizer. Teste
que fala de uma arma específica escolhe o slot dela.

**A distância da arma na mira não é escolha estética.** Perto demais, o
ferrolho fica mais largo na tela que o alvo e tapa exatamente o que se quer
acertar. A 0,5 m ele ocupa ~6% da largura, contra ~5,4% de um boneco a 9 m.

**Alvo não pode barrar a própria bala.** Igual ao corpo a corpo: o hitscan
acha o alvo primeiro e só então pergunta se há parede mais perto, ignorando o
colisor dele. Antes disso o acerto dependia de a abertura do tiro escapar pela
lateral da caixa — era sorte, e o teste falhava de forma intermitente.

**Arma comprida não usa os ângulos de arma curta.** Num cano de 61 cm o
ângulo é alavanca: os 0,45 rad de caimento da pose de corrida da pistola
baixam a boca dela 7 cm e baixariam a da MP40 18, jogando a ponta pra fora da
tela. A câmera do viewmodel tem 42°, ou seja ±11 cm de altura a 30 cm do olho
— pouca margem. Projetar a boca com `Vector3.project` diz na hora se a pose
cabe; adivinhar custou três tentativas.

**Modelo de arma comprida tem a origem no punho.** Montada em volta do meio
da caixa da culatra, a pose posicionava o MEIO da arma: a culatra caía atrás
do olho e o que aparecia era um cano solto, sem nada atrás. Com a origem na
mão, o número da pose quer dizer "onde está a mão", que é o que dá pra ajustar
olhando.

**Pose de mão é do item, não do viewmodel.** A faca é modelada com a lâmina
no +X e precisa de um giro de 90°; a pistola nasce com o cano no -Z e o mesmo
giro a deixava de lado. `items/poses.js` guarda isso por item.

**A bala é entidade, não hitscan.** Sai a 253 m/s e cai por gravidade, e o
acerto é testado sobre o TRECHO percorrido no quadro — a 60 fps ela anda 4,2 m
por quadro, então testar só onde parou a faria atravessar qualquer parede.

**Alvo não pode barrar o que deveria atingi-lo.** Já aconteceu três vezes: no
corpo a corpo, no hitscan e na balística. Quem testa parede tem que ignorar o
colisor do alvo, senão a caixa dele vira muro alguns centímetros antes do
centro e o tiro "acerta" sem causar dano.

**A bala sai do cano e segue o cano.** Origem e direção do tiro vêm do
marcador `boca` do modelo (`items/muzzle.js`), não da câmera: o traçante sai
da arma, o tiro encostado numa quina bate na quina, e com a arma fora de
posição a bala vai torta de verdade. `MUZZLE_BEND` amortece o desvio.

**O desvio do cano é medido contra a arma ZERADA, não contra a câmera.** A
pose de descanso tem 6° de caimento só por estética; medindo contra a câmera
isso viraria erro fixo de 60 cm pra esquerda a 14 m em todo tiro do quadril —
lê como bug, não como recuo. O zero é `rest` misturado com `ads` pelo nível de
mira, então tanto do quadril quanto no ferro a arma parada atira reto, e o que
torce é corrida, coice e atraso da mão.

**O desvio é assimétrico: livre pro lado, com teto pra cima e pra baixo.**
Correndo, a arma baixada e de lado manda a bala 34° pra esquerda — isso é o
que se quer ver. Os 21° de caimento da mesma pose não: cravavam o tiro no
chão a dois metros, e o jogador lê isso como bug, não como arma fora de
posição. `MUZZLE_RISE` é o teto vertical, e cortá-lo reescala o rumo
horizontal pra que ele não mude junto.

**Amortecer desvio é interpolar rotação, não escalar ângulo.** A pose de
corrida joga a arma uns 48° pro lado; multiplicar o ângulo por um fator dá
eixo errado assim que o desvio deixa de ser pequeno. É slerp da identidade até
o desvio.

**A cena do viewmodel É o espaço da câmera.** A câmera dele nunca sai da
origem nem gira, só troca de aspecto — é isso que deixa levar a boca do cano
pro mundo com a matriz da câmera do jogo e mais nada.

**A boca do cano fica meio metro à frente do olho.** Encostado numa parede ela
está do outro lado dela, e nascer ali é atirar através da parede:
`ballistics.blocked` testa o trecho olho→boca e o tiro volta pro olho.

**Ícone de HUD vem de biblioteca**, não desenhado à mão: `vendor/icons/`.
São do game-icons.net sob CC BY 3.0 — trocar um ícone exige atualizar o
crédito no README.

**O fluxo do jogo vive num lugar só.** `ui/flow.js` tem as três fases
(início, deploy, jogando) e é o único que trava e destrava o mouse. Espalhar
lock/unlock pelas telas foi o que tornou o fluxo antigo difícil de mexer.

**A abertura não constrói o mundo.** Ilha, floresta e bases custam caro, e
ninguém paga isso pra ver uma tela de título: `main.js` só tem cena e entrada
até o clique em Jogar, e `boot()` monta mundo, jogador e sistemas uma vez —
é ele que liga o laço de render. Nada em `flow.js` pode tocar `game` antes.

**Entrar no jogo é sempre pelo mesmo caminho**: Jogar leva ao deploy, escolhe
equipamento e local, e daí pro mapa. Morrer devolve pro deploy, nunca pro
início. Fantasma sobre o mapa só quando o jogador não está lá — antes do
primeiro desembarque e depois de morrer; quem abre o deploy vivo continua
parado onde estava, e é isso que deixa o botão Voltar não renascer ninguém.

**Slot de mão é posição fixa, não lista.** `carried` tem sempre três entradas
— primária, secundária, faca — e `null` onde a classe não leva nada
construído. Com lista compactada, largar a pistola fazia a faca virar o 1, e a
mão do jogador já tinha decorado onde ela estava. Tecla em slot vazio não faz
nada, e apanhar item de slot ocupado é recusado em vez de empurrar o que
estava lá.

**O HUD não anuncia arma que o jogo não tem.** O cinto desenha uma linha por
slot COM item, então a Thompson da Assault não aparece — nem no HUD nem na
tira da tela de deploy. Prometer na tela de deploy e entregar outra coisa no
mapa é pior que não prometer.

**Regra de partida não conhece three.** `game/teams.js` e `game/capture.js`
são só dado e conta: dá pra jogar o modo inteiro num teste, com postos de
mentira, sem montar ilha nenhuma. Quem desenha bandeira é `world/outpost.js`,
e ele lê o estado — nunca o contrário.

**Uma bandeira arriada já tira o posto de quem era.** Dono é quem tem AS
QUATRO; com três, o posto não é de ninguém. É o que faz a primeira captura
valer alguma coisa em vez de só a última, e é o que cumpre "posto sendo
dominado, o time perde o spawn".

**Posto não achata o terreno.** Zona plana não pode cruzar com outra, e doze
postos mais duas bases mais o campo de treino não cabem sem se encostar. Cada
mastro e cada parede lê a altura do chão onde cai, e o quadrado sai torto de
propósito.

**Posição de posto sai de sondar o campo de altura DE VERDADE.** Sondei com
`naturalHeight` e a montagem estourou: o mesmo par de postos dava 3,3 m no sul
e 2,35 no norte, ou seja praia. A ilha não é simétrica porque o ruído do
relevo não é — e `heightAt` com as zonas planas aplicadas é a única fonte que
vale.

**Bandeira tem tecla própria (F), não o E de apanhar.** Item largado ao pé de
um mastro faria as duas ações disputarem a mesma tecla, e a que perdesse
pareceria quebrada.

**Capturar é trabalho, não presença.** Sem a tecla segurada o tempo não corre.
Mas o progresso NÃO some ao sair de perto: meia bandeira arriada continua meia
arriada, e é isso que deixa um posto ficar "sendo dominado" enquanto a briga
acontece em outro canto.

**O mapa tático sai do terreno**, não é uma imagem à parte: `world/minimap.js`
amostra o mesmo campo de altura. Mexer no relevo muda o mapa junto.

**O que a tela precisa oferecer por código, ofereça.** `flow.selectZone` existe
porque escolher zona só pelo clique no canvas tornava o fluxo inteiro
impossível de testar — canvas em headless não tem tamanho.

**Geometria não pode prender o jogador.** Duas regras, independentes:

- `stance.js` encolhe quem não cabe, não só impede de crescer. De pé sob um
  teto de 70 cm o corpo cruza a laje inteira e toda direção passa a colidir,
  inclusive a da saída — o jogador ficava preso até descobrir sozinho que
  deitar resolvia.
- `locomotion.js` não bloqueia movimento de quem **já** colide onde está.
  Bloquear ali não protege nada: só prende. Vale enquanto ele não sair.

**O movimento vertical checa teto, não só piso.** Sem isso o pulo atravessava
qualquer laje: subir por baixo levava a cabeça pra dentro dela e, ao cair, o
jogador pousava em cima. `ceilingAbove` testa o TRECHO que a cabeça percorreu
no quadro, não onde ela parou — pulando ela sobe vários centímetros por
quadro, e uma laje fina passaria entre dois testes.

**Testar estado não é testar jogo.** Três sessões seguidas eu confirmei que
posições escolhidas a dedo funcionavam, enquanto o bug continuava. O que achou
foi `tools/dev.sh soak`, que joga sozinho vigiando invariantes, e o
`ui/watchdog.js`, que faz o mesmo enquanto uma pessoa joga e imprime o caso
pronto pra copiar.

**Quem cava mais é uma escala, não quatro números soltos.** `TERRAIN_BITE`
em `items/classes.js` guarda pá > primária > secundária > faca (zero) num
lugar só, e cada arma aponta pra ele. Espalhado por quatro arquivos, a ordem
seria fácil de quebrar sem ninguém perceber — e a ordem é a regra; os valores
são só o jeito de escrevê-la.

**Cor de terra revolvida é camada própria, não é a profundidade.** Derivar
uma da outra ligava duas coisas que não andam juntas: uma bala afunda 2,6 cm,
`turnedSoil` pintava 5% de terra, e o jogador atirava no chão e jurava que
nada tinha acontecido — o tiro cavava de verdade e ninguém enxergava. Mover
pouca terra e revolver toda ela são coisas diferentes.

**E a marca não afina pra beirada.** A primeira correção elevava o peso ao
cubo pra concentrar a terra no impacto; com 2,55 m entre vértices, o tiro cai
longe de todos eles, cada um pega peso baixo e a marca inteira diluía pra 49%
— invisível de novo. Abaixo da célula da malha não existe formato pra
modelar: ou a célula está revolvida ou não está.

**A marca não pode ser menor que a célula da malha.** Com 2,55 m por vértice,
uma craterinha de bala do tamanho real cai ENTRE dois vértices e não registra
nada: dois tiros iguais fariam coisas diferentes conforme onde caíssem na
grade. `DEFORM.RAIO_MIN` é o piso, e por isso a marca de bala é mais larga do
que deveria — é o preço deste terreno, e é o preço certo.

**Quem dispara tem que repassar a mordida.** `firearm.js` monta a bala e
precisa pôr `dig` nela. Já ficou de fora uma vez: a balística marcava o
terreno, as 428 asserções passavam, e atirar no jogo não fazia nada — todo
teste disparava a bala direto, informando o valor na mão em vez de passar pela
arma. Teste de tiro que não começa no clique não prova nada.

**A balística não conhece o mundo.** Ela diz onde a bala bateu e com que
força (`onTerrainImpact`); quem afunda o terreno é `main.js`. Sem isso a bala
precisaria saber o que é escavável, e a suíte precisaria de um mundo inteiro
pra testar um tiro no chão.

**Escavar não cria geometria.** `world/deform.js` é um delta por vértice da
malha que já existe; cavar move vértices, não adiciona nenhum. Medido: 300
pazadas mudam a contagem de triângulos em zero.

**Terreno flatShading ignora o atributo de normal.** O shader deriva a normal
por face a partir da posição. Chamar `computeVertexNormals()` numa pazada
varria 32 mil vértices por nada: 11,7 ms contra 0,006 ms sem ele. Mesma coisa
pra `computeBoundingSphere()`.

**Pazada tem duração.** O clique começa a ação e o terreno só muda no quadro
que cruza `digAt` — é o que impede cavar de virar clique repetido e faz o
buraco aparecer junto com a lâmina.

**Nada flutua depois de cavado.** `world/settling.js` guarda a altura em que
cada prop assentou; se o terreno sob ele descer, ele desaba e tomba pro lado
que perdeu apoio. O colisor desce junto — sem isso o objeto cairia só de
mentira e o jogador seguiria esbarrando no ar onde ele estava.

**O colisor do corpo tombado sai da matriz, não de fórmula.** São os oito
cantos da caixa de pé passados pela MESMA matriz que move a malha. Duas
tentativas de conta fechada falharam antes disso: mexer só no Y deixava a
hitbox em pé onde a parede estava, e a versão seguinte — pegada esticada pelo
alcance do topo, altura por `altura·cos + raio·sen` — acertava em poste e
errava em laje larga e baixa, deixando o colisor 91 cm acima do bloco caído,
com o jogador de pé no ar em cima de obstáculo derrubado. Aproximar o que dá
pra calcular exato só cria um segundo modelo pra manter de acordo com o
primeiro.

**E teste de colisor se compara com a MALHA.** Comparar a caixa com a altura
esperada do chão testa a fórmula que produziu a caixa: foi assim que os 91 cm
passaram batido por uma suíte verde. `Box3.setFromObject` é a única fonte que
não pode concordar por engano.

**E o lado da queda sai da rotação, não de dedução.** Errei o sinal duas
vezes seguidas: primeiro a caixa esticou pro lado contrário ao do corpo,
depois descobri que o corpo mesmo tombava pra longe do buraco — cavar de um
lado da parede jogava ela pro outro, e lia como empurrão. Quem gira em volta
de um eixo anda pra `eixo × cima`; medir isso é uma linha, deduzir errou duas.

**A queda mira o centro do prop, não o ponto mais fundo em volta.** Usando o
mais fundo, um prop assentava dentro do buraco cavado ao lado e ficava meio
metro enterrado. O centro decide o quanto desce; o desnível em volta decide o
quanto tomba.

**Só o que a pazada tocou é reavaliado.** Varrer 834 props a cada cavada seria
absurdo. Medido: 0,15 ms por pazada com reavaliação, e 0,0006 ms por quadro
com nada caindo.

**Teste tem que exercitar o código, não repetir a conta.** `aim.js` já passou
por engano enquanto o jogo usava a fórmula errada, porque duplicava a lógica.
Por isso `heading.js` existe como módulo.

## Armadilhas do ferramental

**`node --check` num `.js` não valida ES module.** Ele parseia como script e
já deixou passar erro de sintaxe que só aparecia no navegador. `dev.sh syntax`
copia cada arquivo pra `.mjs` antes de checar, que força o parse certo.

**O servidor confere de quem é a porta.** `dev.sh` escreve `.serverroot` e só
reaproveita a porta se o conteúdo bater com este projeto — um `http.server`
esquecido de outra pasta já foi reaproveitado em silêncio, e a suíte rodou em
cima de código alheio. Se a porta estiver ocupada, ele anda pra próxima.

**Screenshot precisa de loop de render.** `preserveDrawingBuffer` é false, então
um `renderer.render()` solto some da captura. As páginas de captura usam
`setAnimationLoop`.

**Sistema no laço sem dono só aparece depois do desembarque.** Um
`digging.update(delta)` ficou no `frame()` sem que `digging` existisse: a
abertura abria limpa, a suíte inteira passava, e o quadro estourava a cada
frame depois de clicar em Desembarcar — o jogo congelava como fantasma, sem
render e sem `endFrame()`, então nem andar nem trocar de arma respondia. Por
isso `index.html?deploy=N` entra no mapa por código e entrou no `check`.

**O item na mão nasce na pose de guarda.** `viewmodel.update` só roda com o
mouse travado; entre desembarcar e o pointer lock ser concedido o modelo
ficava na origem da câmera do viewmodel, ou seja do tamanho da tela — um
borrão preto por cima do mapa. `setItem` aplica `rest` na hora.

**`controls.lock()` do three joga fora a promessa.** Pointer lock recusado
(sem gesto do usuário, ou logo depois de um unlock) virava rejeição não
tratada no console, e isso poluía justamente a verificação que olha o console.
`flow.js` pede `requestPointerLock()` direto no elemento pra poder tratar.

**Página de verificação tem que inicializar como o jogo inicializa.**
`tools/screens-shot.html` espelha o `main.js`, inclusive o `boot()` no clique
em Jogar (`?tela=inicio|deploy|jogo`, `?zona=`, `?slot=`).
 O HUD
nasce com `display:none` esperando o deploy; capturas que ligavam `.playing`
antes de criar os painéis testavam um caminho que o jogo não faz, e deixaram
passar uma bússola de 0x0. Espelhe a ordem do `main.js`, incluindo o deploy.

**E atualize os painéis todo frame, como o `main.js` faz.** Desenhar uma vez e
deixar o loop só renderizando faz um resize tardio limpar o canvas sem
redesenhar — sintoma que parece bug do jogo e não é.

**Mas a simulação não pode viver dentro do loop.** Sob `--virtual-time-budget`
o requestAnimationFrame quase não roda: contar frames lá dentro não funciona em
headless. Simule num `for` síncrono e deixe o loop só desenhando.

## Convenções

- Código e comentário em pt-br. Comentário explica **por quê**, não o quê.
- Sistemas do jogador são funções que recebem a instância (`updateStance(player, delta)`),
  não métodos privados: o estado é público de propósito.
- `config.js` guarda número de ajuste; a classe sobrescreve o que declarar em
  `movement`, e herda o resto.
- Nada de CDN. `vendor/` é local pra o ciclo de teste ser rápido e offline.

## Estado atual

Funciona: movimento (andar, correr como alternância no Shift, agachar em C,
deitar em Z, pulo com coyote time e buffer), natação, mapa de ilha com praia,
floresta e duas bases militares opostas, campo de treino, seleção de classe,
faca KA-BAR como modelo e viewmodel, e o HUD (bússola, situação, vitais, item).

Largar com G e apanhar com E funcionam, com item na mão ou sem: quem decide é
o slot do item estar livre.

Fluxo: abertura com a marca BF45 e o botão Jogar, sem mundo montado. Jogar cai
na tela de deploy — barra de equipamento em cima (classes e os itens que
existem, numerados pela tecla), mapa tático da ilha embaixo com seis pontos de
desembarque. Enquanto escolhe, o jogador é fantasma que voa, não colide e não
é atingido. ESC no jogo abre a pausa, e dela dá pra rever o equipamento e
voltar sem renascer. Morrer volta pro deploy. `K` mata o jogador, tecla de
teste enquanto nada causa dano de verdade.

Golpe de faca (botão esquerdo), com dano, marca de acerto e três bonecos de
treino no estande. MP40 no slot 1 da Assault: automática de verdade (500 tiros por minuto,
segurar o gatilho despeja rajada), 32 no carregador e 96 de reserva, mira de
ferro e recarga. É a primeira arma do jogo que dispara segurando — as outras
continuam sendo um tiro por clique.

Colt M1911A1 exclusiva da Assault: tiro semiautomático,
8 tiros (7 + 1 na câmara), recarga no R com animação, mira de ferro no botão
direito. Cinto em quatro teclas — 1 MP40, 2 Colt, 3 faca, 4 pá. A bala viaja e cai; um traçante a cada
quatro tiros. Ela sai da boca do cano e segue o cano: andando a arma fica reta
e atira reto, correndo com ela baixada o tiro sai 34° pra esquerda, e atirar
cancela a pose de corrida.

Pá M1943 no slot 4 cava e aterra o terreno de verdade; a colisão lê a mesma
camada, então trincheira cavada é trincheira que se anda dentro. Cavar embaixo
de árvore, pedra ou construção derruba o que ficou sem chão.

Tiro no chão também marca o terreno, na escala `TERRAIN_BITE`: a pá cava 90 cm
por pazada, um tiro de primária afunda 8,5 cm, um de secundária 4,5 cm, e a
faca não mexe em nada.

Modo de jogo: dois países inventados, Pacto de Karnia (norte, vermelho) e
Aliança de Vestria (sul, azul) — ficção de propósito, pra que nenhum exército
real leve a culpa. Cada um tem uma base principal e seis postos, doze no
total. Posto tem quatro mastros; trocar cada bandeira leva 30 s segurando F,
ou seja dois minutos de posto com um soldado só. Posto é o spawn do time, e
uma bandeira mexida já basta pra tirar o spawn de quem era. Vence quem dominar
os doze.

Ainda não existe: adversário. Não há soldado de Karnia no mapa, então ela
nunca retoma nada — o modo está inteiro do lado do jogador e a metade que
reage falta. Também não existe dano ao jogador que não seja a tecla de teste,
nem captura de base (as bases são sempre do dono). Só a Assault é jogável; as
outras três estão no catálogo, bloqueadas.
