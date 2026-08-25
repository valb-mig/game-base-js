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
           hitboxes.js  regiões do corpo e o que cada acerto vale
           capture.js  arriar e içar bandeira, sem three
  bots/    aiming.js  atraso e erro de mira, sem three
           soldier.js  corpo, colisor, vida e o andar
           brain.js  o que ele decide fazer · bots.js  gerente e fiação
  core/    input.js  teclado bruto · stage.js  renderer, cena, luz
  player/  player.js estado + ordem dos sistemas
           stamina.js  fôlego de correr e pular, pesado pela arma
           locomotion.js  stance.js  swim.js  spectator.js
           collision.js  view.js  heading.js
  world/   heightfield.js  altura da ilha (matemática pura, sem three)
           deform.js  camada escavável, delta por vértice da malha
           settling.js  o que perde o chão desaba e tomba
           minimap.js  a ilha vista de cima, do mesmo campo de altura
           dummy.js  boneco de treino (alvo de dano)
           terrain.js  malha · water.js  mar · forest.js  árvores e pedras
           base.js  base militar · course.js  obstáculos
           training-world.js  o campo de treinamento, mapa à parte
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
           compass.js  objective.js  status.js  prompt.js  hitmarker.js
           crosshair.js  a mira abre com a dispersão
           killfeed.js  quem matou quem, e como
           debug.js  painel e o interruptor do F2
           debugview.js  caixas de colisão e estado dos bots na cena
           snapshot.js  P grava a tela com o estado escrito nela
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

**Peso de arma amarra três coisas.** `PESOS` em `items/classes.js` decide
quanto tempo custa guardar e sacar, quanto de fôlego a corrida come e quanto o
pulo cobra. É o que faz trocar pra faca antes de atravessar campo aberto ser
uma decisão: medido, a corrida rende 10,4 s com a faca e 5,3 s com a MP40.

**Trocar de item NÃO é instantâneo, e `selectSlot` só AGENDA.** O item muda de
mão no fundo do movimento, no meio da troca — quem lê `equipped` no mesmo
quadro do `selectSlot` lê o item ANTIGO. Foi isso que quebrou vinte asserções
quando a troca virou animação. `forceSlot` existe pro que é instantâneo de
verdade: nascer e apanhar do chão.

**Fôlego zerado não trava ninguém.** Tira a corrida e o pulo, e devolve os
dois assim que respirar. Jogador parado sem poder fazer nada é punição, não
mecânica. E quem já está correndo continua até raspar: cair pra andando por
causa de um limiar no meio da fuga é pior que ficar sem.

**Recuperar custa parar de verdade.** Sem o respiro de `ESPERA`, largar o
Shift por um instante devolveria fôlego, e a corrida viraria dedilhado.

**Bot troca de arma no mesmo tempo que o jogador.** Instantâneo pra ele
enquanto o jogador leva 0,78 s é vantagem escondida — o mesmo tipo de coisa
que a mira com atraso existe pra evitar.

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

**O terreno É a regra do mapa.** Em Sainte-Mère, de norte pra sul: mar, praia
de desembarque, a escarpa que domina essa praia, o planalto da vila e da
fazenda, e o rio cortando na diagonal com duas pontes. Cada trecho existe pra
que um ponto seja difícil de um jeito diferente — a praia é aberta, a colina é
alta, o rio é gargalo. Não há número de dificuldade em lugar nenhum.

**Duas fontes de verdade sobre o rio se separam no primeiro ajuste.** Só o X
das pontes fica na tabela; o Z sai de `riverBedAt`. O ponto 05 e a ponte leem
a mesma função, e mexer no leito move os dois juntos.

**A resolução da malha não é escolha estética.** 2 km com 800 segmentos dá
2,5 m por vértice, e abaixo de ~2,6 m a pazada cai entre dois vértices e cavar
deixa de registrar. Medido: montar essa malha custa 0,64 s uma vez e desenhar
custa 0,06 ms por quadro — o gargalo é o boot, não o render.

**Apagar um bloco de constantes leva junto o que você não viu.** Reescrevendo
`WORLD` pro mapa novo sumiram catorze chaves ainda em uso — `COURSE_LENGTH`
virou `NaN` e o campo de treino inteiro nasceu em coordenada inválida, sem
erro nenhum no console. Depois de mexer em `config.js`, vale conferir quais
`WORLD.X` o código usa e a tabela não tem.

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

**Falso incompleto quebra onde ninguém procura.** O terreno de mentira da
suíte de fluxo não tinha `declividadeAt` depois que o chão passou a ser
classificado por inclinação: o mapa tático estourava na montagem, a tela
ficava na abertura, e sete asserções caíam a três camadas de distância da
causa. Dublê tem que ter o contrato inteiro.

**Levar tiro tem que ser visto antes de matar.** Medido: a 16 m, o primeiro
tiro dói em 1,6 s e a morte vem em 2,9 s — sobra pouco mais de um segundo, e
a barra de vida no canto não ganha esse olhar no meio de um tiroteio. A
vinheta vermelha fica nas BORDAS de propósito: no centro taparia justamente o
que ele precisa ver pra revidar.

**F2 é um interruptor só, e `ui/debug.js` é o dono dele.** O painel de estado,
as caixas de colisão e o rótulo sobre a cabeça dos bots leem `debug.on`: uma
tecla acende tudo e nada sai de sincronia. O painel nasce DESLIGADO — aceso
por padrão ele vira parte do HUD sem ninguém decidir isso.

**A trajetória prevista sai da BOCA DO CANO, não do olho.** É a arma que
atira, e com ela fora de posição o arco tem que sair torto na depuração
também — senão a previsão mente exatamente no caso em que se quer usá-la. E a
integração é a mesma trapezoidal da bala de verdade: previsão com outra conta
mostra um arco que a bala não faz.

**Queda se mede contra a PARÁBOLA, e ao longo da MIRA.** Dois jeitos de errar
isso, e eu acertei os dois: medir contra o ponto já grudado no chão dá queda
NEGATIVA (a reta de referência já está enterrada e o ponto subiu até o
terreno), e usar o comprimento do ARCO em vez da distância ao longo da mira
adianta a referência. Queda negativa é bala subindo.

**Caixa de colisão e esfera de acerto são coisas diferentes.** A caixa é por
onde o corpo não passa; a esfera é onde a bala pega. Elas erram por motivos
diferentes, e ver as duas juntas é metade do valor da depuração. Verde é
colisor em que dá pra ficar em pé.

**Desenho de depuração que mente é pior que nenhum.** A vista desenhava a
esfera única de `center()` depois que o acerto já era resolvido por regiões:
mostrava uma bola no peito enquanto o tiro na perna decidia noutro lugar. E
desenhava só o SEGMENTO da cápsula, escondendo a tampa — que é justamente até
onde ela pega.

**Depuração não pode mudar o que se investiga.** Um `Box3Helper` por colisor
seriam oitocentos objetos na cena. É um `LineSegments` só, com todas as
arestas, reconstruído apenas enquanto o modo está ligado — desligado ele não
toca no buffer.

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

**E laço por relógio sob virtual time pode nunca terminar.** Uma página de
bancada com `while (performance.now() - t < 250)` travou sem erro nenhum e sem
sair nada — nem uma exceção pra investigar. Medição em bancada usa contagem
FIXA de voltas e divide no fim.

**Asserção de TEMPO na suíte não testa nada.** Ela roda sob
`--virtual-time-budget`, e ali `performance.now()` não anda: `custo < 1.5`
passa com 0,000 ms e fica verde sem exercitar coisa alguma. Duas suítes
tinham isso. Prove a REGRA por comportamento — quantas consultas de altura uma
pazada faz (9 para 400 props), se o buffer foi reescrito — e deixe o
milissegundo pra uma página de bancada, que roda em tempo real.

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

**A dispersão é do CORPO, não só da arma.** `SPREAD` em `config.js` multiplica
a abertura declarada na arma: parado é ZERO, andando é o valor da arma,
correndo 4,4× e no ar 6,5×. Parado a bala vai exatamente onde a mira aponta, e
acertar vira mérito de quem parou pra atirar — a decisão mais cara do
tiroteio, porque parado você é alvo fácil. Medido a 25 m com a MP40: 0 cm
parado, 22 andando, 118 correndo, 111 no ar.

**No ar ganha de tudo na ordem dos estados**, porque quem pula correndo está
no ar. E "parado" tem um piso de velocidade (`PARADO_ATE`): a velocidade do
quadro oscila em centésimos com a mão fora do teclado, e sem esse piso o
jogador nunca estaria parado.

**Mira estática com dispersão variável mente.** A abertura vai de zero a
quatro graus e um ponto fixo conta a mesma coisa nos dois casos — o jogador
erra e não sabe por quê. O anel de `ui/crosshair.js` é a informação, e o raio
sai do FOV da câmera do JOGO, não da do viewmodel: o que ele promete é onde a
bala cai no mundo.

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

**Campo de treinamento é OUTRO MAPA, não um canto deste.** Treinar mira tem
que ser plano, medido e sem nada acontecendo em volta, e Sainte-Mère é o
contrário disso de propósito. Misturar os dois tirava o que cada um tem de
bom, e por isso o campo saiu do mapa de combate.

**Alvo de treino é GENTE parada, não boneco de palha.** O que se treina é
acertar alguém, e a silhueta e a esfera de acerto de um soldado são o que vale
medir — o boneco tem outra forma e outro tamanho. Ele continua existindo no
curso de obstáculos, pro corpo a corpo. E o alvo levanta sozinho depois de
cair: alvo que some no primeiro acerto obriga a sair do lugar pra treinar de
novo.

**As distâncias dos alvos se medem da LINHA DE TIRO.** Medidas da origem do
campo elas saíam 6 m longas, e a placa de 90 m marcava 96 — aí ela deixa de
ser medida e vira enfeite.

**Munição infinita não dispensa recarregar.** O carregador acaba igual e o
respiro entre eles continua custando os mesmos segundos: treinar com uma arma
que não recarrega é treinar uma arma que o jogo não tem.

**Trocar de modo com o mundo montado recarrega a página.** `boot(modo)` monta
um mapa ou o outro, e o mundo é montado uma vez só. Desmontar mundo, bots e
sistemas pra trocar seria superfície de bug num caminho que se usa uma vez por
sessão — `?treino=1` resolve isso sem código nenhum.

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

**Time se distingue pelo TOM da farda, não pela cor dele.** Uniforme inteiro
pintado de vermelho e azul seria fantasia, não farda, e o soldado deixaria de
se esconder no mato — que é metade do jogo. Karnia é escura e Vestria clara, e
isso resolve a quarenta metros; a bandeira no peito e o vivo do capacete dizem
QUAL time, mas só de perto.

**O soldado é 324 triângulos, e tudo é caixa.** Capacete arredondado custaria
mais que o corpo inteiro e não se distingue a distância nenhuma. Cinto,
cartucheiras e mochila custam cinco caixas e são o que faz a silhueta ler como
soldado em vez de boneco — inclusive de costas, que é de onde se flanqueia.

**Bot que aponta o vetor exato e atira não é difícil, é impossível.** Tudo em
`bots/aiming.js` é atraso e erro de propósito: tempo de reação antes do
primeiro tiro, velocidade finita pra virar a cabeça, mira que nasce aberta e
fecha sem nunca chegar a zero, e abertura extra por alvo em movimento e por
distância. Ele também não atira com o cano torto, e a rajada tem fim — o
respiro entre elas é a janela de avanço do jogador.

**O número que importa é o duelo, não o ângulo.** Medido a 25 m: parado você
morre em 2,6 s, andando de lado em 7,5 s, com o primeiro tiro doendo depois de
1,2 s. Há teste que roda o duelo inteiro e trava essa faixa — apertar a mira
sem querer quebra a suíte antes de matar alguém sem explicação.

**A promessa de dano é em TIROS, não em pontos.** O jogador conta tiros:
cabeça um, capacete dois, tronco o normal, braço e perna mais. Os
multiplicadores são calibrados pela arma mais FRACA que existe — com ela a
promessa vale, com as outras vale com folga. Calibrar pela mais forte deixaria
a promessa falsa justamente na arma que a maioria carrega, e há teste que
CONTA os tiros em vez de conferir o multiplicador.

**Hitbox é CAIXA, porque o soldado é feito de caixas.** Cápsula não cobre
peça chata: o capacete tem 27 cm de largura e 19 de altura, e a cápsula que
cobria a largura sobrava 8 cm ACIMA da cabeça — hitbox no ar. Medido contra a
malha, que é a única fonte que não concorda por engano.

**Agachar encolhe SÓ o Y, porque é só o Y que o modelo encolhe.** Escalando os
três eixos, a hitbox de quem agacha ia de ±0,36 pra ±0,23 enquanto a malha
ficava em ±0,34: o tiro no ombro de alguém agachado passava reto.

**A bala vai pro sistema do ALVO, não as caixas pro mundo.** Uma conta por
alvo em vez de dezesseis caixas transformadas, e é o que faz a hitbox
acompanhar quem gira sem recalcular nada.

**A hitbox era uma CÁPSULA por osso antes disso, e antes ainda uma esfera.** Esfera não cobre
membro comprido: a perna ia de 5 a 84 cm e a esfera cobria 26 a 64 — 41 cm por
onde o tiro passava reto, e o jogador via a bala atravessar a perna. E membro
DOBRA, então uma cápsula do ombro à mão passa longe do braço de quem está com
a arma erguida. Hoje são dezesseis peças, cada uma entre duas juntas, e o
teste prova que não sobra altura descoberta entre elas.

**Empate entre peças vai pra mais valiosa, não pra última testada.** Onde
cabeça e capacete se encostam o tiro é na cabeça; acertar o menor alvo não
pode ser desperdiçado por um milímetro de sobreposição. Sem isso, mirar na
cabeça acertava o capacete.

**O capacete cobre a parte de cima da cabeça, e essa ordem é a regra.** Se ele
descesse sobre ela, o tiro na cabeça viraria tiro no capacete e a promessa de
um tiro sumiria. As regiões não podem se sobrepor no lugar errado.

**Facada pelas costas olha pra onde o ALVO está virado**, não de onde o golpe
partiu. Chegar por trás é a manobra, e ela vale independente do ângulo da
lâmina. Alvo sem direção — boneco de palha, poste — nunca está de costas: ele
não tem frente.

**Ninguém acerta a si mesmo, e isso é `owner`, não sorte.** A bala nasce na
altura do OLHO e a esfera de acerto fica no peito: em pé sobram 53 cm, que é
mais que o raio de 50 — passava raspando. Agachado sobram 30, e o bot se
matava no primeiro tiro. `ballistics.spawn` recebe `owner` e pula esse alvo.
Há teste que dispara SEM declarar o dono só pra provar que a proteção é a
linha, e não a geometria.

**O jogador só toma dano se estiver na lista de alvos da BALÍSTICA.** Estar na
lista que o bot enxerga faz ele te mirar e atirar; a bala continua
atravessando. Medido antes de corrigir: doze segundos de tiroteio a 16 m,
cem de vida intactos. São duas listas com nomes parecidos e propósitos
diferentes.

**Faca não acerta o próprio time.** Assim que o jogador entrou na lista de
alvos, o primeiro golpe acertava ele mesmo — que está a distância zero de si.

**Bot sem recarga é bot de um carregador.** Ele gastava os 32 tiros em cinco
segundos, entrava em cobertura por falta de munição e ficava agachado o resto
da partida. A recarga corre no `bots.update`, fora do estado: dentro do
combate, quem se escondeu pra recarregar nunca recarregaria.

**A bala de quem atira não pode morrer no colisor dele.** Quinta vez que este
invariante aparece nesta base, e a primeira em que a vítima não é o alvo: a
bala do bot nasce na altura do olho, ou seja DENTRO da caixa dele, e sem
`shooter` em `ballistics.spawn` todo tiro morria no quadro em que saía. Medido:
77 tiros, zero acertos, a dez metros de um alvo parado. O jogador nunca viu
isso porque ele não tem colisor no mundo.

**Sistema de todos não pode reportar em tela de um.** A balística é
compartilhada, e o evento de acerto viajava sem dizer QUEM atirou: cada acerto
de bot acendia a marca na mira do jogador. Medido: 128 quadros de marca acesa
com ele a sessenta metros da briga, parado. Hoje `owner` vai junto no evento,
e a marca compara. Acerto sem dono declarado passa — é o corpo a corpo, que
hoje só o jogador tem.

**Quem pergunta diz de onde pergunta.** `capture` guardava o último alvo num
`working`, e como o bot também chama `update` — depois do jogador, no mesmo
quadro — o painel do jogador mostrava a bandeira que o BOT estava trocando a
sessenta metros dali. Virou `targetAt(x, y, z, time)`: consulta, não estado.

**A bala não distingue farda; quem segura o tiro é quem atira.** Com nove
bots amontoados num posto, sem checar companheiro na linha eles se abatem
numa porta e a briga parece quebrada estando correta. `amigoNaFrente` testa um
cone de 0,16 rad até a distância do alvo.

**Bot morto tem que voltar.** Sem renascer, a frente esvazia: alguns minutos e
sobra um de cada lado, parados em cantos opostos da ilha. Ele volta num posto
que o time domina EM PAZ, ou na base principal — que entra sempre, pra que
perder todos os postos não tranque o time fora da partida.

**Estado de bot se mede ao longo do tempo, não num quadro.** Um instantâneo do
último quadro mostrou 8 de 9 em cobertura e parecia travamento; o histograma
dos 90 s mostrou 44% em combate e 19% em cobertura. O instantâneo de um
sistema com estados curtos não diz nada.

**Combate ganha de captura, e tiro pelas costas ganha das duas.** Bot içando
bandeira com alguém atirando nele seria bug: o jogador aprenderia a matar bot
ocupado em vez de disputar posto. E como quem atira do flanco fica fora do
campo de visão dele, levar dano sem ver ninguém tem estado próprio (`alerta`):
ele para, agacha e varre o horizonte. Ele não sabe DE ONDE veio o tiro — é
isso que dá a vantagem a quem atirou primeiro.

**Regra de partida não conhece three.** `game/teams.js` e `game/capture.js`
são só dado e conta: dá pra jogar o modo inteiro num teste, com postos de
mentira, sem montar ilha nenhuma. Quem desenha bandeira é `world/outpost.js`,
e ele lê o estado — nunca o contrário.

**A frente anda em ordem, um ponto por vez.** `activePostFor` diz o único
ponto em que cada lado pode mexer: o atacante trabalha na frente, o defensor
no último que perdeu. Sem isso o time todo pularia direto pro último ponto, e
a partida seria seis brigas soltas em vez de uma linha que anda.

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

**Uma caixa alinhada aos eixos não representa corpo diagonal.** Barra de 12 m
girada pela ponta vira uma caixa de 6,2 vezes o volume do corpo, e o jogador
esbarra em ar longe dela — parede invisível. Prop tombado que ergue o lado
comprido é FATIADO ao longo dele: oito caixas curtas em escada, 2,0 vezes o
corpo em vez de 6,2.

**Mas só quem ergue o lado comprido.** Parede que deita de lado continua bem
descrita por uma caixa: medido, fatiar ali dá exatamente o mesmo volume.
Fatiar tudo que tomba somava 1707 colisores num mapa com 304 props derrubados,
quase o triplo da lista — e a colisão varre ela inteira todo quadro. Com o
filtro de inclinação, o pior caso medido custa 0,605 ms por quadro contra
0,299 ms, ou 2% do orçamento a 60 fps.

**`prop.collider` é a PRIMEIRA FATIA, não o corpo.** Comparar ela com o
desenho compara um oitavo com o todo — três testes quebraram por isso quando
o fatiamento entrou. Quem quer o volume que a colisão enxerga soma as caixas
de `prop.fatias`.

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

**A foto do P só existe entre o render e o fim do quadro.**
`preserveDrawingBuffer` é false, então `toDataURL` em qualquer outro lugar
devolve uma imagem preta. Por isso `snapshot` tem duas metades: `poll()` lê a
tecla cedo, junto com a entrada, e `afterRender()` grava depois do render do
mundo e do viewmodel. É a mesma pegadinha das páginas de captura.

**Screenshot precisa de loop de render.** `preserveDrawingBuffer` é false, então
um `renderer.render()` solto some da captura. As páginas de captura usam
`setAnimationLoop`.

**Buffer de tamanho zero nunca cria o atributo.** `desenharVoo` só monta o
atributo de posição quando o tamanho muda, e zero balas no ar é o caso
COMUM: apertar F2 sem ninguém atirando estourava o quadro. O `errors` não
pegava porque a depuração nasce desligada — mesma família do sistema no laço
sem dono, logo abaixo.

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
deitar em Z, pulo com coyote time e buffer) com fôlego que a corrida e o pulo
gastam e a arma na mão encarece, natação, mapa de ilha com praia,
floresta e duas bases militares opostas, campo de treino, seleção de classe,
faca KA-BAR como modelo e viewmodel, e o HUD (bússola, situação, vitais, item).

Largar com G e apanhar com E funcionam, com item na mão ou sem: quem decide é
o slot do item estar livre.

F2 (ou crase) liga a depuração: painel com teclas acesas e o estado do
jogador, caixa de colisão de tudo desenhada na cena, esfera de acerto de cada
alvo, e o que cada bot está pensando escrito sobre a cabeça dele. Mais a
trajetória prevista da bala — o arco, a reta que ela faria sem gravidade, e a
distância, queda e desvio do cano escritos no painel.

P grava a tela num PNG com o estado queimado embaixo: posição, direção do
olhar, postura, vida, arma e contagem de colisores. O nome do arquivo leva a
posição, pra achar o lugar sem abrir a imagem.

A abertura tem dois caminhos: Jogar leva ao deploy de Sainte-Mère, e Campo de
treinamento entra direto num mapa plano com alvos a 10, 25, 50, 90 e 140 m,
os obstáculos, o arsenal inteiro no chão e munição infinita que ainda precisa
ser carregada.

Fluxo: abertura com a marca BF45 e o botão Jogar, sem mundo montado. Jogar cai
na tela de deploy — barra de equipamento em cima (classes e os itens que
existem, numerados pela tecla), mapa tático da ilha embaixo com seis pontos de
desembarque. Enquanto escolhe, o jogador é fantasma que voa, não colide e não
é atingido. ESC no jogo abre a pausa, e dela dá pra rever o equipamento e
voltar sem renascer. Morrer volta pro deploy. `K` mata o jogador, tecla de
teste enquanto nada causa dano de verdade.

Dano por região: cabeça mata num tiro, capacete em dois, tronco é o normal, e
braço e perna demoram mais. A faca mata em dois golpes, ou num só pelas
costas. O kill feed no canto conta quem matou quem e com o quê, destacando as
linhas que envolvem o jogador.

Golpe de faca (botão esquerdo), com dano, marca de acerto e três bonecos de
treino no estande. MP40 no slot 1 da Assault: automática de verdade (500 tiros por minuto,
segurar o gatilho despeja rajada), 32 no carregador e 96 de reserva, mira de
ferro e recarga. É a primeira arma do jogo que dispara segurando — as outras
continuam sendo um tiro por clique.

Colt M1911A1 exclusiva da Assault: tiro semiautomático,
8 tiros (7 + 1 na câmara), recarga no R com animação, mira de ferro no botão
direito. Cinto em quatro teclas — 1 MP40, 2 Colt, 3 faca, 4 pá. A bala viaja e cai; um traçante a cada
quatro tiros. A dispersão sai do estado do corpo: parado ela é zero, andando
é pequena, correndo e pulando é grande — e a mira abre junto pra mostrar. Ela sai da boca do cano e segue o cano: andando a arma fica reta
e atira reto, correndo com ela baixada o tiro sai 34° pra esquerda, e atirar
cancela a pose de corrida.

Pá M1943 no slot 4 cava e aterra o terreno de verdade; a colisão lê a mesma
camada, então trincheira cavada é trincheira que se anda dentro. Cavar embaixo
de árvore, pedra ou construção derruba o que ficou sem chão. O que tomba de
ponta tem o colisor fatiado ao longo do corpo, senão a caixa envolvente vira
parede invisível.

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

O jogador toma dano de verdade: a bala do bot é testada contra ele pela mesma
balística de todo mundo, e morrer devolve pro deploy. Vinheta vermelha nas
bordas avisa. Medido a 16 m, parado e sem revidar: dói em 1,6 s, morre em
2,9 s.

Nove bots no mapa: cinco de Karnia e quatro de Vestria, com o jogador
fechando 5 × 5. Eles brigam entre si, seguram o tiro quando um companheiro
está na linha, e renascem seis segundos depois de cair. Medido em 90 s de
guerra: 8 a 12 mortes, 44% do tempo em combate, e 0,83 ms por quadro — 5% do
orçamento a 60 fps.

Cada bot é a mecânica inteira: avança pro posto mais
perto, engaja quem vê pela frente, troca de arma quando o carregador acaba ou
quando o inimigo cola, procura cobertura sob fogo, captura bandeira e larga
tudo pra brigar. Faltam os outros dezenove. Não existe captura de base: elas são sempre do dono. Só a Assault é jogável; as
outras três estão no catálogo, bloqueadas.
