# game.bf

FPS de classes ambientado em 1945, frente ocidental. Three.js puro, sem build
e sem dependência de npm — abre no navegador e roda.

## Rodar e verificar

```bash
tools/dev.sh serve            # sobe o servidor estático (idempotente)
tools/dev.sh syntax           # parseia todo módulo como ES module
tools/dev.sh check            # sintaxe + suíte; sai != 0 se algo falhar
tools/dev.sh errors index.html            # erro de console na página
tools/dev.sh bancada bancada-cena.html    # bancada em tempo real (mede)
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
           suprimento.js  munição como recurso: onde se reabastece
           tratamento.js  cura como lugar: a enfermaria e quem ela atende
           hitboxes.js  regiões do corpo e o que cada acerto vale
           capture.js  arriar e içar bandeira, sem three
  bots/    model.js  carrega o .glb, veste o time e mede a hitbox
           aiming.js  atraso e erro de mira, sem three
           soldier.js  corpo, colisor, vida e o andar
           brain.js  o que ele decide fazer · bots.js  gerente e fiação
  core/    input.js  teclado bruto
           stage.js  renderer, cena, luz, e a curva de tom do jogo
           audio.js  o som do jogo, sintetizado — nenhum arquivo
  player/  player.js estado + ordem dos sistemas
           stamina.js  fôlego de correr e pular, pesado pela arma
           locomotion.js  stance.js  swim.js  spectator.js
           collision.js  view.js  heading.js
           inclinacao.js  espiar por trás da quina (Q e E): o olho anda,
             a boca do cano vai com ele e a hitbox acompanha
  core/    sky.js  céu encoberto desenhado com o mesmo ruído do relevo
  world/   noise.js  ruído de valor, compartilhado pelo relevo, mata e céu
           grao.js  o grão que texturiza o chão, e fecha sem costura
           colisores.js  a lista de colisores com índice espacial
           estradas.js  a malha viária, pintada no chão
           lote.js  as caixas de construção viram InstancedMesh por célula:
             1450 malhas em 142 lotes, e 803 chamadas de desenho em 94
           heightfield.js  altura da ilha (matemática pura, sem three)
           deform.js  camada escavável, delta por vértice da malha
           settling.js  o que perde o chão desaba e tomba
           minimap.js  a ilha vista de cima, do mesmo campo de altura
           serra.js  o relevo FALSO além da borda: a conta, sem three
           horizonte.js  a malha do anel que fecha o horizonte
           costura.js  a banda que emenda o passo fino do terreno no grosso
           dummy.js  boneco de treino (alvo de dano)
           densidade.js  onde a floresta é grossa e onde não há floresta
           terrain.js  malha · water.js  mar · river.js  a lâmina do rio
           bridge.js  as três pontes de concreto
           forest.js  espalha árvore e pedra
           arvores.js  duas espécies em três portes
           base.js  base militar · course.js  obstáculos
           training-world.js  o campo de treinamento, mapa à parte
           outpost.js  os 4 mastros · outposts.js  onde ficam os 6
           locais.js  o que existe EM cada ponto de captura
           logistica.js  onde ficam a tenda e o paiol de cada lugar
           enfermaria.js  a tenda médica · paiol.js  os engradados
           (cada mapa declara `garagem`: onde há veículo)
           construcao.js  peças compartilhadas · casas.js  4 tipos de casa
           vila.js  fazenda.js  moinho.js  bunker.js  militar.js  praia.js
           props.js  helpers · world.js  monta tudo
  items/   classes.js  models.js  viewmodel.js  drop.js
           knife.js  pistol.js  mp40.js  shovel.js   modelos
           attack.js  firearm.js  ballistics.js  digging.js
           muzzle.js  de onde a bala sai e pra onde ela vai
           poses.js  como cada item é segurado
  veiculos/ jipe.js  a ficha do Willys MB: massa, motor, mola, assentos
           fisica.js  entrada -> motor -> rodas -> forças -> corpo
           eixos.js  as quatro rodas de um passo, e o que elas somam
           roda.js  suspensão, tração e o círculo de atrito, uma roda
           atitude.js  transferência de peso, o pêndulo invertido, o motor
           casco.js  orientação do corpo e a carroceria raspando o chão
           aderencia.js  quanto cada tipo de chão agarra e quanto arrasta
           dano.js  componentes, pneus e as duas máquinas de estado
           hitbox.js  motor, tanque, carroceria e os quatro pneus
           atropelamento.js  empurra, derruba ou mata, pela velocidade
           mundo.js  as duas únicas coisas que a física sabe do terreno
           assentos.js  quem está sentado onde · piloto.js  tecla -> comando
           modelo.js  carrega o .glb, separa o que gira, abre o para-brisa
           hitbox.js  as regiões, medidas da malha
           vista.js  a câmera de dentro · veiculo.js  a entidade
           veiculos.js  a lista, o laço e o embarque do jogador
  ui/      flow.js  máquina de estados e telas
           mapa.js  o mapa grande do M · marcacoes.js  os waypoints
           simbolos.js  o símbolo do ponto de captura, para as três telas
           watchdog.js  vigia de invariantes em jogo
           classcards.js  tacticalmap.js  session.js
           deploylist.js  a lista de pontos e o placar da tela de deploy
           itemicons.js  qual ícone é de qual item, pro cinto e pra tira
           compass.js  objective.js  status.js  prompt.js  hitmarker.js
           radar.js  a ilha recortada em volta do jogador, e as coordenadas
           rangefinder.js  distância do que está sob a mira, só mirando
           crosshair.js  a mira abre com a dispersão
           rumodano.js  de onde veio o tiro: arco em volta da mira
           boneco.js  onde ele pegou: a hitbox desenhada de frente
           killfeed.js  quem matou quem, e como
           debug.js  painel e o interruptor do F2
           medidor.js  o custo do quadro em p95, e o que o render cobra
           ajustes.js  painel do F3: mexer em config.js com o mapa montado
             (desenhado pela lil-gui; o gráfico é o Stats — os dois de vendor/)
           debugview.js  caixas de colisão e estado dos bots na cena
           snapshot.js  P grava a tela com o estado escrito nela
tests/     run.html + suites/
           (aim, compass, movement, jump, stance, terrain, chao, floresta,
            swim, inclinacao, model, drop, melee, firearm, ballistics, muzzle,
            slope,
            combate, indice, construcoes, pelotao, suprimento, tratamento,
            mapa,
            textura, grade, avisodano,
            horizonte,
            flow, lote)
tools/     dev.sh  serve.py (sem cache)  soak.html  model-viewer.html
           bancada-cena.html  quem é dono do quadro: objeto, chamada, matriz
           bancada-painel.html  o painel de ajustes fora do jogo, pra medir layout
           bancada-colisao.html  bancada-boot.html  bancada-bots.html
           bancada-combate.html  (tempo real, não suíte)
           bancada-logistica.html  o que a tenda e o paiol cobram: boot e quadro
           bancada-grade.html  as sete curvas de tom, medidas por cor de chão
           bancada-ceu-linear.html  banda no degradê do céu: sRGB contra linear
           bancada-horizonte.html  o que o relevo falso custa, e o A/B do plano
             distante — mede com `?serra=0|1` e fotografa com `?olho=`
           paleta-vegetacao.py  a conta que repintou o verde
vendor/    three.js 0.169 local — não vem de CDN
           bancada-perfil.html  de quem é o milissegundo DENTRO da IA e da
             balística, desligando uma peça por vez: `?bots=N&mortos=N`
           bancada-lote.html  quem escapou do lote, e o que o lote custa
           three/addons/  o que se usa dos examples do three, vendorizado:
             GLTFLoader · PointerLockControls · BufferGeometryUtils ·
             SkeletonUtils (clone com esqueleto religado) · OrbitControls
             (só nas bancadas) · lil-gui e Stats (o painel do F3 e o gráfico)
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

**E no plano é a mesma coisa: a física manda em `bodyX`/`bodyZ`.** Desde que
inclinar o corpo existe (Q e E), `camera.position.x/z` é o OLHO e não o corpo —
a cabeça sai 26 cm pro lado com os pés parados. Locomoção, colisão, piso, teto
e água leem `player.bodyX`/`bodyZ`; quem quer a CABEÇA — a boca do cano, o
alcance de apanhar, o telêmetro — lê `position`. Os dois getters subtraem o
único offset que os separa, e partir do olho em `moveHorizontal` faria a
inclinação virar um passo de lado — um passo que ninguém desfaz, porque no
quadro seguinte ele já é a posição de partida.

**Inclinar sai de UM tombo do tronco, e são quatro consumidores.** `ANGULO` e
`PIVO` em `INCLINACAO` dão o deslocamento do olho, a queda do olho, a rolagem
da vista e o quanto cada caixa da hitbox anda. Declarar o deslocamento em
metros era a armadilha óbvia: agachado o braço do quadril ao olho encurta de
0,75 pra 0,42 m, e um deslocamento fixo pediria 45° de tombo — que a hitbox não
teria como acompanhar. Medido: 25,6 cm de pé, 14,3 agachado, 4,5 cm de queda de
olho, 12° de rolagem, 0,18 s pra sair e 0,13 s pra recolher.

**A hitbox ancorava no OLHO, e com inclinação isso conta a manobra duas
vezes.** `playerAsTarget.x/z` era `camera.position`, e as caixas inclinadas iam
por cima: medido, a caixa da cabeça andava 40,9 cm em vez de 25,6 e a do PÉ
andava os 26 cm do olho — quem espiava ficava com os pés fora da cobertura sem
sair do lugar. A âncora é o CORPO, e quem inclina as caixas é `inclinarCaixas`,
no sistema do corpo, e só ela. Isso só apareceu porque o teste imprimia os
centímetros da caixa como `note`: a asserção "a cabeça andou pro lado certo"
passava verde com os dois erros dentro.

**A caixa da cabeça anda o que o OLHO anda, e a referência é MEDIDA.**
`corpoDe` escala o corpo até o topo do capacete ficar na altura do olho, então
o olho mora 30 cm ACIMA do centro da cabeça. Repartir o tombo pela altura do
olho — que é a rotação rígida correta — dava 15,3 cm de caixa contra 25,6 de
olho: dez centímetros em que o jogador vê e não é visto, que é exatamente a
imunidade que inclinar não pode dar. A repartição normaliza na caixa da CABEÇA,
achada entre as caixas que chegaram — a hitbox sai da malha quando há modelo, e
tabela à mão desalinharia na primeira vez que o modelo mudasse.

**Inclinar é testado com o cilindro do CORPO, e o último degrau é ZERO.** Uma
bolinha na cabeça deixaria o ombro atravessar a parede, e é o ombro que encosta
primeiro. A ladeira de frações (1 · 0,75 · 0,5 · 0,25 · 0) é a mesma ideia do
`stance.js` que encolhe quem não cabe: medido, com parede a 50 cm sobram 25% de
inclinação e a 42 cm não sobra nada. O zero no fim é o que garante que ninguém
fica preso inclinado — inclusive quem já estava dentro de geometria antes de
apertar a tecla.

**O E é disputado por TRÊS sistemas, e o terceiro lê a tecla SEGURADA.**
Embarcar e apanhar leem um TOQUE, e só quando têm o que fazer com ele;
inclinar lê `isDown`. As três convivem porque quem consome o toque avisa
(`travarE`), e a inclinação larga o E até ele subir: sem esse aviso, apanhar um
item ou entrar no jipe dava um solavanco de um quarto de segundo pro lado — um
quadro de inclinação é invisível, dez são um bug visível. Mudar de tecla foi
considerado e recusado: Q/E é a convenção que o jogador traz de fora, e mover
apanhar pro F recriaria exatamente o conflito que tirou a bandeira do E.

**Ponto ancorado na CÂMERA não prova rolagem nenhuma.** O teste da vista
inclinada projetava um ponto fixo no espaço da câmera: ele gira junto com ela e
cai sempre no mesmo pixel, e a medida deu 0,00° com a vista rolando 12°. O
ponto tem que estar ancorado no MUNDO — e LONGE, porque os 26 cm que o olho
anda giram a imagem 1,4° só de paralaxe a dez metros. A dois quilômetros isso
desaparece e sobra a rolagem. E a IMAGEM gira ao CONTRÁRIO da câmera: medir o
módulo esconderia uma rolagem pro lado errado.

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

**O rio tem ÁGUA, e ela corre ACIMA do mar.** O leito está a 10 m e o mar no
zero; um plano de água só não pode estar nos dois lugares, então são duas
malhas e `nivelDaAguaAt(x, z)` é quem responde qual vale onde. Ler
`WORLD.WATER_LEVEL` direto acerta o mapa inteiro menos dentro do rio — que é
justamente o caso — e foi o que deixou o leito seco: uma vala de grama, e vala
se atravessa correndo. Com 2,4 m de lâmina (acima de `SWIM_DEPTH`) atravessar
custa o dobro do tempo e expõe o corpo, e é isso que faz a ponte valer a briga.

**O corte do rio é em DOIS degraus: vale e canal.** Com um só, a margem vencia
18,5 m em 44 — 0,42 de declividade, muito acima de `DECLIVE_TERRA` — e o rio
corria dentro de um paredão de barro de ponta a ponta do mapa. Hoje o vale é
largo e raso (0,05, a grama pega na descida inteira) e o canal é estreito e
fundo (0,27, uma faixa de 26 m de terra rente à água, que é onde barranca de
rio fica mesmo).

**Água manda antes de declividade no tipo do chão.** O leito é PLANO, então
pela declividade ele era grama — e grama é onde nasce árvore. Com o rio cheio,
os pinheiros ficaram plantados de pé dentro da correnteza. `AGUA` entrou em
`ground.js` como quarto tipo e a lâmina vem por fora, não da altura: são duas
águas, e comparar altura com uma constante acerta o mar e erra o rio.

**A ponte ATRAVESSA o rio; ela não é um buraco no rio.** Antes o terreno
simplesmente não era cavado sob a ponte, o que dava uma língua de grama
cortando o leito — e a ponte não segurava nada, porque dava pra contornar por
baixo dela a pé enxuto. Hoje o rio é cavado até o fim e são três pontes de
concreto por cima, com pilar no leito e guarda-corpo dos dois lados. Sem o
parapeito o jogador sai por qualquer ponto e a ponte deixa de canalizar
ninguém.

**Ponte corre no eixo Z, e isso não é preguiça.** A colisão só entende AABB, e
uma ponte girada pra ficar perpendicular ao leito viraria uma caixa envolvente
muito maior que o corpo dela — parede invisível a metros da estrutura, o mesmo
problema do prop tombado na diagonal. O leito corre uns 15° fora do eixo, a
travessia reta cruza a uns 75°, e isso não se percebe andando.

**O comprimento da ponte sai de SONDAR o terreno.** Ela para onde a margem
alcança a altura do tabuleiro, e assim as duas pontas encostam no chão
sozinhas. Zona plana não cabia aqui: o mapa já está cheio delas e postos e
bases têm prioridade.

**O ponto 05 fica a 72 m do leito, não a 44.** Com o rio cheio, 44 m é margem
AFUNDADA — terreno a 7,8 m e lâmina a 7,9, ou seja o posto nascia dentro do
rio. E ele guarda a ponte do MEIO das três: numa ponta do mapa o atacante
contorna pelas outras duas travessias e o ponto vira enfeite.

**Céu é textura gerada, não arquivo.** `core/sky.js` desenha um equirretangular
num canvas com o mesmo `noise.js` do relevo, e o projeto continua abrindo
offline. Duas armadilhas, as duas medidas: a nuvem é projetada num TETO plano
(raio `tan(theta)`), senão ela fica do mesmo tamanho no zênite e no horizonte e
o céu vira papel de parede; e o ruído é amostrado em coordenada CILÍNDRICA
(cos/sen da longitude), senão a textura não fecha e aparece costura vertical.

**E o `tan` que dá a profundidade é o mesmo que estica listra.** Perto dos 90°
ele dispara e um punhado de células de ruído virava listra vertical na linha
do horizonte. Limitar o ÂNGULO matava a nuvem numa faixa inteira e deixava
degradê liso; limitar o RAIO satura o ruído num valor constante — some a
listra e fica a bruma.

**Encoberto é DIA, e a primeira paleta errou isso.** Com o zênite em 0x4d5257 o
topo do quadro ficava quase preto e a tela lia como noite mesmo com o chão bem
iluminado. E a luz: no céu azul a direcional branca em 1,4 fazia metade do
trabalho; trocá-la por 0,9 de difusa escureceu o mapa inteiro até a
hemisférica ir a 2,9. O que a nuvem tira é o azul e a sombra dura, não a luz.

**A curva de tom foi MEDIDA, e as duas escolhas óbvias são as erradas.** O
projeto rodou sem tonemapping nenhum até aqui, e o sintoma era verde neon e
telhado chapado. `tools/bancada-grade.html` mede as sete curvas do three contra
o desvio de cromaticidade das sete cores de chão que aparecem em quadro, e ACES
e Cineon — que é o que se pega por reflexo — SATURAM o verde e esmagam a sombra
(o pinheiro ganha +0,207 de croma com ACES e perde o vermelho de 41 pra 26).
AgX é a única que tira croma de tudo (−0,15 na grama) e levanta o brilho junto,
que é o tratamento de dia encoberto. Neutral é a pior das sete: +0,28.

**A curva alcança a névoa e NÃO alcança o céu, e isso rasga o horizonte.** O
three só tonemapeia fundo de textura quando o espaço dela não é sRGB
(`toneMapped = getTransfer(colorSpace) !== SRGBTransfer`, three linha 15028).
A textura do céu estava marcada sRGB, então terreno e névoa eram gradados e o
céu ficava cru — e como a névoa é da cor do horizonte, a linha do horizonte
ganhava uma costura entre os dois. Marcar LINEAR conserta, e conserta junto um
segundo erro que estava lá desde sempre: os bytes que `sky.js` escreve vêm de
`THREE.Color`, que JÁ converteu de sRGB pra linear — declarar sRGB pedia a
conversão duas vezes. É a mesma pegadinha da textura de grão.

**E byte linear não deu banda no céu, ao contrário.** O medo é razoável — espaço
linear gasta precisão no claro — mas a medida diz outra coisa: no intervalo do
céu o degradê linear usa 92 dos 256 níveis contra 76 do sRGB, com salto máximo
de 1 nos dois (`tools/bancada-ceu-linear.html`). O sRGB é que é expansivo no
escuro, e um céu não tem escuro.

**Consertar o encoding invalida a paleta que compensava o bug.** Com a dupla
conversão fora, o MESMO par de constantes deu um céu de brilho 185 e croma
0,022 — branco lavado, sem cor e sem nuvem, porque a barriga de nuvem passou a
caber dentro do branco. `SKY_TOPO` e `SKY_HORIZONTE` foram reautorados pra
169/0,054. Toda constante escolhida a olho antes de um conserto de encoding
está compensando o erro, e não sobrevive a ele.

**Escurecer pra ganhar contraste TRAZ O NEON DE VOLTA.** É o eixo da coisa
toda, e é medido: AgX desatura no CLARO, então baixar a luz joga a cor na parte
da curva que ela não lava. Na vila, baixar a hemisférica levou o percentil 1 do
brilho de 77,9 pra 67,0 e a croma média SUBIU de 0,190 pra 0,211. A curva não
resolve isso sozinha — a saturação tem que sair da FONTE, e é por isso que a
vegetação foi repintada de croma 0,56–0,61 pra 0,42 (`tools/paleta-vegetacao.py`).
Nenhum jogo de guerra faz de outro jeito: a grama já é oliva na textura.

**E o teto de croma é TETO, não alvo.** Aplicado como alvo ele SATURA o que já
estava contido: a areia subia de 0,287 pra 0,420 e a praia ficava amarela, e o
caminho de terra ia de 0,365 pra 0,421. Só vegetação, barranco e terra revolvida
estavam acima; areia e caminho de terra passam intactos.

**Repintar devolve o BRILHO, senão a distância muda de leitura.** A conta puxa
croma e empurra matiz, e no fim recoloca a luma original de cada cor — as seis
ficaram a menos de 0,5 de onde estavam. Mexer no valor junto mudaria o contraste
entre mata e campo, que é o que diz a distância. E o pinheiro NÃO leva o
empurrão pro amarelo: ele é frio de propósito (azul acima do vermelho), e
amarelá-lo o deixava mais quente que a folhosa — as duas espécies existem pra se
distinguir a cem metros.

**Luz e curva são a mesma decisão, e os 2,9 da hemisférica provaram.** Aquele
número foi calibrado pra um render sem curva nenhuma; com AgX levantando o
quadro inteiro ele virou excesso, e preto que não é preto é o que faz um quadro
ler como chapado. Por isso as duas luzes moram em `GRADE`, junto com a
exposição. A direcional sobe na mesma conta: com luz só de cúpula, telhado,
parede e chão chegam no mesmo valor e a silhueta da casa desaparece — encoberto
tem pouca sombra, não sombra nenhuma.

**Névoa fora do alcance de tiro é névoa que não existe.** 260 a 1400 num mapa
de dois quilômetros só agia depois de tudo que se pode atirar: a mata a 600 m
saía com a mesma saturação do capim a 20, e sem perda de contraste com a
distância o quadro lê como maquete. 130 a 1050 põe 62% de névoa a 700 m e 18% a
300. Mas ela nunca satura dentro do mapa — vulto que desaparece na bruma é alvo
que não existe, e num jogo de tiro isso é pior que quadro chapado.

**O PLANO DISTANTE tem que passar da névoa, e ele não passava.** `CAMERA.FAR`
era 400 contra `FOG_FAR` 1050, ou seja o mundo era CORTADO com a névoa tendo
feito 29% do trabalho — 71% da cor do terreno ainda na tela. Medido numa captura
do alto do Bunker da Colina olhando pro sul: o pixel saltava 233 níveis somados
numa linha só, de (123,134,101) pra (193,197,201), e o que se via era a borda do
mundo desenhada com régua. E não era só estética — o engajamento mais longo do
mapa é de 700 m, e `bots/bots.js` desanexa o soldado em `FAR + 20`: um vulto a
500 m simplesmente NÃO ERA DESENHADO. Hoje `FAR` sai de `WORLD.FOG_FAR + 50`, e
o 50 é folga de graça: 1050 e 1100 deram a MESMA contagem de chamadas.

**E o que se teme ao esticar o `far` não é o que custa.** Precisão de
profundidade foi o primeiro medo e ela não se move: numa projeção perspectiva o
passo do buffer é dominado pelo NEAR (o termo é `1/near - 1/far`), e com
`near = 0,1` sair de 400 pra 1100 muda o passo a 390 m de 90,6360 mm pra
90,6504 mm — 0,017%. O que CUSTA é CONTAGEM DE OBJETO, como sempre nesta base:
medido no mesmo processo em `tools/bancada-horizonte.html`, 455 chamadas de
desenho com 400 contra 874 com 1050. Dobrar as chamadas é o preço de o mapa
existir além de 400 m, e é um preço, não um bônus.

**O mapa NÃO é uma ilha, e eu passei três medições supondo que fosse.**
`heightAt` só tem perfil de mar numa faixa de 120 m ao norte (`z <= -880`); em
todo o resto o planalto vai a 22–26 m até a aresta da malha em ±1000, onde
`locomotion.js` prende o jogador em `SIZE/2 - 1`. `ISLAND_RADIUS: 980` limita
sorteio de prop, não o terreno. Medido no perímetro: a borda norte dá -9,7 m
CHAPADOS nos 2 km (é o Canal), 28% do perímetro está debaixo da lâmina, e os
outros três lados são planalto seco terminando no vazio. Quem for mexer na borda
do mundo tem que saber que ela é um QUADRADO de platô, não uma costa.

**O relevo falso é uma seta de sentido único, e a base dele é a própria ilha.**
`serra.js` LÊ `naturalHeight`; ninguém lê `serra.js`. Foi o que deixou a costura
fechar por CONSTRUÇÃO em vez de por ajuste: `naturalHeight` é definida em todo
(x, z) e nada nela para na borda, então continuá-la pra fora é de graça. Medido
em 2000 pontos do perímetro, `heightAt` e `naturalHeight` dão exatamente a mesma
altura (0,00 m — nenhuma zona plana chega perto da borda, a mais próxima é a
Base Karnia a 255 m), e o anel encosta com desvio 0,00e+0. Constante de emenda
nenhuma, e `heightfield.js` continua sem saber que o anel existe.

**A largura do anel sai da NÉVOA, e a resolução dele sai da distância.** Mais
estreito que `FOG_FAR` e a borda de FORA do anel volta a ser uma reta visível, só
mais longe; mais largo é triângulo que ninguém pode ver, porque em `FOG_FAR` o
quadro já é exatamente a cor do horizonte. São `FOG_FAR + 60` = 1110 m, e a
grade é de 25 m — 10× o passo do terreno. A crista mais perto que dá pra
enxergar está a ~350 m da borda, e ali uma célula de 25 m subtende 4,1° (75 px
numa tela de 1280 com os 70° de FOV). Fecha 14,06 km² — três vezes e meia a área
do mapa — com 47.880 triângulos, 3,74% do 1,28 M do terreno jogável.

**Serra que a regra do chão pinta de TERRA é uma cinta de barranco de um
quilômetro.** A serra sobe 92 m em 440, ou seja 0,21 de declividade média, acima
de `DECLIVE_TERRA` (0,16) — e pela regra de `ground.js` isso é terra pelada. A
primeira captura saiu com um cinturão marrom em volta do mapa inteiro: a regra
estava certa e a resposta estava errada, porque no anel não existem as 4200
árvores que fazem o resto do relevo ser verde. Colina distante é coberta de
mato, e o mato tem que estar na COR — é a mesma decisão de
`paleta-vegetacao.py`. Medido nos bytes, a mistura é um verdejador de barranco e
quase não toca o capim: em 0,3 ela desloca a grama 5 níveis e a terra 9; em 0,9
desloca a grama 16 e a terra 27, e nesse ponto a terra deixa de LER como marrom
porque o vermelho passa a ficar abaixo do verde (124>100 vira 97<114).

**E amarrar a mata ao PESO da serra é pior que amarrar à distância.** Parecia
mais principiado — onde a serra sobe, a declividade sobe, então a mata devia
acompanhar. Medido: no flanco de baixo o peso ainda é 0,11 enquanto a
declividade local já passa de 0,12, e era exatamente ali que a cinta marrom
aparecia. A rampa da mata é por DISTÂNCIA (260 m) e é curta de propósito.

**Transição de resolução em ARESTA LIVRE racha, e a fenda mostra o mar.** O
terreno é amostrado a 2,5 m e o anel a 25: nos 25 m entre dois vértices do anel
a aresta dele é uma CORDA reta enquanto a do terreno segue a curva. Medido nas
320 cordas do perímetro — mediana 1,9 cm e p90 9,9 cm (invisível), mas p99
1,25 m e pior 2,46 m, e as onze cordas acima de 30 cm estão TODAS nas duas fozes
do rio, onde o canal desce 0,27 numa faixa de 26 m que uma corda de 25 m não vê.
Na captura isso era uma linha AZUL atravessando o quadro na altura da borda: o
mar de `water.js`, que é um plano de 4400 m, aparecendo pela fenda.

**Duas saídas óbvias pra essa fenda foram MEDIDAS e descartadas, nesta ordem.**
Uma cortina vertical descendo da borda tapa o erro pra BAIXO e não pra cima, e o
erro tem os dois sinais: o sintoma passou de linha azul a linha ESCURA, ou seja
trocar o mar pela saia não é consertar. E prender a fileira interna do anel no
MÍNIMO da aresta sobre a própria célula torna a desigualdade um teorema — mas o
preço é o anel afundar o relevo local de 50 m: medido, 43 dos 324 vértices da
fileira afundavam mais de 1 m, 23 mais de 2 e o pior 8,40, cavando uma vala ao
longo da ESCARPA e das duas fozes. Pior que a fenda, e provado.

**O que fecha é não ter aresta livre em lugar nenhum.** `costura.js` é uma banda
de um passo de anel (25 m) com a aresta de DENTRO no passo do terreno — 3204
vértices, um por vértice da borda dele, então é a MESMA poligonal e não uma
aproximação — e a de FORA no passo do anel, que é a mesma poligonal do anel. O
leque de triângulos entre as duas é o único lugar do mapa onde duas resoluções
se encontram, e ali elas se encontram DENTRO de uma superfície. Zero fenda por
construção, e não "fenda pequena": medido, as duas arestas caem sobre as duas
poligonais com erro < 1e-3 m.

**Grade única, com a borda CRAVADA nela.** A primeira versão do anel eram quatro
faixas, e elas rachavam nas QUINAS: a faixa norte dividia 4220 m em 169 passos
(24,97 m) e a oeste dividia 1110 m em 44 (25,23 m), então a aresta
compartilhada tinha vértice em lugar diferente nas duas. "A altura é função de
(x, z), então vértices coincidentes coincidem" é verdade e não salva nada quando
os vértices não são coincidentes. Hoje `FORA` sai de uma contagem INTEIRA de
passos (`serra.ABAS`), a grade é uniforme de ponta a ponta, e ±BORDA e
±(BORDA + PASSO) caem em cima de linhas dela.

**O anel é retangular porque o mapa é retangular.** Um anel circular de raio
interno 1000 deixaria os cantos do quadrado — que estão a 1414 m do centro —
atravessando ele, duas superfícies quase coplanares disputando o mesmo pixel; e
um que começasse além dos cantos deixaria um vazio de 414 m no meio de cada
lado. É a mesma razão pela qual ponte e casa giram 0° ou 90°: a geometria segue
o eixo porque o mapa segue o eixo.

**A declividade do anel é medida no passo do TERRENO, não no dele.** É a única
medida de declividade do projeto (`PASSO_DECLIVE`), e a diferença não é
acadêmica: medido na fileira da costura, o passo de 25 m lê 0,168 onde o de 2,5
lê 0,014 na foz do rio a oeste, e a cor pula 33 níveis de grama pra terra num
vértice só — a costura desenhada em marrom. Custa 4 consultas de altura por
vértice, que são ~110 ms do boot; sobre o anel inteiro a diferença média é de
0,46 nível, então quem olhar só a média vai achar que dá pra economizar.

**Serra não nasce do mar, e o que fecha o norte é a névoa.** A máscara de terra
zera a crista onde a base está sob a lâmina. Montanha subindo da água em frente
à praia de desembarque seria uma costa que a Normandia de 1944 não tem; mar
aberto que se dissolve na bruma é a resposta honesta — dali não vem nada. Medido
em 1200 pontos ao norte: zero crista, e o fundo continua a -22 m, debaixo da
lâmina.

**E o horizonte do MAR não precisa de névoa nenhuma, porque não sobra pixel.**
Suspeitei de costura entre a água saturada e o céu, e a geometria responde: com
o olho a 1,9 m na praia, toda a água além de 1050 m cabe em 0,1° — cerca de 1,3
px. O teal correr até a linha do horizonte é o que um mar de verdade faz.

**Ruído de valor tem sino, e a serra gastou metade da amplitude nisso.**
Terceira vez nesta base (grão, densidade, e agora a serra). Medido sobre 19 mil
pontos DO ANEL com `ESCALA_MASSA` e duas oitavas: p5 = -0,411 e p95 = 0,514, ou
seja os 2,0 de faixa nominal entregavam 0,925 — 46% da amplitude declarada, e a
serra saía lombada. O esticão de p5..p95 pra 0..1 devolve a serra inteira, e há
teste que recalcula os dois percentis: mexer na escala, nas oitavas ou na
largura do anel exige remedir. E nada de elevar ao quadrado pra "concentrar as
cristas" — concentrar sobre uma distribuição que já é de sino concentra duas
vezes, que é o erro que deixou o grão em 0,98 no pixel típico.

**Crista que não passa do OLHO não fecha nada.** Do olho de quem está em pé no
planalto (24 m de chão, 25,7 de olho), uma crista mais baixa que isso fica
escondida atrás da própria linha do horizonte e o anel volta a ser um tapete.
São +92 m acima da base: medido, 57% do anel distante passa do olho e a crista
mais alta chega a 121 m, o que dá 7,3° de silhueta a 700 m — 133 px numa tela de
720. Não é alpe de propósito: o Cotentin é planalto agrícola, e o que se quer é
fechar o quadro, não inventar montanha.

**Enrolamento de triângulo em quatro lados diferentes sai da GEOMETRIA, não de
um `if` por lado.** O leque da banda é emitido com o sinal da área no plano XZ,
e quem estiver negativo troca dois índices. `flatShading` deriva a normal do
enrolamento: errar num dos quatro lados pinta aquela borda de PRETO, e é
exatamente o tipo de erro que passa por qualquer teste que só conte triângulo.

**O fundo submerso não descasa, e isso foi medido, não presumido.** `Color` de
fundo não passa pela curva (só textura passa) enquanto a névoa passa, e as duas
são a mesma cor declarada — parecia costura garantida dentro da água. Medido na
bancada: desvio de 0 níveis nos três canais. Suspeita boa, conclusão errada.

**Fundo de cena virou TEXTURA, e textura não tem `setHex`.** `applyUnderwater`
guardava a cor e escrevia por cima; hoje ele guarda o OBJETO e troca por uma
`Color`, porque recriar a textura na saída custaria meio segundo dentro do
quadro em que o jogador tira a cabeça da água.

**`?olho=x,y,z&mira=yaw,pitch` em `tools/screens-shot.html`** põe a câmera onde
nenhuma zona de desembarque alcança — vão de ponte, leito do rio, telhado.
O laço daquela página não chama `player.update`, então o que for escrito ali
fica; no jogo, `view.js` reescreveria `camera.position.y` no fim do quadro. E o
yaw entra pelo QUATERNION em YXZ: `camera.rotation.y` não é o yaw.

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

**O chão tem grão, e ele MULTIPLICA o vertexColor.** O `map` do Lambert
multiplica a cor por vértice, e é isso que faz a textura do terreno custar três
linhas: os cinco tipos de chão, a transição grama↔terra, a água escurecendo, a
mistura da estrada e a terra revolvida da pazada continuam saindo todos de
`ground.js`, e `applyEdit` não muda nada — ela mexe em cor e altura, não em UV.
O UV vem de graça: `PlaneGeometry` já nasce com ele em 0..1 nos 2 km, então o
tile sai de `repeat` (125 voltas) e nenhum atributo novo entra na malha.

**Textura de grão é MULTIPLICADOR, e multiplicador não é cor.** Marcada como
`SRGBColorSpace`, o three converte pra linear antes de multiplicar: um cinza 128
viraria 0,216 e o terreno escureceria 78%. Vai em `LinearSRGBColorSpace`. E byte
não passa de 255, ou seja o teto do multiplicador é 1 — TODO grão escurece a
média, e por isso a compensação de brilho se mede depois de gerar, nunca antes.
Medido: 0,8936, que são 10,6% em linear e **5,0% no pixel** — a multiplicação
acontece em linear, e 0,89^(1/2,2) = 0,95. Confirmado no render: -3,8% de média
no chão. Prever o escurecimento em sRGB dá o dobro do que se vê.

**O `fbm` do relevo NÃO fecha, e textura repetida mostra a costura.** A
frequência sobe 2,13× por oitava pra não alinhar harmônico com os eixos, e por
não ser inteira a oitava de cima não dobra junto com o período: a repetição
desenha uma linha reta a cada tile, e no chão isso lê como grade desenhada.
`fbmTileavel` usa razão 3 — inteira, e alinha menos que 2 — com o `hash`
recebendo a coordenada dobrada em `periodo`. Medido: o salto na costura é 0,49×
o salto entre dois vizinhos quaisquer. E a medida tem que ser COMPARATIVA:
"o salto na costura é pequeno" não prova nada num ruído suave, onde tudo é
pequeno.

**O tile do grão não pode casar com a malha.** São 2,5 m por vértice; tile de
2,5 / 5 / 7,5 m casa a repetição da textura com a quebra do triângulo e a grade
da malha aparece desenhada no chão — o grão que existe pra esconder a resolução
passa a anunciá-la. São 16 m (razão 6,4), e há teste que recusa múltiplo e
submúltiplo.

**E a FEIÇÃO tem que sobreviver ao mipmap.** O primeiro tile foi de 3,1 m, o que
dava mancha grossa de 39 cm e fina de 4 cm. Num FPS o chão é visto quase sempre
entre 5 e 50 m, e ali o mip entrega a média da textura: medido no render, o chão
escurecia os 2,4% previstos e o desvio de brilho CAÍA de 18,70 pra 18,02 — grão
nenhum, só um filtro escuro. Com 16 m a mancha grossa é de 2 m, e a razão medida
por pixel entre com-grão e sem-grão vai de 0,911 a 1,000.

**Ruído de valor tem sino, e o grão gastou metade da amplitude nisso.** Mesma
armadilha de `densidade.js`, e eu caí nela de novo: medido sobre esta textura o
p5 é 0,2224 e o p95 é 0,7211, então os 22% de amplitude declarada viravam 11% de
modulação real. Pior, a primeira versão ainda elevava o ruído ao QUADRADO pra
"concentrar o escuro em manchas esparsas" — concentrar sobre uma distribuição
que já é de sino concentra duas vezes, e o pixel típico ficou em 0,98. O
esticão de p5..p95 pra 0..1 devolve os 22% (2,01× medido), e `P5`/`P95` são
medida: mexer nas oitavas, no período ou no lado exige remedir, e há teste que
recalcula os percentis e compara com as constantes.

**E desvio agregado é o instrumento ERRADO pra medir textura.** Passei três
medições concluindo que o grão não estava sendo aplicado porque o desvio de
brilho do chão não subia. Ele não sobe: o desvio do chão vem da iluminação e da
declividade, e uma modulação MULTIPLICATIVA de 9% por cima disso comprime a
faixa em vez de alargá-la — o desvio até cai. O que mede grão é a RAZÃO por
pixel entre os dois renders.

**Anisotropia no chão não é enfeite, e mipmap não é opcional.** Chão de FPS é
visto rasante quase todo quadro, e é exatamente onde o mipmap isotrópico borra
até virar cinza liso: sem anisotropia o grão não sobrevive a dez metros. Sem
mipmap, as 645 repetições cintilam a distância — pior que chão sem grão nenhum.
O three limita ao máximo do aparelho, então 4 é seguro sem consultar o renderer.

**O terreno é um campo de altura, não um plano.** `world/heightfield.js` é a
fonte de verdade — a malha em `terrain.js` só desenha o que ele diz, e a
colisão amostra a mesma função. É matemática pura, sem three, justamente pra
poder ser inspecionada fora do navegador.

**Varredura linear de colisores é linear MESMO, e o mapa já pagava por isso.**
Medido antes de mexer: 1,05 ms por quadro com mil colisores e 5,12 ms com
quatro mil, contando as ~40 varreduras que o jogador e os nove bots fazem por
quadro. Com os 2000 colisores que o mapa tinha, a colisão sozinha comia 13% do
orçamento a 60 fps — e cada árvore ou casa nova saía desse mesmo bolso.
`world/colisores.js` é uma grade de 32 m: 0,011 ms com quatro mil, e PLANO.
Foi ela que deixou a floresta triplicar.

**O índice infla a caixa na INSERÇÃO com a mesma folga do teste.** A consulta é
um ponto, mas `overlapsXZ` infla em `PLAYER.RADIUS` antes de comparar — o
jogador é um cilindro. Sem a folga na inserção, um colisor encostado na divisa
da célula é achado pelo laço linear e perdido pelo índice: o jogador atravessa
parede em faixas de meio metro espalhadas pelo mapa, e ninguém reproduz.

**Colisor que se move avisa o índice.** Prop descalçado tomba e a caixa anda
dezenas de metros; sem `colliders.moveu(...)` em `settling.js`, o índice segue
apontando pro lugar onde a árvore estava de pé — ela barra o jogador no ar e
ele atravessa o tronco caído. Há teste que compara índice e varredura linear em
milhares de pontos, antes e depois de mover.

**E o teste do índice não mede tempo, mede RESPOSTA.** Sob
`--virtual-time-budget` o relógio não anda e `custo < 1.5` passa verde com
0,000 ms. O milissegundo está em `tools/bancada-colisao.html`, que roda em
tempo real; a suíte prova que índice e laço linear concordam ponto a ponto.

**Estrada é PINTURA no chão, não geometria.** Uma faixa de malha por cima seria
a mesma coisa que o campo de altura já desenha, só que flutuando ou enterrada
em toda lombada. `world/estradas.js` é uma função (x, z) -> peso que a malha e
o mapa tático leem pra trocar a cor — zero triângulo, zero colisor, e ela
acompanha o relevo exatamente.

**E ela é um TIPO de chão, não só uma cor.** `ESTRADA` entrou em `ground.js`
junto com `AGUA`: mato no meio da pista devolveria de graça a cobertura que a
estrada não tem, e é a falta dela que faz o caminho rápido ser o caminho
perigoso. Sai de graça pra árvore, pedra e arbusto — todos já pedem `GRAMA`.

**A pista não pode ser mais estreita que a célula da malha**, mesma regra da
marca de bala: com 2,55 m por vértice, o asfalto de 3,2 m de meia-largura já
está no piso. E a borda dele é CURTA (1,6 m) enquanto a do caminho de terra é
longa (2,4): asfalto tem meio-fio, terra é capim pisado até sumir. Com os 3,5 m
de desmanche que o asfalto tinha, a pista lia com 15 m de largura — um rio de
piche cortando o mapa.

**Toda travessia do rio cai numa ponte.** Estrada atravessando o leito contaria
uma mentira: ali não se passa, se nada. E a pintura para na lâmina d'água —
asfaltar o leito desmentiria a ponte que existe justamente pra isso.

**Espécie de árvore não é escala.** Mil e quatrocentas cópias do mesmo cone
davam uma floresta que o olho lê como padrão repetido, e a distância nada
distinguia um trecho de outro. Hoje são duas silhuetas (folhosa comum,
pinheiro em minoria) e três portes que mudam a PROPORÇÃO entre tronco e copa,
não o tamanho — escalar o mesmo desenho continuaria sendo um cone escalado.

**O porte sai de um sorteio PRÓPRIO, não do `rng` do ponto.** Aquele já foi
gasto decidindo se o ponto vingava contra a máscara de densidade; reusá-lo
amarraria o porte à densidade da mata em volta, e a mata fechada nasceria toda
de um tamanho só.

**`colorAt` roda uma vez por vértice, e closure ali custa.** Uma IIFE dentro
dela eram 641 mil objetos jogados no coletor só pra montar o chão. Vale pra
tudo que a malha chama por vértice.

**Chave de grade espacial é NÚMERO, não string.** `${cx},${cz}` numa consulta
por vértice são 641 mil strings alocadas por montagem de malha. Um inteiro
deslocado resolve, e vale pros dois índices — o das estradas e o dos colisores.

**A página de captura desenha DUAS vezes por quadro**, o mundo e o viewmodel, e
o orçamento de tempo virtual decide quantos quadros ela desenha antes da foto.
Com o mapa cheio, os 12 s padrão viraram ~720 quadros de software rendering e
a captura passou de quatro minutos. `dev.sh shot` aceita o orçamento como
quinto argumento; dois segundos bastam pro layout assentar.

**Floresta espalhada parelha não é floresta, é textura.** Sorteando uniforme
por área, as 1400 árvores saíam com a mesma espessura nos 2,6 km² de grama, e
não existia decisão nenhuma de entrar na mata ou contorná-la — mata e campo
eram a mesma coisa em qualquer direção. `world/densidade.js` é uma máscara de
ruído que redistribui a MESMA conta em manchas. Medido: a vizinha mais próxima
cai de 20,3 m pra 15,2, o maior vazio na grama sobe de 43 m pra 105, e a mata
fechada leva 25% das árvores ocupando 8% do mapa.

**Ruído de valor tem distribuição de SINO, e cortar nele por número redondo
mente.** Medido sobre a ilha, o p5 é 0,241 e o p95 é 0,779: os cortes
"óbvios" de 0,30 e 0,80 deixariam 10,7% em campo aberto e 3,8% em mata
fechada, ou seja a ilha inteira em bosque — o tapete de novo, com outro nome.
Os cortes de `densidade.js` são os percentis 30, 50, 75 e 92, e mexer na
escala ou nas oitavas exige remedir.

**A máscara de mata não conhece o chão, e é isso que a mantém honesta.** Ela
usa o mesmo `hash` do relevo deslocado de 9000 na grade do ruído; sem esse
deslocamento a floresta nasceria sempre no mesmo flanco de toda lombada. Há
teste que compara a repartição das faixas sobre a ilha com a repartição sobre
a grama sozinha — deu 0,38 ponto de desvio.

**Densidade é a segunda peneira, não a primeira.** A regra do chão continua
mandando: areia é deserta e barranco é pelado (`ground.js`), e a máscara só
redistribui o que já podia nascer na grama. A geografia autoral — praia,
escarpa, planalto, rio — sai intacta, e a variedade dos postos cai de graça:
Praia e Vila em campo aberto, Ponte e Moinho em mata fechada.

**E pedra NÃO segue a máscara.** Ela não é vegetação, e no campo aberto é a
única cobertura que sobra: amarrá-la à floresta deixaria o campo sem nada
atrás de que se agachar, e atravessar campo aberto deixaria de ser difícil
pra ser impossível.

**Teto de tentativas inventado defende de problema que não existe.** A peneira
de densidade derruba o aceite de 85,8% pra 28,5%, e eu subi o teto do
`espalhar` de 40× por precaução — antes de medir. Medido, 1400 árvores custam
4911 tentativas contra as 56 mil que 40× já dava: onze vezes de folga. O teto
protege do sorteio que nunca converge, não da peneira.

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

**Mas a vinheta só diz que DOEU — nunca disse de onde nem onde.** São três
perguntas, e ela responde uma. `ui/rumodano.js` desenha um arco em volta da
mira no rumo de onde o tiro saiu, e `ui/boneco.js` acende a região do corpo
que levou. As duas leem a MESMA lista de acertos da marca de acerto e do hit
feed, com o filtro invertido: ali o jogador é quem atira e se compara `owner`,
aqui ele é quem leva e se compara `target`.

**`dir` NÃO responde "de onde veio o tiro", e acerta por acidente.** O evento
de acerto já levava o rumo da bala no impacto, e inverter esse rumo devolve a
direção certa — mas só porque no modelo atual apenas a gravidade age, então o
rumo HORIZONTAL é constante ao longo do arco. Basta somar vento ou arrasto e a
conta passa a mentir calada. O evento passou a levar `origem`, que é a boca do
cano guardada no nascimento da bala, e o HUD lê o PONTO.

**E o ponto é o que faz a marca continuar certa quando o jogador ANDA.** Com
ângulo congelado, o arco aponta pro lado errado depois de dois passos; com o
lugar de onde atiraram, o rumo é refeito todo quadro. Medido na suíte: tiro
vindo do norte desenha 0° na tela, e depois de o jogador andar 16 m pro norte
— ou seja PASSAR da boca do cano — o mesmo tiro desenha 180°.

**O arco fica NUMA circunferência, e o miolo vazio é a informação.** Mesma
razão da vinheta nas bordas. Medido: zero pixel de tinta dentro de 20% do lado
do canvas, com a banda em 0,70 do meio-lado. Um indicador desenhado no centro
tira exatamente o que ele existe pra dar.

**E o rumo do arco é do MUNDO, não da tela — `camera.rotation.y` mataria isso
em silêncio.** É o primeiro invariante desta base cobrando de novo, e aqui o
sintoma é o pior possível: um arco vermelho apontando pro lado errado parece
certo até alguém virar pra lá. Medido, olhando pro sul com 30° de caimento o
rumo de verdade é 180° e `rotation.y` lê 0° — o arco cairia no topo com o tiro
vindo das costas. Há teste que dispara nessa pose e exige o arco embaixo.

**Rajada não empilha arco.** Dois tiros saídos de menos de 8 m um do outro são
a MESMA marca, refrescada. Medido: um tiro pinta 360 px, três tiros do mesmo
lugar continuam pintando 360, e de outro lugar sai um segundo arco (722).
Empilhando, cada um com o relógio dele, uma rajada de seis vira uma mancha que
não apaga.

**O boneco de regiões É a hitbox, desenhada de frente.** As caixas saem de
`corpoDe()` — a mesma fonte que a bala consulta — projetadas em vista frontal
com escala ÚNICA nos dois eixos. Silhueta desenhada à mão desalinharia na
primeira vez que alguém mexesse numa peça, que é o defeito que
`game/hitboxes.js` existe pra evitar e que já cobrou 8 cm na cabeça. Medido: a
proporção desenhada é 0,410 contra 0,416 da hitbox (0,71 m por 1,71). Erro de
escala num eixo passa batido por qualquer teste de visibilidade e morre aí.

**As duas passadas do boneco são a regra, não estilo.** O apagado inteiro
primeiro, o aceso depois. Numa passada só, a peça de prioridade alta desenhada
por cima — a cabeça, sobre o capacete — apagaria com o tom morto justamente a
região que acabou de acender. Medido pela fração da altura da silhueta:
capacete 0,061, cabeça 0,152, tronco 0,393, perna 0,757.

**Braço acende dos DOIS lados, e isso é honestidade.** O dado do evento é o
GRUPO, e grupo não tem lado: `braco` é braço, não braço esquerdo. Acender um
só seria o HUD inventando uma distinção que a regra de dano não faz — a mesma
regra do HUD que não inventa número. E o teste exige que nada acenda perto do
eixo, senão o tronco estaria passando por braço.

**O boneco fica SEMPRE na tela, apagado.** Aparecer só ao levar tiro obrigaria
o olho a achar um elemento novo no canto no meio de um tiroteio. É o contrário
da barra de fôlego, que só aparece quando falta: ali o que interessa é o
número, aqui o que interessa é ONDE, e "onde" precisa de um mapa fixo pra ser
lido de relance.

**Página de captura de HUD que APAGA precisa refrescar o estado.** A marca de
rumo vive 2,6 s e o orçamento de tempo virtual decide quantos quadros a página
desenha antes da foto: disparando uma vez, a captura saía com os dois painéis
já apagados e parecia que nenhum dos dois desenhava. `?dano=rumo[,rumo]` em
`tools/screens-shot.html` dispara balas DE VERDADE pela balística e as
redispara a cada 100 quadros, devolvendo a vida junto — senão a rajada de
figurantes mata o jogador e a foto vira tela de deploy. É a mesma ideia do
`?ads=1` segurando a mira de ferro.

**`z-index` num painel fixo por cima do canvas WebGL abre BURACO na captura.**
Medido: o painel do F3 com `z-index: 20` deixava um retângulo de `#87ceeb` —
o fundo do `body` — aparecendo embaixo dele na foto headless, 11 mil pixels
num quadro de 1280x720. Tirando o `z-index` some, e o painel continua por
cima porque vem depois do canvas no documento. Não é enfeite: este projeto
verifica tela por captura headless, e uma regra de CSS que só quebra ali
quebra justamente o instrumento. Achar isso foi seguir a COR do pixel
(135, 206, 235 é `skyblue`, e só o `base.css` pinta aquilo) em vez de
adivinhar de quem era o retângulo.

**Média de quadro não mede nada, e foi por isso que o medidor nasceu com
p95.** Um engasgo de 40 ms a cada trinta quadros é exatamente o que se sente
jogando e exatamente o que a média esconde: medido na suíte, 29 quadros a
60 fps mais um de 40 ms dão média de 17,4 ms — "quase 60 fps" — com o pior
quadro em 40. `ui/medidor.js` mostra p95, p50 e o pior da janela, e amostra
TODO quadro inclusive com o painel fechado: ligar o F2 no meio de um engasgo
tem que mostrar o engasgo, não começar a contar dali. E o fps SOME quando não
há quadro medido: sob `--virtual-time-budget` o delta chega zero e a divisão
escrevia "1000000 fps" no HUD — o HUD não inventa número, nem na captura.

**`renderer.info` se zera a cada `render`, e o último do quadro é o do
VIEWMODEL.** Lido no painel, o contador dava zero chamadas e zero triângulos:
o que ele tinha era o custo de desenhar uma arma numa cena vazia. A amostra é
tirada ENTRE os dois renders, e o número que o F2 mostra é o do mundo.

**Quem paga o quadro hoje é CONTAGEM DE OBJETO, e isso só aparece contando.**
Medido em `tools/bancada-cena.html` com o mapa montado: 1311 objetos na cena,
714 draw calls e 1,71 M de triângulos, com 13 geometrias e 40 materiais
distintos. A floresta já era instanciada (11 `InstancedMesh` pras 4200
árvores); o que sobrou solto eram as 1272 caixas de CONSTRUÇÃO, ou seja a mesma
caixa desenhada mais de mil vezes. Eram 1,8 ms de CPU por quadro com a câmera
apontada pro CÉU — zero triângulo transformado. Hoje elas são lote
(`world/lote.js`), e a mesma bancada dá 237 objetos e 94 draw calls.

**A caixa de construção vira lote POR CÉLULA, e o que se compra com isso é o
recorte.** Um `InstancedMesh` por material dá 51 chamadas de desenho em vez de
106, e o preço é ele ser recortado como UMA coisa: um lote de 2 km está sempre
em quadro, e medido com a câmera pro céu a travessia sobe de 0,25 pra 0,37 ms.
Célula de 96 m fica com 84% da economia de chamada e devolve o recorte por
região. O A/B é do mesmo processo, como sempre nesta base: 651 chamadas e
3,16 ms contra 106 e 0,87 — entre duas execuções da mesma página o ruído desta
máquina passa de 40%, e comparar execuções provaria o que se quisesse.

**Lote não é de graça em pixel: ele desenha o que o recorte por objeto
descartava.** A captura antes e depois difere em 10 pixels de 921.600, todos na
LINHA DO HORIZONTE e nenhum passando de 25 níveis — são os 900 triângulos a
mais que a bancada contou, props a um quilômetro cuja esfera própria caía fora
do quadro e que agora entram junto com a célula. Aquele prop existe ali, então
não é regressão; e a diferença chega ao pixel já lavada pela névoa. Suspeitei
primeiro de FASE de animação (a cruz do moinho gira por delta) e a medida
recusou: duas capturas com orçamento de tempo virtual diferente dão zero pixel
de diferença, ou seja o quadro da página de captura é determinístico.

**O que vira instância tem que avisar quem mexia na malha.** `settling.js` já
sabia mexer em instância — é assim que a floresta se registra desde sempre —,
mas os props de `addBox` se registravam com a malha SOLTA. Sem `trocarParte`, o
prop continuaria escrevendo numa malha que saiu da cena: cavar embaixo de uma
parede a deixaria de pé na tela e caída na colisão, que é o pior dos dois
mundos, porque o colisor desce e o desenho não. Quem se MEXE fica fora do lote
por marcação (`userData.movel`): a bandeira que sobe no mastro, a cruz do
moinho, o boneco de treino que tomba.

**O corpo caído perguntava ao MAPA INTEIRO onde ele tinha batido.** Terceira
vez que este invariante cobra — depois de `acharCobertura` e de `wallHit` —, e
desta vez no quadro em que alguém morre: enquanto o solver do ragdoll está
acordado ele varria os 5643 colisores atrás das caixas a 1,6 m do quadril.
Medido em `tools/bancada-perfil.html`, no mapa de nove bots: TRÊS corpos no
chão levavam a IA de 0,71 pra 2,70 ms, e 1,77 desses milissegundos eram só a
varredura. Num tiroteio de 300 com 62 corpos eram 62 varreduras por quadro,
367.846 caixas visitadas, 20 dos 26 ms. Com `emVolta` são 142 µs por corpo em
vez de 667.

**E o teste disso conta VARREDURA, não milissegundo.** Ele roda sob
`--virtual-time-budget`, onde `performance.now()` não anda e `custo < 1.5`
passa verde com 0,000 ms. Contar a iteração da lista inteira (envolvendo o
`Symbol.iterator` da instância) mede a REGRA. E vem com contraprova, porque
"nenhuma varredura" é também o que se mede quando o corpo deixou de consultar
caixa nenhuma: a mesma queda com e sem uma parede encostada tem que terminar em
lugares diferentes — medido, 18 cm.

**Terreno `flatShading` não tem normal, e calculá-la custava um sexto do
boot.** O shader deriva a normal por FACE a partir da posição, e é por isso que
`applyEdit` nunca chamou `computeVertexNormals` depois de uma pazada. O
`buildMesh` chamava, sobre os 641.601 vértices da malha inteira: medido, 138 ms
de um `buildMesh` de 912. O atributo sai fora junto (`deleteAttribute`) porque
são 7,7 MB que o material não amarra a atributo nenhum. A prova de que ninguém
mais o lia é a captura: 0 bytes de diferença em 2.764.800. Se algum dia alguém
fizer raycast contra o terreno e ler `intersection.normal`, é
`computeVertexNormals` que volta — e o custo dela volta com ela.

**E desligar a matriz automática das paredes NÃO vale a pena.** Foi medido em
A/B no mesmo processo (entre duas execuções da bancada o mesmo código deu 2,54
e 1,81 ms, e nesse ruído comparar execuções prova o que se quiser): com as 934
caixas estáticas em `matrixAutoUpdate = false` o quadro caiu de 0,280 pra
0,230 ms. Cinco centésimos de milissegundo, 0,3% do orçamento a 60 fps, em
troca da armadilha de mexer numa caixa e ela não andar porque ninguém chamou
`updateMatrix()`. O A/B ficou na bancada pra que a próxima pessoa que pensar
nisso já tenha o número.

**Bancada em tempo real não fecha sozinha.** Sem `--dump-dom` nada encerra o
headless, e esperar o `timeout` inteiro faz uma medida de três segundos custar
minutos. `dev.sh bancada` sobe o Chrome em segundo plano e o derruba assim que
a página imprime `FIM` — que toda bancada tem que imprimir.

**O painel do F3 é desenhado pela lil-gui, e a versão à mão perdia no que
mais importa: DIGITAR o valor.** Arrastar um deslizador até exatamente 1,35 é
impossível, e "exatamente 1,35" é o que se quer quando se comparam duas
gradações. O que continua sendo do projeto é o que ela não sabe: varrer
`config.js` sozinha (senão são duzentas linhas de `gui.add` pra manter de
acordo com o arquivo), tirar a faixa do arrasto do PRÓPRIO valor, avisar quem
leu o número no boot, soltar o mouse sem abrir a pausa, e dizer o que saiu do
lugar.

**O painel de ajuste do F3 escreve NO config, e por isso não é fonte de
verdade de nada.** `ui/ajustes.js` mexe no objeto que `config.js` exporta, e
quem lê o número na hora de usar (dispersão, fôlego, balística) muda no quadro
seguinte de graça. Quem leu no BOOT — a luz, a exposição, a névoa, o FOV —
precisa do `aplicar`, senão o painel parece quebrado exatamente nos números
que só se julgam olhando. E ele não grava em arquivo: copia as linhas do que
mudou pra colar na mão, porque gravar por cima levaria junto os comentários,
que nesta base são metade do valor de cada número.

**Quem solta o mouse de propósito se anota num lugar só.** O mapa do M tinha
dois flags próprios pra que o `unlock` dele não virasse tela de pausa; o
painel do F3 seria um terceiro e um quarto. Viraram o conjunto `soltos` em
`flow.js`: enquanto ele não estiver vazio, `unlock` não é pausa, e fechar o
último devolve o ponteiro. Quem tranca e destranca continua sendo só o
`flow.js`.

**O som é SINTETIZADO, como o céu é.** `core/audio.js` desenha a onda com
ruído e senoide num `AudioBuffer`, e o projeto continua abrindo offline sem
asset binário nenhum. Um tiro são três camadas somadas — o estouro (ruído que
morre em 8 ms), o corpo (senoide grave que CAI de frequência, senão vira
apito) e a cauda (o eco em volta) —, e o envelope é exponencial porque
percussão é exponencial: queda linear soa como alguém abaixando o volume.
Medido na suíte: rms 0,466 no começo contra 0,0014 no fim, e pico 0,834 —
o `tanh` é o que segura o ±1, e sem ele a soma das camadas vira clipe digital.

**Som posicional é informação de rumo, igual à bússola.** O bot já reagia a
tiro — `alerta` acorda quem ouviu um a 45 m — e o jogador não tinha nada:
virar pro lado certo era privilégio de quem já estava olhando. As vozes vivem
NA CENA, nunca penduradas na câmera: penduradas nela andariam junto com a
cabeça e todo som sairia dos dois lados igual.

**E a voz vem de PISCINA, como o traçante.** Num tiroteio de 300 bots são mais
de mil tiros por segundo, e um `PositionalAudio` novo por tiro é um nó de
panner criado e descartado por milissegundo. São 24 vozes em rodízio, e o
`playbackRate` desafina cada tiro um pouco — sem isso uma rajada de automática
soa como um arquivo repetindo, que é exatamente o que ela é.

**O áudio só existe depois de um GESTO, e sintetizar no boot é pagar
adiantado.** O navegador nasce com o `AudioContext` suspenso; `despertar`
pega carona no clique que o jogo já exige pra travar o ponteiro. Até lá
`pronto` é falso e todo mundo continua chamando `tocar()` sem saber disso —
inclusive a suíte, que roda em headless sem alto-falante.

**Quem dispara repassa o nome do som, e isso já ficou de fora uma vez.** É a
mesma armadilha do `dig`: a balística tinha o funil (`onShot` avisa TODO
disparo, do jogador e do bot), as asserções passavam, e o jogo saía mudo
porque `firearm.js` não punha `som` na bala. Teste de tiro que não começa no
clique não prova nada.

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

**O radar é a MESMA ilha do mapa tático, recortada.** `islandFor` memoiza o
desenho por terreno porque agora há dois consumidores, e montá-lo é uma
amostragem de 260 × 260 do campo de altura — sem isso o boot pagaria duas
vezes pelo mesmo desenho, no lugar exato onde o gargalo deste projeto está.
Norte pra cima e quem gira é a seta: radar que roda com a cabeça obriga a
reorientar a leitura a cada passo, e o rumo já é trabalho da bússola.

**Radar não mostra inimigo.** Mostra terreno, postos e companheiros. Dizer
quem está atrás do morro apaga o flanqueamento, a cobertura e a emboscada —
apaga o jogo. É a mesma família da mira do bot: o que o jogador tem que
descobrir olhando não pode aparecer de graça no canto da tela.

**Janela de radar de 500 m não mostrava objetivo nenhum.** Medido do
desembarque de Vestria: o posto mais perto está a 711 m e os outros passam de
mil, então o radar era capim e uma seta. Alargar até caber tudo faz da ilha um
selo de 158 px; a saída é a janela seguir apertada e o que está fora encostar
na BORDA, na direção certa. Direção cabe em 158 px, distância de um
quilômetro não.

**O telêmetro mede do OLHO, e isso não contradiz a trajetória.** O arco da
depuração sai do CANO porque a pergunta é "por onde a bala vai passar"; o
telêmetro sai do olho porque a pergunta é "o que é aquilo ali", e "aquilo ali"
é o que está debaixo da mira — o centro da câmera. Medir do cano daria a
distância de um ponto que o jogador não está olhando. E ele SOME sem alvo no
alcance, em vez de escrever zero ou infinito.

**Repetir em JS uma regra que o CSS já aplica cria duas verdades.** O
telêmetro checava `player.isLocked` pra não aparecer com uma tela aberta —
mas quem esconde o HUD nesse caso é `body.screen-open` no CSS, desde sempre.
A condição duplicada não protegia nada e era a única coisa que impedia a
página de captura de fotografar o número, porque lá `player.controls` é o
PointerLockControls de verdade e nunca trava em headless.

**Suíte que só confere "apareceu algo" não testa medida.** O telêmetro é
provado contra geometria conferível de cabeça: olho a 10 m de chão plano lê
10, a 45° lê 10·√2 = 14, parede a 5,5 m ganha do chão, alvo a 20 m lê 20 e
vira `no-alvo`. Erro de escala passa batido por um teste de visibilidade e
morre em qualquer um desses.

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

**Suíte que estoura o orçamento de tempo faz OUTRA suíte falhar.** A suíte
roda sob `--virtual-time-budget=15000`, e quando ele acaba os `import()`
pendentes das suítes seguintes falham com "Failed to fetch dynamically
imported module" — um nome que não tem nada a ver com a causa. Aconteceu três
vezes seguidas com nomes diferentes (model, bracos, dano) enquanto o culpado
era a suíte da floresta, que é O(n²) nas árvores e triplicou junto com
`TREE_COUNT`. Pior: o `check` para antes do passo que olha o console do jogo,
então o portão fica meio aberto sem dizer. Teste que cresce com um número de
`config.js` amostra em vez de varrer.

**Sob `--virtual-time-budget`, o relógio congela depois do PRIMEIRO fetch.**
Medido no mesmo laço: 316 ms antes de um `fetch`, 0,0 ms depois — e vale pra
`performance.now()` E pra `Date.now()`. Toda bancada que carrega asset (o GLB
do soldado, por exemplo) reporta zero em tudo que medir depois disso, sem
erro nenhum. Bancada que precisa de asset roda SEM tempo virtual e devolve
por `console.log`, que o `--enable-logging=stderr` captura enquanto o processo
vive — `--dump-dom` volta antes da conta terminar.

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

**Bala tem TETO de alcance, e ele é do SISTEMA, não da arma.** As duas armas
diziam `range: Infinity` e a rédea era a `LIFE` de 30 s, que não segura nada.
No plano a gravidade põe o tiro no chão a 125 m e parecia resolvido — mas o
alcance de um lançamento a 45° é v²/g = 253²/14 = **4572 m**, duas vezes e meia
a ilha. Mirando pra cima a bala saía do mapa e seguia sendo testada contra todo
alvo e toda parede por trinta segundos, sem poder acertar nada.
`BULLET.RANGE_MAX` é 600 m, cravado no `spawn`: a arma declara o limite PRÓPRIO
dela (`Infinity` = não limito) e o sistema decide o máximo. Duas fontes de
verdade sobre distância se separariam no primeiro ajuste.

**E o alcance não pode sair do FRAMERATE.** Conferir `travelled > range` no fim
do quadro deixava a bala passar do teto antes de morrer, e o excesso era um
passo inteiro: 4,2 m a 60 fps e 8,4 a 30 — o mesmo defeito que a integração
trapezoidal do pulo existe pra corrigir, e pior, porque nesses metros extras a
bala ainda resolvia acerto contra alvo e parede. O trecho é CORTADO no alcance
que sobra: o que está dentro continua sendo acertado (alvo a 599 m morre) e a
bala expira em exatamente `range`. Há teste em três framerates.

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

**Linha `auto` de grid CRESCE, e aí `height: 100%` mente.** `.screen` é um
grid com linha implícita; dentro dela `.deploy-layout` pedia `height: 100%` e
resolvia contra a LINHA, não contra a janela. Medido numa janela de 493 px: a
linha ia a 1066, o mapa nascia com o dobro da altura da tela e a legenda
ficava fora do quadro — com `overflow: hidden` isso não vira barra de
rolagem, vira conteúdo cortado em silêncio. A linha precisa ser
`minmax(0, 1fr)` pra poder encolher abaixo do conteúdo.

**A tela de deploy conta a partida, e só o que a partida tem.** A lista de
pontos lê `postOwner`, `postContested` e `activePostFor` — dono, disputa e
linha de frente, que existiam só dentro do código; o placar sai de `tally` e
a descrição de cada ponto é a `nota` da tabela do mapa. Ficaram DE FORA, por
não existirem: contador regressivo de início de partida (o modo não tem
tempo, tem os doze postos), granadas, esquadrão com nomes, botão de
personalizar e quantos soldados estão em cada ponto. É a mesma regra do HUD
que não inventa número — na tela onde o jogador decide onde desembarcar, ela
pesa mais, não menos.

**`display` escrito num ID esconde a tecla de esconder.** `.screen.hidden`
some com a tela por classe (0-0-2-0); a abertura ganhou layout próprio em
`#start-screen` (0-1-0-0) e a partir daí a classe `hidden` parou de valer —
medido, ela computava `grid` com a classe posta. Clicar em Campo de
treinamento entrava no mapa com o menu inteiro por cima. Regra de layout de
tela vai em `#tela:not(.hidden)`, e nunca num ID cru.

**A abertura não anuncia sistema que não existe.** Não há conta, nível nem
contador de servidor: `readGuest` sorteia `Convidado NNNN` uma vez e guarda,
e a versão sai de `JOGO.VERSAO`. É a mesma regra do HUD que não inventa
número, e vale igual pro menu — botão de personalização ou de progresso sem
tela atrás promete o que o jogo não entrega. Opções existe como MAQUETE
declarada, com os controles desabilitados e o aviso em cima: deslizador que
anda e não muda nada mente mais do que a tela vale.

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

**`THREE.Color` converte hex de sRGB pra LINEAR.** Comparar `color.r * 255`
com o pixel de um canvas mede 18 contra 76 e nunca casa — a troca de farda por
time não pegava e os dois saíam idênticos. Pra mexer em textura, bytes crus.

**A marca do time se põe medindo a superfície, não chutando.** A frente do
tronco está em z 0,146 e o suspensório vai até 0,168; a bandeira em 0,125
nasceu DENTRO do peito e não aparecia em vista nenhuma.

**Time se distingue pelo TOM da farda, não pela cor dele.** Uniforme inteiro
pintado de vermelho e azul seria fantasia, não farda, e o soldado deixaria de
se esconder no mato — que é metade do jogo. Karnia é escura e Vestria clara, e
isso resolve a quarenta metros; a bandeira no peito e o vivo do capacete dizem
QUAL time, mas só de perto.

**O soldado é 324 triângulos, e tudo é caixa.** Capacete arredondado custaria
mais que o corpo inteiro e não se distingue a distância nenhuma. Cinto,
cartucheiras e mochila custam cinco caixas e são o que faz a silhueta ler como
soldado em vez de boneco — inclusive de costas, que é de onde se flanqueia.

**A grade de combatentes é REFEITA todo quadro; a de colisores, não.** São
trezentas inserções contra os 45 mil pares que ela evita, e manter índice de
coisa que anda toda hora custa mais em remoção do que refazer. O contrário
vale pro índice de colisores, que quase nunca se mexe — ali a inserção é uma
vez e o `moveu` é exceção.

**A ordem das peneiras é a regra, não detalhe.** Distância ao QUADRADO (sem
raiz), depois cone de visão (um `atan2`), e só então raycast — que é centenas
de vezes mais caro que os dois juntos. E os candidatos são ordenados por
distância e testados NESSA ORDEM, parando no primeiro que tem linha: o
resultado é o mesmo (o mais perto que se vê) com um raycast no caso comum, em
vez de um por inimigo. Medido: 14,01 ms de IA com 300 bots viraram 1,9–2,5.

**Sondar não acontece todo quadro.** O intervalo sai da distância ao olho do
jogador: 30 Hz perto, 10 Hz no meio, 3 Hz longe — e com sorteio no intervalo,
senão os trezentos caem no mesmo quadro e o custo que se queria diluir vira
pico. No quadro sem sondagem o alvo ANTERIOR continua valendo: zerá-lo faria
o bot piscar entre combate e avanço, e `semVer` acumularia tempo que não
passou. SEM olho — teste, bancada, antes do desembarque — todo mundo sonda
todo quadro, e é isso que a suíte mede.

**Reescrever a pose custa mais que pensar.** `rig.repousar()` reescreve os
dezenove ossos e o solavanco reescreve por cima, e isso rodava pros trezentos
corpos sessenta vezes por segundo: medido, `bot.update` era 3,71 dos 5,61 ms
de IA — mais que o cérebro inteiro. Bot sem detalhe posa a 8 Hz e anda igual;
o que se vê a duzentos metros é ele mudar de lugar, não a perna mudar de fase.

**`acharCobertura` varria o mapa inteiro.** Ela percorria os 5505 colisores
por bot por quadro — 1,6 milhão de caixas visitadas pra achar uma esquina a
catorze metros. `ListaDeColisores.emVolta` responde por vizinhança.

**Medir o minuto ZERO não é medir a partida.** A primeira bancada punha 300
bots nos seis postos e rodava noventa quadros: quase ninguém se vê, quase
ninguém atira, e ela dizia 3 ms. Com os dois times frente a frente a 70 m o
mesmo código dava 258 ms por quadro. O que trava é o TIROTEIO, e tiroteio só
aparece numa bancada que deixa a briga engrenar.

**O colisor do bot anda todo quadro, e é o único que anda.** Ele era reescrito
sem avisar o índice espacial, então a grade continuava apontando pro lugar
onde o bot NASCEU: o jogador esbarrava em bot que não estava mais lá e
atravessava o que estava, e as células de nascimento acumulavam trezentas
caixas mortas que toda consulta percorria. `moveu` só faz trabalho quando o
corpo muda de célula — sem essa guarda seriam seiscentos `indexOf` mais
`splice` por segundo.

**A bala também precisa do índice.** `wallHit` percorria os 5505 colisores por
bala por quadro: com 747 balas no ar são 4,1 milhões de testes raio-caixa, e o
quadro ia a 258 ms. `aoLongoDe` é um DDA de grade que visita exatamente as
células que o trecho cruza.

**E DDA não precisa de vizinha.** A primeira versão amostrava o trecho em
passos e pegava as oito células vizinhas de cada amostra pra não perder nada:
nove vezes mais células, com busca linear pra desduplicar. Era redundante — a
inserção já registra o colisor em TODAS as células que a caixa inflada toca,
então um raio que passa pela célula C só pode acertar caixa registrada em C.

**MAS o DDA pula a ÚLTIMA célula do trecho, e isso está aberto.** Medido em
`aoLongoDe`: um trecho de (0,4; 0) a (0,4; −9) sobre sete colisores em z ≈ −4
devolve ZERO candidatos. O culpado é o `if (proximoX > 1 && proximoZ > 1)
break;` no fim do laço — ele dispara depois de o passo entrar na célula nova e
antes de ela ser visitada, uma iteração mais cedo que o `cx === fimX && cz ===
fimZ` que já fazia o mesmo serviço. Na prática o trecho de um quadro tem 4,2 m
contra 32 m de célula, então quase todo trecho que cruza fronteira perde o
resto de si: a bala atravessa parede que esteja nos metros seguintes à
fronteira e só a acerta no quadro seguinte. **E é uma armadilha de TESTE antes
de ser de jogo**: o primeiro teste da lona passou verde por vácuo, porque o
probe de doze metros cruzava fronteira de célula e `blocked` devolvia falso sem
olhar colisor nenhum. Teste de parede tem que ser CURTO e dentro de uma célula
— ou ter a contraprova junto, que é o que pegou isto.

**Numa briga densa a grade não filtra nada.** Com 300 bots num quadrado de
100 m, todo mundo está dentro dos 78 m de visão de todo mundo: a consulta
devolve os 300. Por isso `avistar` guarda só os QUATRO mais perto em arrays de
tamanho fixo — a inserção ordenada na lista inteira fazia `splice` num array
de 300 por candidato. E o cone de visão saiu de `atan2` pra produto escalar,
que é a mesma raiz que a distância já precisava.

**Traçante vem de PISCINA.** Cada bala com risco criava uma geometria e um
material e os descartava ao morrer; com mil tiros por segundo são mil buffers
criados e destruídos na GPU por segundo, cada `dispose` custando sincronia de
driver. A geometria é uma só (o comprimento sai da escala) e o material é por
risco, porque a opacidade é dele.

**MEÇA O QUADRO INTEIRO, não os componentes.** A IA caiu de 14 pra 2 ms e o
quadro não melhorou na proporção, porque o render sempre foi maior e ninguém
tinha medido: com 300 bots são 3,39 ms só de matriz de cena e 7,63 ms de
travessia e recorte SEM desenhar um triângulo. Foi medindo o todo que
apareceram as armas no coldre, e é medindo o todo que se sabe de quem é a
conta agora.

**E software raster não é GPU.** A bancada roda em swiftshader, que rasteriza
em CPU: numa tela grande o número vira o custo de não ter placa. Ela mede em
320x180 e separa as duas coisas apontando a câmera pro CÉU — zero triângulo
transformado, e o que sobra é o trabalho de CPU, que é o mesmo em qualquer
máquina.

**Arma no coldre custa mais que o corpo inteiro.** Medido contando objeto na
cena: um bot eram 89 malhas — 27 de corpo e 62 de ARMA GUARDADA (MP40 32,
Colt 26, faca 4). Os três modelos nasciam no construtor e ficavam invisíveis,
e invisível não é de graça: o objeto segue na árvore e a matriz dele é
recalculada todo quadro. Hoje o modelo nasce quando a arma vai pra mão, e as
outras saem da árvore — só esconder deixava o bot acumulando um modelo por
arma que já sacou.

**Isso só aparece CONTANDO objeto na cena.** Duas análises concluíram "o
problema é o modelo, cada peça é um objeto" olhando o número 89 — e o GLB tem
36 primitivas. A conta não fechava, e o que faltava eram as armas.

**São TRÊS soldados de arquivo, e cada um existe por um motivo.**
`soldado-skinned.glb` é malha única com 19 ossos e pesos rígidos: é o dos
bots, e leva um corpo de 27 malhas pra 1 (4 com as marcas de time). O
`soldado-tpose.glb` tem as 36 caixas nomeadas e serve a duas coisas que a
malha fundida não pode fazer: medir a hitbox (`capacete_topo`, `cabeca`) e
ser o corpo em PRIMEIRA PESSOA, que remove a cabeça por nome pra que o
jogador não veja o próprio crânio por dentro. Ali é um corpo só, e 36 malhas
não custam nada.

**Hitbox não pode sair de agrupar vértice por OSSO.** Cabeça e capacete são
regiões separadas com dano diferente e as duas penduram no osso `head` —
medido, ele carrega 96 vértices, que são quatro caixas. E elas se sobrepõem
3,9 cm em altura (cabeça vai a 1,653 e o capacete começa em 1,614), o que já
é resolvido por `ORDEM`: empate vai pra mais valiosa.

**`clone(true)` de malha skinnada compartilha o `Skeleton`.** `SkinnedMesh.copy`
leva o esqueleto por REFERÊNCIA: as trezentas cópias apontariam pros mesmos
dezenove ossos e os trezentos bots posariam idêntico, no mesmo quadro.
`SkeletonUtils.clone` do three religa. A cópia caseira que fazia isso saiu:
ela casava osso por NOME e ligava com `matrixWorld`, e a de upstream casa por
IDENTIDADE e liga com o `bindMatrix` da malha, que é a matriz certa. Geometria
e material continuam compartilhados de propósito — só o esqueleto é por bot.

**`soldadoPronto()` devolve BOOLEANO, não promessa.** Uma bancada com
`await soldadoPronto()` passa reto, o GLB nunca carrega, e `createSoldier`
cai no soldado de reserva feito de caixas — a medida sai de um corpo que o
jogo não usa. Quem quer esperar chama `carregarSoldado()`.

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

**A hitbox é MEDIDA do modelo, não escrita à mão.** O artista nomeou cada
malha — `cabeca`, `capacete_topo`, `coxa_L`, `bota_L`, `torso` — e uma caixa
por malha nomeada bate com o desenho por construção. Medido: a hitbox e a
malha dão exatamente o mesmo intervalo, e não sobra altura descoberta. A
tabela à mão continua no código só pro teste, que roda sem arquivo nenhum —
e ela JÁ tinha desalinhado 8 cm na cabeça e 7,7 na coxa assim que o modelo
mudou, que é exatamente o que se previa dela.

**Regra de dano não pode depender de um `.glb` ter carregado.**
`usarMedidasDoModelo` injeta a fonte de fora: `game/hitboxes.js` continua sem
three e sem arquivo, e por isso continua testável.

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

**Trezentos bots sem pelotão são trezentas decisões que por acaso apontam pro
mesmo lugar.** O resultado é uma multidão andando por cima de si mesma até o
objetivo. Com pelotão, quem decide PRA ONDE é um só — o líder — e os outros
ocupam um lugar em volta dele. `pelotao.js` pensa a 2 Hz de propósito:
escolher objetivo e formação é decisão de minutos, e sessenta vezes por
segundo seriam dezenas de milhares de decisões idênticas.

**Formação é o que fazer ENQUANTO não há briga.** Combate cancela o slot: quem
está trocando tiro se move pela quina mais perto, não em cunha. E como um mapa
de dois quilômetros passa a maior parte do tempo fora de contato, a formação é
o que se vê quase sempre.

**Cada formação é uma troca, não um desenho.** Coluna tem frente estreita e
profundidade longa (mata, trilha, rua); linha é o contrário e é o assalto
final; cunha é o meio-termo de quem não sabe de onde vem o inimigo; quadrado
não é de andar, é de FICAR, e é o que faz atacar um posto já dominado custar
caro. A escolha sai do chão — `estradaAt` e `densidadeFloresta` decidem
coluna, a distância ao objetivo decide quadrado.

**E o slot 0 é o líder, na origem, em TODA formação.** A coluna zigue-zagueia
60 cm pra que uma rajada em enfiada não pegue a fila inteira, e isso quase
custou o líder fora do lugar dele — há teste pros seis nomes.

**Separação é o que impede corpo dentro de corpo.** A colisão barra quem
ENTRA, mas não afasta quem já está encostado, e `step` deixa passar quem está
preso — senão dois bots nascidos juntos ficariam travados pra sempre. O
empurrão de bando vem DEPOIS do movimento e é fraco: corrigir resíduo, não
decidir rumo. Medido: dois bots no mesmo ponto separam 1,58 m em um segundo e
meio.

**Alerta é POR EVENTO, não por quadro.** Varrer os trezentos procurando quem
ouviu um tiro seria o mesmo O(n²) com outro nome: o disparo empurra um aviso
na fila e uma consulta de raio na grade acha quem estava a 45 m. Quem já está
em contato não é distraído — ele já sabe onde o inimigo está.

**Levar tiro continua sendo cego; OUVIR tiro não.** O bot alvejado sem ver
ninguém varre o horizonte, e é isso que dá a vantagem a quem atirou primeiro.
Mas quem ouve o tiro que pegou o companheiro sabe a direção, e vira pra lá —
sem isso o pelotão continuava andando de costas enquanto um deles caía.

**Procurar é FLANQUEAR, não ir em linha reta.** Quem se cobriu está olhando
exatamente pra linha por onde foi visto pela última vez; chegar por ali é
entregar-se. O bot abre pro lado da última posição conhecida e fecha o arco
conforme se aproxima, com a arma apontada pra memória e não pro caminho.

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

**Ponto de captura não é posto militar.** Eram seis cercas de sacos de areia
idênticas, e a única diferença entre os pontos era o terreno em volta. Hoje
cada um é um LUGAR — praia invadida, casamata de encosta, vila, fazenda,
guarnição de ponte, moinho — e é a construção que decide como se briga ali. Os
quatro mastros continuam no miolo de todos, porque a captura é a mesma regra
em todo lugar.

**Bandeira dentro de parede não se captura, e isso estoura na montagem.** Uma
construção que avance sobre o quadrado de mastros deixa a bandeira
inalcançável, e o sintoma é um ponto que simplesmente não pode ser tomado:
nenhum erro, nenhuma pista, e a partida trava num objetivo impossível.
`assertFlagsClear` usa o mesmo teste do nascimento, e não por acaso — quem
captura precisa caber em pé ao lado do mastro pra segurar o F.

**Casa é OCA, e a porta é vão de verdade.** Uma casa maciça é só um obstáculo
mais caro que uma pedra; o que faz a Vila Central ser combate urbano é dar pra
entrar, atirar da janela e ser flanqueado por dentro. E isso NÃO se vê numa
captura de tela: a porta desenhada e a porta atravessável são a mesma imagem.
Há teste que anda por ela.

**Janela precisa de PEITORIL, senão é porta.** Sem ele todo vão desce até o
piso e a casa de quatro janelas vira a casa de quatro portas — o interior
deixa de ser um lugar em que se está e vira corredor com telhado. Com
peitoril, a bala passa e o corpo não, que é a diferença entre posição de tiro
e passagem. É o mesmo peitoril que faz a seteira do bunker ser seteira.

**A soleira enterrada come a altura da porta.** Construção assenta no ponto
mais BAIXO da pegada e enterra o resto (senão a casa rasga na ladeira ou fica
um vão por baixo do lado que desce), e medir o vão a partir da base da parede
perde essa diferença. Medido: porta dos fundos com 1,90 m declarados, 0,35 de
soleira, 1,55 de vão livre contra 1,70 de jogador — desenhada e intransponível.
`paredeComVao` recebe `soleira` e mede a verga a partir do PISO.

**Vão descentrado precisa de laterais DESIGUAIS.** Com `(largura - vão) / 2`
nos dois lados, deslocar a porta 1,6 m fazia a parede crescer 1,6 m pra fora
da casa de um lado. Cada lateral vai da borda da parede até a borda do vão, e
são bordas diferentes.

**Oitão não é pirâmide.** `PYRAMID` é um cone de quatro lados, simétrico nos
dois eixos do plano; oitão é triangular num eixo e FINO no outro. Medido: numa
casa de 11,4 m ele estourava 5,7 m pra fora de cada lado e a pegada saía com
22,5 m, quase o dobro. Três caixas encolhendo fazem o mesmo desenho e ficam
alinhadas aos eixos de quebra.

**Casa gira 0° ou 90°, e isso não é preguiça.** A colisão só entende AABB, e
uma casa a 30° viraria uma caixa envolvente muito maior que ela — parede
invisível no meio da rua, o mesmo problema do prop tombado na diagonal. Girar
meia-volta é trocar largura por profundidade, e continua exato. Há teste que
compara as duas pegadas com a MALHA.

**A cobertura do bunker tem que engolir TRÊS lados e deixar o quarto à
mostra**, e nenhum sólido simétrico faz isso. Duas tentativas erradas: três
lajes chatas por cima viraram uma pilha de panquecas marrom num morro verde, e
uma pirâmide larga o bastante pra cobrir o teto engoliu a seteira junto — vista
da praia, a posição de tiro deixou de existir. O que funciona é berma em
degraus nos flancos e no fundo, com a frente de concreto livre.

**Trigo e arbusto seguem a mesma regra: cobertura VISUAL, não blindagem.**
Atravessa-se andando e bala passa reto. Trigal que barrasse passagem viraria um
muro amarelo, e um que parasse tiro de 7,92 leria como bug. Há teste que conta
colisores contra tufos.

**E tufo de trigo é ESTREITO e alto.** Com 0,7 a 1,2 m de lado o trigal saía
como uma salada de caixotes amarelos com grama aparecendo no meio: o que faz um
trigal é a superfície contínua na altura do peito, não a peça.

**Casa não nasce em cima da estrada.** `estradaAt` é a mesma fonte que pinta o
chão — casa no meio da pista seria a rua prometendo um caminho que não existe.
E terreno muito torto recusa o lugar em vez de rasgar a casa nele.

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

**Munição só é recurso se acabar E se houver onde buscar.** Antes o carregador
acabava e não havia o que fazer: morrer devolvia tudo cheio de graça, então
gastar rajada não custava nada. Hoje o posto DOMINADO é paiol — perder posto
deixou de ser só perder spawn e passou a ser perder bala, e negar o ponto é
negar a munição de quem ataca. Posto em disputa não reabastece ninguém.

**`secou` é o gatilho pra ir buscar; nunca pra decidir quando PARAR.** Ele vira
falso na primeira bala que entra, e sem uma trava o bot largava o posto com
uma no bolso pra secar de novo dez metros à frente — a viagem inteira por
nada. Sair exige estar `abastecido`, que é outra pergunta.

**Carregador vazio não é ter secado.** O primeiro se resolve recarregando, e a
recarga do bot corre em qualquer estado. Secar é não ter em lugar nenhum, e é
só isso que manda ele pro paiol — ou pra faca, se houver inimigo colado. Ficar
apontando cano vazio é virar alvo parado; partir pra cima é uma decisão ruim e
é a única que sobrou, que é exatamente o que ficar sem munição deve custar.

**Trocar de arma procura CARREGADOR cheio, não reserva.** Aceitar reserva fazia
o bot ficar com a arma vazia na mão esperando o próprio recarregamento.

**A fração de reabastecimento ACUMULA antes de virar bala.** Cada quadro pede
0,3 × 1/60 da reserva — meia bala. Arredondando por chamada, meia vira uma e o
posto entregaria sessenta por segundo em vez de trinta por cento. O resto fica
guardado no próprio `ammo`.

**`reserveMax` e `loadedMax` são gravados uma vez, e não saem do `magazine`.**
A Colt tem sete no carregador mais uma na câmara: restaurar por `magazine`
devolvia uma bala a menos do que se começa a partida.

**A munição do jogador continua sendo a do MÓDULO, de propósito.** Clonar por
jogador seria mais limpo, mas o item na mão é comparado por IDENTIDADE em
vinte e três asserções — `equipped` tem que ser o mesmo objeto que `PISTOL`.
Trocar isso é mudança de contrato, não detalhe de munição. O que renascer faz
é `encherTudo`, não trocar de objeto.

**Caixa de munição não vai pra mão: apanhar é CONSUMIR.** Ela não tem slot,
então `takeCarried` a recusaria e ela ficaria no chão pra sempre. E quem já
está cheio não a consome — sem isso, o jogador com a reserva no teto some com
a caixa de que o companheiro ao lado precisava.

**O engradado é o SINAL do raio de suprimento, não a fonte dele.** A regra
sempre foi 24 m do MIOLO do posto, e passá-la a medir da pilha de caixas
parecia mais honesto: cria uma segunda coordenada por posto contra a qual o
`paiolMaisPerto` do bot (que mede até o posto) se separaria no primeiro ajuste,
muda em silêncio o número contra o qual `abastecido` e a ida ao paiol foram
calibrados, e joga fora o motivo dos 24 m — eles existem pra que reabastecer
NÃO dispute com capturar a mesma laje de dois metros. O que o objeto precisa é
não mentir, e pra isso basta estar bem dentro do raio: medido, os seis paióis
ficam de 10,2 a 13,1 m do miolo, e há teste que recusa qualquer um fora.

**Tratar é da TENDA, e essa assimetria é a regra.** Reabastecer são 24 m do
mastro porque é um toque de três segundos; tratar são 3,4 m da lona porque são
oito. Com o raio generoso, o pelotão inteiro se curaria defendendo o ponto de
dentro da cobertura e levar tiro deixaria de custar — um é passagem, o outro é
abrigo, e é por isso que só o segundo precisa de um objeto no meio. O raio é a
meia-diagonal da tenda (3,4 contra 3,56 m): a zona não passa do pano, senão
trataria quem está encostado do lado de fora atirando.

**Curar tem que custar mais do que morrer.** Medido nesta base, a 16 m e sem
revidar o jogador morre em 2,9 s; a tenda leva 7,9 s do quase-morto ao cheio, e
é de propósito mais lenta que os 3,3 s da munição — bala é consumível, vida é
você. Cura instantânea (ou de dois segundos) apaga o custo de levar tiro, que é
a única coisa que faz atravessar campo aberto ser uma decisão.

**A lona barra o CORPO e mais nada.** `balaPassa` no colisor é lona: a
balística pula esses colisores, e como `ballistics.blocked` é a MESMA função
que responde por linha de visão, o bot também atira por ali. É o arbusto ao
contrário — ele não barra nada e só tapa; ela barra só o corpo. Um pano que
segurasse 7,92 mm leria como bug, e uma tenda que escondesse viraria caixa de
invisibilidade com cura dentro: a enfermaria não protege de NADA, e é isso que
faz oito segundos deitado ali serem uma aposta. `acharCobertura` também pula
lona — bot atrás de um pano acreditando estar coberto é pior que bot no aberto,
porque ele para de se mexer.

**E levar tiro dentro da tenda INTERROMPE o tratamento.** Sem os 2 s de espera
(mais que o `SOB_FOGO` de 1,4 do bot) quem está sendo alvejado se curaria no
ritmo em que leva dano, e o pano viraria escudo pela porta dos fundos. O bot já
guarda `hurtFor` no corpo; o jogador não guarda nada disso, e em vez de
pendurar um campo novo nele, `criarTratamento` olha a vida CAIR e conta os
segundos — a mesma informação, vista de fora.

**`ferido` é gatilho pra ir; `tratado` é permissão pra sair.** Terceira vez que
este par aparece nesta base (`secou`/`abastecido`, e agora a vida): `ferido`
deixa de valer no primeiro ponto que entra, e sem a trava o bot largava a maca
com 66% pra voltar ferido dez metros à frente — a viagem inteira por nada. Há
teste que prova a faixa do meio: aos 70 de 100 ele não está ferido, não está
tratado, e continua na maca.

**Tenda ou engradado dentro de geometria estoura na MONTAGEM.** Mesma família
da vaga do jipe e da bandeira na parede, e o sintoma sem ela é uma enfermaria
que o jogador vê e não consegue usar — nenhum erro, nenhuma pista. A
conferência é a do NASCIMENTO (`spawnIsClear`) no miolo E na porta, e roda
DEPOIS do cenário do lugar: antes dele, ela passaria verde com a tenda dentro
de uma casa. A mensagem diz a coordenada, porque o conserto é no mapa.

**A tenda e o paiol saem de UMA coordenada por lugar.** O paiol fica 4,6 m
adiante da tenda na direção do miolo, e é isso que garante de graça que ele
caia dentro do raio de suprimento — e que a logística fique num canto só do
ponto: quem sabe onde se cura sabe onde se reabastece. Duas tabelas seriam duas
verdades sobre o mesmo canto.

**Tenda gira 0°, 90°, 180° ou 270°, e a porta olha pro miolo.** Mesma razão da
casa: a colisão só entende AABB, e uma tenda a 30° vira parede invisível a
metros da lona. Entrada virada pro mato faria dar a volta na tenda sob fogo. E
o SINAL da inclinação do telhado sai do deslocamento JÁ GIRADO, não do lado
local — com meia-volta, o girar inverte o eixo e a água tombava pro lado
contrário do beiral. Há teste que entra pela porta com a tenda girada, porque
um erro de sinal ali entrega uma tenda que não se entra, sem erro nenhum.

**O mapa do M não é pausa.** Ele solta o mouse (marcar ponto é clicar) mas o
jogo continua correndo atrás, e é isso que faz abri-lo no meio de um tiroteio
ser uma decisão em vez de um botão grátis. Quem tranca e destranca o ponteiro
continua sendo só `flow.js`, e há uma trava pra que o `unlock` que ele mesmo
provoca não vire tela de pausa.

**A bússola respondia a pergunta errada.** Saber que o norte é ali não ajuda
quem precisa saber onde fica o ponto 3 — o jogador tinha que abrir o mapa ou
decorar o radar pra traduzir rumo em objetivo. Hoje os ícones deslizam pela
fita, e virar a cabeça já é a resposta. São QUATRO telas com o mesmo símbolo:
mapa grande, radar, mapa tático e bússola.

**A fita virou três faixas, e a ordem delas é leitura.** Ícones em cima, rosa
dos ventos no meio, riscos embaixo — o olho bate no objetivo e só desce pro
grau se precisar do número. Invertido, a régua vira ruído por cima da
informação. Nos 34 px originais o ícone ficava por cima da letra do rumo e
nenhum dos dois se lia.

**O posto da VEZ vem destacado.** A frente anda em ordem e só um ponto pode ser
mexido: com os seis desenhados igual, a bússola diz onde tudo está e não diz
pra onde ir.

**Objetivo fora da fita ENCOSTA na borda**, como no radar — e aí quem colide é
empurrado pra dentro. Sem isso, virar a cabeça pro lado errado empilha três
objetivos no mesmo pixel e nenhum é legível, que é o mesmo que não mostrar
nada, só que com tinta. E a distância some no ícone preso: ali ela mentiria
por omissão, porque o ponto não está naquela direção, está além dela.

**A POSIÇÃO entra na conta de "o rumo mudou".** O canvas só é redesenhado
quando alguma coisa muda, e os ícones deslizam quando o jogador ANDA, não só
quando ele vira a cabeça — sem isso a fita congelava com os objetivos no lugar
errado enquanto ele corria reto.

**Três telas mostravam o ponto de captura de três jeitos.** Círculo no mapa
tático, losango no radar, outro círculo no mapa grande — e o comentário do
radar já prometia "mesma leitura do mapa tático" enquanto desenhava outra
coisa. `ui/simbolos.js` é o desenho, e a promessa passou a sair de uma função
só.

**O símbolo conta a PARTIDA, não lista objetivos.** Disco cheio no tom de quem
manda, número no meio, e um anel de progresso em volta enquanto está sendo
tomado. De relance se vê que o ponto 3 está em 60% e virando pro outro lado, e
é isso que faz alguém largar o que está fazendo e correr pra lá.

**O anel conta a captura INTEIRA, não cada metade.** A bandeira antiga desce
até o meio do mastro e só então a nova sobe: como duas barras separadas, o
anel voltaria a zero no meio da captura e quem olhasse acharia que alguém
tinha revertido. Arriando vai de 0 a 0,5 e içando de 0,5 a 1.

**Esmaecido apaga o MIOLO, nunca o dono.** Na tela de deploy, posto onde não dá
pra nascer é desenhado apagado — e apagar o traço junto sumia com a cor do
time. O mapa passava a dizer "não dá pra nascer aqui" e deixava de dizer de
quem é o ponto, que é a informação mais importante que ele tem.

**`undefined` e `null` não são a mesma ausência.** No símbolo, `undefined`
quer dizer "descubra o dono" e `null` quer dizer "de ninguém". O mapa tático
calculava por fora e passava `undefined` pras zonas de base sem time — que
virava "descubra", e descobrir chamava `postOwner(undefined)`.

**Legenda que mostra outro símbolo é pior que legenda nenhuma:** ela ensina a
procurar a coisa errada. O tracejado de "contestado" virou arco quando o
símbolo virou arco.

**Marcação é o único plano que o jogo oferece.** Não há voz nem esquadrão com
nome; num mapa de dois quilômetros, dizer "é ali" pra si mesmo é o que sobra.
Por isso ela aparece no mapa grande E no radar, encostando na borda como os
postos — marca que some da tela deixa de ser plano e vira lembrança. São
quatro no máximo: com vinte pontos, nenhum quer dizer nada.

**Canvas de mapa se dimensiona pela ALTURA.** `max-width` sozinho nunca faz o
canvas crescer além dos 260 px nativos — ele ficava do tamanho de um selo. E
`width: 100%` estourava a linha pra baixo e punha o rodapé em cima do mapa. Com
a linha em `minmax(0, 1fr)`, `height: 100%` resolve contra a janela e o
`aspect-ratio` dá a largura — esticar mentiria sobre distância, que é a única
coisa que um mapa promete.

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

**A física do veículo não conhece three.** `veiculos/fisica.js`, `roda.js`,
`atitude.js`, `casco.js` e `dano.js` são matemática pura: dá pra dirigir o jipe
inteiro num teste, sobre um terreno de mentira, sem montar ilha nenhuma. O
mundo entra por duas funções — `sondar(x, z)` diz altura, tipo e gradiente do
chão, `barrado(x, z)` diz se o corpo cabe ali. Mesma regra de
`game/capture.js`.

**Nada de `position += forward * speed`.** O fluxo é entrada → motor → rodas →
forças → corpo, e é isso que dá inércia sem existir uma linha chamada
"inércia". Cada roda é resolvida por conta própria e o corpo só soma o que as
quatro mandaram: é essa separação que faz o comportamento EMERGIR. Roda no ar
não tem carga, sem carga não tem atrito, sem atrito não tem tração nem curva —
e é o mesmo código que faz subida com pneu furado ficar difícil e capotamento
acontecer.

**`collider`, e não `colisor`: é NOME DE CONTRATO.** A balística monta a lista
de caixas a ignorar com `target.collider`, como faz com o soldado. Com o nome
traduzido ela não encontrava nada, a caixa do próprio jipe virava parede, e a
bala morria 15 cm antes de chegar no pneu. Medido: oito tiros de doze metros,
zero acertos registrados, e nada no console. O contrato de alvo é em inglês
(`alive`, `feetY`, `body`, `damage`, `radius`) — traduzir uma peça dele quebra
em silêncio.

**Subir custa porque o apoio é PERPENDICULAR ao chão, não vertical.** Sem a
componente horizontal da carga, a ladeira não oferecia resistência nenhuma ao
avanço: medido, o jipe subia uma rampa de 80% a 55 km/h, com força que não vinha
de motor nenhum. `carga · gradiente` na estática dá exatamente `peso · tan(θ)`,
que é a conta certa — e é por isso que `sondar` devolve o gradiente junto da
altura.

**E o gradiente é medido no passo do TERRENO, não em milímetros.** A malha tem
2,5 m por vértice; amostrar em 1 mm devolve a curvatura do ruído no vértice em
vez da ladeira, e o veículo tremeria em chão liso.

**O sinal da transferência de peso sai de τ = r × F, e eu errei o da rolagem.**
Empurrar a base pra esquerda joga o topo pra direita, ou seja LEVANTA o lado
esquerdo. Com o sinal trocado o peso ia pra roda de DENTRO da curva — medido,
5625 N na dianteira esquerda numa curva à esquerda contra 755 N na direita, o
oposto do que qualquer carro faz — e como carga é o que limita atrito, a curva
ficava errada inteira sem nada parecer errado.

**Capotar não é um limiar, é um pêndulo invertido.** A gravidade em torno do
apoio é `+m·g·h·sen(rolagem)`, instável em zero e estável em π. Aprumado as
molas vencem com folga (0,65 m de meia-bitola contra 0,62 m de CG); com as
rodas de um lado no ar não há mola nenhuma pra vencer, e o tombo termina
sozinho. Por isso encostar de leve numa pedra não capota nada, e uma valeta a
50 km/h capota.

**E é por isso que o µ do asfalto é 0,85, não 1,0.** O limiar de tombamento
deste veículo é 1,05 g: pneu que agarra 1,0 põe o jipe em cima do limiar em
QUALQUER curva de pista seca, e capotar deixa de dizer alguma coisa. Pneu
diagonal de 1945 sobre macadame faz 0,7 a 0,85 mesmo.

**O casco resolve TODOS os cantos enterrados, não o mais fundo.** Um canto só é
uma mesa de uma perna: qualquer força que ele devolva gira o veículo em torno
dele, e um jipe de barriga pra cima nunca chega ao repouso. Medido com um
canto: ele girava cada vez mais rápido e DECOLAVA 13,6 m. Com os quatro do teto
encostados, o corpo tem em que se apoiar e para deitado.

**E o braço do momento é o canto GIRADO, não o local.** `tRoll` e `tPitch` são
momentos em torno dos eixos do corpo, e o braço tem que estar no mesmo sistema.
O braço local funciona aprumado e INVERTE de sinal deitado: medido, um jipe de
barriga pra cima se aprumava sozinho em três segundos, porque o canto que
sustentava recebia momento pro lado contrário do que a geometria manda.

**O amortecedor do casco olha a velocidade DAQUELE CANTO.** Com a velocidade do
centro, a mola de contato respondia 20 kN num braço de 1,7 m — 35 kNm sobre uma
inércia de 350 — e o amortecedor não via rotação nenhuma pra frear. A
velocidade do canto inclui `ω × r`, e é ela que faz o tombo acabar.

**Veículo nasce ALINHADO com o chão.** Posto com caimento zero numa ladeira de
40%, a roda da frente nasce meio metro dentro do barranco: o batente responde
com 58 kN — cinco vezes o peso do jipe — e o que se vê é ele explodir pra cima
girando. `assentar` sonda as quatro rodas, que é a mesma fonte que a suspensão
usa no quadro seguinte.

**Mola e casco têm TETO de força, e penetração funda sai por POSIÇÃO.** É a
mesma família do de cima: nenhuma mola devolve um metro de penetração sem
arremessar o corpo. Teto de algumas vezes o peso, e a sobra é corrigida movendo
o veículo pra fora do chão, que é o que todo solucionador de contato faz.

**O passo da física do veículo é FIXO em 1/120.** A mola de 34 kN/m sob 1130 kg
oscila a 10,4 rad/s e o batente é sete vezes mais rígido: com o delta do quadro
(que chega a 0,1 s vindo de aba em segundo plano) a suspensão explode no
primeiro buraco. É a mesma razão da integração trapezoidal do pulo — o veículo
tem que andar igual em qualquer framerate.

**A hitbox do veículo é MEDIDA da malha, como a do soldado.** Escrita à mão,
ela passou por uma suíte verde inteira estando 28 cm ACIMA do jipe, 10 cm atrás
dele, com o piso 6 cm dentro das rodas e o motor passando da grade — e a caixa
da ficha (`MEIA_LARGURA` 0,78, `MEIO_COMPRIMENTO` 1,70, uma `ALTURA_CAIXA` de
1,35 que não correspondia a nada) levava o COLISOR junto, ou seja parede
invisível no ar. Medido no `.glb`: x ±0,84, y 0 a 1,46, z -1,60 a 1,66. Nada
disso aparece num teste que confere se a caixa existe; aparece comparando com
`Box3.setFromObject`, e aparece ligando o F2 e vendo o desenho não encostar no
veículo.

**A caixa do pneu não pode ficar DENTRO da caixa da carroceria, e um AABB só
recria o problema.** A roda do MB fica FORA da lataria, mas o chassi medido vai
a ±0,84 — que é a ponta do para-lama. Uma caixa nessa largura engole os quatro
pneus: oito tiros mirados no pneu, todos registrados como "carroceria", e furar
pneu era impossível. E `ordem` não salva — empate vai pra mais valiosa, e
aquilo não era empate, era ordem de ENTRADA. São duas caixas: a lataria
(±0,66, alta) e o para-lama (±0,84, e ACIMA do pneu — ele começa em 0,82 e o
pneu acaba em 0,78). Entre as duas a roda fica exposta de lado, como fica de
verdade.

**Motor e tanque continuam escritos à mão, mas RECORTADOS no chassi.** A malha
é fundida e não os nomeia, então não há o que medir. O recorte é o que impede
eles de sair do desenho sozinhos quando alguém mexer no modelo.

**Atropelar é velocidade de APROXIMAÇÃO, não colisão.** Roda encostando num
soldado a 3 km/h matando ele faz o jogador perder a vida sem entender o que
houve, e faz o motorista matar o próprio time só de estacionar. São três
faixas: até 5 km/h empurra, até 15 derruba, acima disso mata. E é a PROJEÇÃO da
velocidade na direção de quem é atingido — pelo módulo, um jipe passando
raspando a 60 km/h mataria quem está parado ao lado dele.

**Quem sabe se mexer sabe ser EMPURRADO.** `empurrar(dx, dz)` fica no alvo e
não em quem empurra, porque só ele sabe mover o próprio corpo. Alvo que não
sabe — poste, boneco de treino — simplesmente não tem o método, e não sai do
lugar.

**Dirigindo, `player.update` NÃO roda.** Ele resolveria postura, locomoção e
colisão pra um corpo que não está andando, e no fim do quadro `view.js`
reescreveria `camera.position.y` por cima do assento. Quem escreve a câmera de
dentro do jipe é `veiculos/vista.js` — e `ui/watchdog.js` sai fora também,
senão ele acusa "preso dentro de geometria" a cada quadro, com razão.

**A rolagem da câmera de dentro vai pelo euler YXZ, nunca por
`camera.rotation.z`.** É o primeiro invariante desta base cobrando de novo:
`camera.rotation` decodifica o quaternion em XYZ e o PointerLockControls compõe
em YXZ, então escrever `rotation.z` lê yaw e pitch errados e reescreve os três
na ordem errada. O sintoma não é a rolagem errada — é a câmera VIRANDO DE
CABEÇA PRA BAIXO em certos ângulos de olhar, dentro do veículo. `player/view.js`
já fazia certo com um `Euler(0, 0, 0, 'YXZ')` de módulo; a vista do veículo
passou a fazer igual, e `aprumarVista` existe porque `camera.rotation.z = 0`
cai na mesma armadilha ao descer do jipe.

**Quem está no volante segura o VOLANTE, não a arma.** E não era só feio:
`viewmodel.update` não roda pra quem dirige, então a arma CONGELAVA na última
pose no meio da tela. O item é escondido e não removido — descer do jipe
devolve a mesma arma na mesma pose, e `setItem` reconstruiria o modelo por
nada.

**E o SINAL do giro sai da geometria, não do gosto.** Giro positivo em torno do
eixo medido leva o topo do aro pro +X, que é a esquerda do veículo — o mesmo
lado pra onde o esterço positivo vira. Eu aplicava o negativo, e volante e mãos
giravam CONTRA o movimento. Nenhum teste pegava: "o aro mexe" e "a mão cai no
aro" continuam verdes com o volante girando ao contrário. O que pega é a
DIREÇÃO — virar à esquerda baixa a mão esquerda, como quem puxa um volante sem
direção assistida.

**As mãos saem do ARO do volante, e por isso giram com ele de graça.** O alvo
da IK é um ponto no sistema do volante levado pro espaço da câmera pela matriz
da câmera do jogo — é o caminho da boca do cano ao contrário. Nenhuma linha diz
"gire as mãos junto".

**Mas ponto do MUNDO não pode ser copiado cru pra cena do viewmodel.** Ela tem
câmera própria, com 42° contra os 70° do jogo — que é justamente o que
desacopla o tamanho da arma na tela do FOV. Medido: o aro fica a 24° do eixo e
o quadro do viewmodel acaba em 21°, ou seja as mãos não apareciam NEM NA TELA.
Mantendo a profundidade e escalando x e y por tan(42/2)/tan(70/2), o ponto passa
a projetar exatamente onde o original projeta na câmera do jogo.

**E a prova disso é em coordenada de TELA, não em metros.** Nenhuma medida em
metros diria que a mão está no volante: são duas câmeras diferentes desenhando
as duas coisas. O teste projeta cada uma pela câmera que a desenha e compara —
e exige que o aro esteja LONGE do centro, senão a comparação é entre dois
pontos no meio da tela e passa verde estando errada. Aconteceu: eu havia
esterçado o volante antes de medir, o ponto de nove horas subiu pro topo do
aro, e as duas projeções caíram no centro.

**Dirigindo, o corpo em primeira pessoa sai de cena.** Ele é posado EM PÉ, e um
corpo em pé dentro de um assento fica com as pernas enfiadas no assoalho e o
tronco meio metro alto. Quem aparece na tela nesse caso são as mãos do
viewmodel, que vivem no espaço da câmera e não precisam de corpo nenhum.

**E `?olho=` esconde o viewmodel de propósito** — a câmera vai pra onde o
jogador não está, e arma flutuando ali lê como bug. Dirigindo é o contrário: a
câmera ESTÁ no assento, e é a mão no volante que se quer fotografar. Foi isso
que fez duas capturas seguidas parecerem "os braços não apareceram".

**A câmera de dentro segue o GIRO, e só o giro.** Sentado, quem vira é o
veículo levando a cabeça junto: sem isso, dirigir em curva faz o mundo rodar em
volta de uma cabeça parada e o jogador corrige com o mouse a cada curva. O
caimento e a rolagem do OLHAR ficam de fora — virar a cabeça do jogador junto
com a carroceria é o caminho mais curto pra enjoar alguém. Mas a POSIÇÃO do
olho vem do nó do assento, que é girado pela rotação completa: o olho dipa numa
frenagem e sobe numa lombada sozinho, sem código nenhum pra isso.

**Alcance pra entrar é medido do CENTRO, e tem que passar do COLISOR.** Na
ponta do jipe o colisor mantém o jogador a 2,1 m do centro (1,7 de carroceria
mais 0,4 de raio de corpo): com o alcance em 2,6 sobrava uma faixa de meio
metro pra acertar, e chegar pela frente do capô parecia que o E não
funcionava. Pela lateral são 1,18 m e ali sempre houve folga — o defeito só
aparecia num dos dois lados.

**Assento é DADO DE JOGO; o modelo só o desenha num lugar mais preciso.** Sem
`.glb` carregado, `olhoDoAssento` devolvia a origem: o jogador sentava no ponto
zero do mapa, a mil metros do veículo, sem nada no console. Hoje ele cai na
ficha, que declara o x e o z de cada lugar — e é isso que deixa a suíte dirigir
o jipe sem carregar arquivo nenhum.

**`lerComandos` entra por FORA do gerente.** O veículo não sabe quem o dirige:
um bot que aprenda a dirigir vai produzir o mesmo objeto de comandos, e a
física não vai notar. É também o que deixa a suíte dirigir sem teclado — em
headless não há tecla pra apertar, e sem isso a única coisa testável seria o
veículo parado.

**S é freio E ré na mesma tecla, e quem decide é a velocidade.** Duas teclas
separadas obrigariam a soltar uma pra apertar a outra no meio de uma manobra.
Sem o limiar, apertar S a 40 km/h pedia ré e freio ao mesmo tempo e o veículo
arava o chão sem parar.

**O E é DISPUTADO, e quem consome é quem tem o que fazer com a tecla.** Duas
metades, e a primeira versão só tinha uma: `veiculos` só consome o E com um
veículo ao alcance, mas `items/drop.js` consumia SEMPRE — e como ele rodava
antes no laço, apertar E ao lado do jipe não fazia absolutamente nada. Hoje o
veículo roda primeiro (primeira recusa) E o apanhar só lê a tecla com item ao
alcance: qualquer uma das duas resolve, e as duas juntas sobrevivem a um
terceiro pretendente.

**E o teste que ficou verde durante esse bug chamava `embarcar()` por código.**
Mesma lição do tiro que só é prova quando começa no clique: teste que não
começa na TECLA não prova que a tecla funciona. Há um em `jipe` que dispara
`KeyboardEvent` de verdade, e um em `drop` que prova que o E sobrevive quando
não há nada pra apanhar.

**O para-brisa do arquivo não era moldura com vidro: eram duas caixas
MACIÇAS.** Uma laje olive de 46 cm de altura e um painel escuro por cima dela,
sem vão nenhum — sentado no volante, o jogador via uma parede ocupando a tela
inteira. Nenhuma medida de hitbox ou de física diz nada sobre isso, e a foto
de fora fica idêntica: é a mesma família da porta desenhada que não é
atravessável. Hoje a laje é RECORTADA da malha no carregamento e uma moldura
com vidro translúcido entra no lugar, montada em código como a bandeira do
time é montada no soldado.

**E o corte é por COMPONENTE CONEXA, não por caixa.** A antena passa a 2 cm da
laje (x 0,63 contra 0,65) e nenhum filtro de posição separa as duas. Mas
atenção: a solda que fundiu o modelo dedupa por (posição, normal FACETADA,
uv), e duas faces da mesma caixa têm normais diferentes — então componente
conexa é uma FACE, não uma peça. Medido: a laje sai em seis componentes de dois
triângulos. Achando as faces LARGAS (1,30 m de vão, altas, na frente do banco)
e depois tudo que está DENTRO da caixa delas, saem os 24 triângulos certos —
laje e painel — e a antena fica. Só pelas faces largas saíam 8, e as talas
laterais ficavam pra trás.

**O volante gira em torno do PRÓPRIO eixo, e esse eixo não é o Y.** O modelo
faz o volante como um cilindro deitado pra trás; girar em Y inclina o disco pro
lado em vez de rodá-lo, e o que se vê dirigindo é o volante TOMBANDO. Medido:
64° de desvio da normal do disco. E o ângulo não pode ser escrito à mão —
escrevi (0, -sen50, cos50), que é o que o script do modelo parece dizer, e
continuou errado. As NORMAIS da malha respondem sem chute: as duas faces
chatas do disco são as mais numerosas, e a normal delas é o eixo.

**E caixa envolvente NÃO prova giro.** `Box3.setFromObject` gira a CAIXA, não
os vértices: ela cresce 107% num giro perfeitamente correto. Foi essa medida
errada que quase me fez desfazer o conserto do volante. O que prova é a NORMAL
do disco — um giro no próprio eixo não mexe nela, qualquer outro eixo mexe — e
o teste tem a contraprova junto: o jeito errado tem que FALHAR o mesmo teste,
senão o teste não está medindo nada.

**Vidro sem `depthWrite: false` esconde o mundo.** Um painel transparente que
escreve profundidade apaga tudo que é desenhado depois dele: olhar através de
um vidro que não deixa ver é pior que a laje que ele substituiu.

**E o teste disso é um RAIO do olho do motorista.** "Nada opaco na frente do
rosto, e um painel de vidro" em três direções, mais "o capô continua ali
olhando pra baixo" — porque um recorte largo demais tira a carroceria junto e a
vista fica ótima por acidente.

**Onde há veículo é decisão do MAPA, não da fiação.** `world.garagem` é a
mesma ideia de `world.arsenal` e `world.spawnZones`: quem conhece o terreno é
quem escolhe o lugar, e `main.js` só percorre a lista. Sainte-Mère põe um jipe
em cada base; o campo de treinamento põe um ao lado da linha de tiro.

**Vaga bloqueada estoura na MONTAGEM**, como bandeira dentro de parede.
Veículo que nasce dentro de uma casa fica preso pra sempre, e o sintoma é um
jipe que simplesmente não anda — nenhum erro, nenhuma pista. E a mensagem diz
a coordenada, porque o conserto é no mapa e não no veículo.

**No treino o jipe fica FORA da raia e ATRÁS da linha de tiro.** O campo é o
lugar certo pra aprender a dirigir — plano, medido, sem ninguém atirando de
volta —, mas veículo parado na frente dos alvos transforma a raia de 140 m numa
raia de 12. E ele fica dentro da plataforma achatada: fora dela nasceria numa
ladeira, e a primeira coisa que faria era descer sozinho.

**O colisor do veículo NÃO é `standable`.** Seria bonito subir no capô, mas o
veículo lê a altura do chão com `groundHeightAt`, que não sabe ignorar um
colisor: o jipe acharia o próprio teto e subiria em si mesmo, quadro após
quadro.

**Suíte com `while` por velocidade tem que ter TETO de quadros.** Um laço
esperando uma velocidade que o veículo não alcança (ladeira íngreme, pneu
arrebentado, parede à frente) trava a página inteira, e a suíte não falha — ela
fica em "rodando…", que é o pior jeito de quebrar porque não diz onde.

**`?jipe=x,z&dirigir=1` em `tools/screens-shot.html`** põe um veículo no mapa e
senta o jogador no volante. É o único jeito de fotografar a vista de dentro:
ela é escrita pelo assento, e `?olho` não vale ali. E a página espera o `.glb`
com `await carregarJipe()` — sem isso `jipePronto()` é falso, o veículo existe
na física e não aparece na foto.

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

**O jogo não pede tela cheia; F11 é do jogador.** O padrão é janela. O
Keyboard Lock — que é o único jeito de Ctrl+W e Ctrl+T não fecharem a aba no
meio de um tiroteio — exige tela cheia, então ele só entra QUANDO ELA JÁ
EXISTE: `grabKeyboard` sai fora se não houver `fullscreenElement`, e
`releaseKeyboard` nunca chama `exitFullscreen`, porque tirar alguém de uma
tela cheia que ele mesmo pediu é desfazer escolha que não é nossa. O
interruptor de tela cheia saiu da pausa junto — decisão que o navegador já
oferece não precisa de caixinha no HUD.

**Dublê de `controls` sem eventos esconde metade do fluxo.** O falso de
`tools/screens-shot.html` tinha `addEventListener() {}`, e é `unlock` que faz
`flow.onUnlock` abrir a pausa: a tela de pausa só era alcançável pondo a
classe na mão, ou seja testando um caminho que o jogo não faz. Hoje o dublê
guarda os ouvintes e `lock`/`unlock` disparam, e `?tela=pausa` abre a pausa
soltando o mouse, como no jogo.

**Entrar no mapa por código é `enterMap`, não clicar em Desembarcar.** A
página de captura clicava no botão com `spawnZones[0]` escolhida — que é a
base INIMIGA, recusada pela regra de spawn. O botão fica desabilitado, o
clique não faz nada, e a página compensava escrevendo `alive` e `spectating`
na mão: o jogo PARECIA montado e a fase continuava em deploy. A pausa nunca
abria por causa disso, três camadas longe da causa. `enterMap` filtra pelas
zonas válidas e passa por `deploy()`.

**`dev.sh syntax` não olha o script inline das páginas de ferramenta.** Ele
parseia os módulos de `src/`; um `}` órfão dentro do `<script type="module">`
de `tools/screens-shot.html` passou verde na suíte inteira e só apareceu como
`Uncaught SyntaxError` no console. Depois de mexer nessas páginas, rode
`dev.sh errors` nelas.

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

**`--dump-dom` volta antes da conta terminar, e o `console.log` do Chrome não
chega no stderr deste build.** Duas bancadas escritas e duas descartadas: a que
imprimia no console não devolveu uma linha com `--enable-logging=stderr`, e a
que escrevia num `<pre>` foi fotografada em "rodando…". O que funciona pra medir
render é `dev.sh shot` e comparar os PNG em Python; pra medir matemática pura, é
importar o módulo em NODE direto — `vendor/three/three.module.js` carrega lá, e
`PlaneGeometry` e `BufferGeometry` não precisam de WebGL.

**Foto de antes e depois tem que ser TIRADA costas com costas.** Duas capturas
do mesmo URL com horas de diferença deram média 99 e 117 no mesmo recorte de
chão, e eu quase concluí que um multiplicador que só escurece tinha CLAREADO o
mapa em 17%. A página não é determinística entre execuções distantes; o par só
vale medido em sequência, com uma variável trocada entre os dois disparos.

**E câmera de captura tem que estar OLHANDO pro que se quer medir.** As três
primeiras medições do grão foram feitas debaixo d'água: `olho=0,2.6,140` cai
dentro do rio, e a metade de baixo do quadro era o plano azul da lâmina. Média e
desvio idênticos aos centésimos entre antes e depois não eram bug do grão, eram
água. Sondar `heightAt`/`tipoDoChao` em Node antes de escolher a coordenada
custa uma linha e evita três capturas de quatro minutos.

## Convenções

- Código e comentário em pt-br. Comentário explica **por quê**, não o quê.
- Sistemas do jogador são funções que recebem a instância (`updateStance(player, delta)`),
  não métodos privados: o estado é público de propósito.
- `config.js` guarda número de ajuste; a classe sobrescreve o que declarar em
  `movement`, e herda o resto.
- Nada de CDN. `vendor/` é local pra o ciclo de teste ser rápido e offline.

## Estado atual

Cada ponto de captura é um lugar construído: a praia tem arame farpado,
ouriços, cabanas e fogueiras de quem já subiu; a colina tem uma casamata de
concreto com seteira, coberta de berma; a vila tem igreja de torre e treze
casas de pedra ocas, em quatro tamanhos; a fazenda tem celeiro, casas e dois
talhões de trigo alto; a ponte tem casa de observação e guarnição; e o moinho
tem torre com pás girando e um cercado vazio.

E cada um dos seis, mais as duas bases, tem um canto de logística: uma tenda de
lona com cruz vermelha e duas macas, e ao lado dela uma pilha de engradados de
munição sobre estrado. O engradado marca onde se reabastece — a regra continua
sendo 24 m do miolo do posto — e a tenda É a zona de cura: dentro dela a vida
volta em 7,9 s, do quase-morto ao cheio, e só num posto que o time domina em
paz. A lona não para bala nem linha de visão: a enfermaria esconde a arrumação
e não protege ninguém, e levar tiro lá dentro interrompe o tratamento. São 16
colisores por canto, 128 no mapa. O bot usa os dois: sem bala vai ao paiol, com
menos de 65 de vida vai à maca, e nos dois casos só larga o lugar quando está
cheio.

O rio corre com água no fundo de um vale verde, atravessado por três pontes de
concreto com pilar no leito. Uma malha viária pintada no chão liga os seis
pontos e as duas bases — asfalto na rota principal, caminho de terra nos
flancos — e toda travessia do rio cai numa ponte. O céu é encoberto, gerado no boot com o mesmo
ruído do relevo, e a luz é difusa como num dia de nuvem fechada.

O mapa não acaba mais numa reta. Antes o quadro era CORTADO a 400 m — o plano
distante era mais curto que a névoa, e o terreno terminava com 71% da cor dele
ainda na tela, com o pixel saltando 233 níveis de uma vez. Hoje o plano distante
sai da névoa (1100 m) e, além do quadrado jogável, um anel de relevo FALSO de
1110 m de largura fecha o horizonte: cristas de até 121 m que passam do olho de
quem está em pé no planalto, cobertas de mata na cor porque ali não cabe árvore,
e mar aberto ao norte, onde o Canal se dissolve na bruma. Ele sai do mesmo
`noise.js` e da mesma `naturalHeight` da ilha, então a costura fecha em 0,00 m —
e uma banda de transição emenda o passo de 2,5 m do terreno no de 25 m do anel
sem deixar aresta livre, que era por onde o mar aparecia numa fenda. O anel é
inalcançável (o jogador está preso em 999 m), não tem colisor, não é pisável, não
recebe pazada e não entra em `heightAt`: são 47.880 triângulos e 2 objetos, 3,74%
do terreno jogável, cobrindo três vezes e meia a área do mapa. O campo de
treinamento ganhou o mesmo anel, com metade da altura de serra porque o chão dele
está a 4 m.

A floresta nasce em manchas, não salpicada: uma máscara de ruído reparte o
mapa em campo aberto (30%), arvoredo, bosque, mata e mata fechada (8%), e as
4200 árvores — folhosa e pinheiro, em três portes — se concentram nas duas
últimas. Campo aberto é
campo aberto de verdade — 105 m até a árvore mais próxima no p95.

Funciona: movimento (andar, correr como alternância no Shift, agachar em C,
deitar em Z, pulo com coyote time e buffer) com fôlego que a corrida e o pulo
gastam e a arma na mão encarece, natação, mapa de ilha com praia,
floresta e duas bases militares opostas, campo de treino, seleção de classe,
faca KA-BAR como modelo e viewmodel, e o HUD (bússola, situação, vitais, item).

Q e E inclinam o corpo pra fora da cobertura, e isso é mecânica: o olho anda
25,6 cm pro lado (14,3 agachado), a boca do cano vai com ele, a hitbox
acompanha e contra parede inclina só o que cabe — com parede a 50 cm sobram 25%
da manobra, e a 42 cm não sobra nada. Sai em 0,18 s e recolhe em 0,13. Deitado,
nadando, no ar e correndo não inclina — é parar na quina que a manobra cobra.

Largar com G e apanhar com E funcionam, com item na mão ou sem: quem decide é
o slot do item estar livre.

F2 (ou crase) liga a depuração: painel com teclas acesas e o estado do
jogador, caixa de colisão de tudo desenhada na cena, esfera de acerto de cada
alvo, e o que cada bot está pensando escrito sobre a cabeça dele. Mais a
trajetória prevista da bala — o arco, a reta que ela faria sem gravidade, e a
distância, queda e desvio do cano escritos no painel.

F3 abre o painel de ajuste ao vivo: deslizador pra cada número de `GRADE`,
`SPREAD`, `BULLET`, `MELEE`, `VIEW`, `CAMERA`, `STAMINA`, `SWAP`, `PLAYER` e
`INCLINACAO`,
com a luz, a exposição, a névoa e o FOV respondendo no mesmo quadro. Ele
solta o mouse sem abrir a pausa, marca em amarelo o que saiu do lugar e copia
as linhas do que mudou pra colar em `config.js` — não grava por cima do
arquivo. `?ajustes=1` abre ele no desembarque, pra captura.

O jogo tem SOM, e ele é sintetizado no boot — nenhum arquivo de áudio. Tiro
da MP40, tiro da Colt e o impacto da bala em terra, em pedra e em carne, cada
um posicional: o que vem da direita se ouve à direita, e isso é a mesma
informação de rumo que a bússola e o radar dão. O bot já ouvia tiro; agora o
jogador também.

P grava a tela num PNG com o estado queimado embaixo: posição, direção do
olhar, postura, vida, arma e contagem de colisores. O nome do arquivo leva a
posição, pra achar o lugar sem abrir a imagem.

A abertura tem dois caminhos: Jogar leva ao deploy de Sainte-Mère, e Campo de
treinamento entra direto num mapa plano com alvos a 10, 25, 50, 90 e 140 m,
os obstáculos, o arsenal inteiro no chão, munição infinita que ainda precisa
ser carregada, e um jipe ao lado da linha de tiro — chão plano e ninguém
atirando de volta é onde se aprende a dirigir.

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
direito. Cinto em quatro teclas — 1 MP40, 2 Colt, 3 faca, 4 pá. A bala viaja e
cai, e morre a 600 m — acima de qualquer engajamento do mapa e abaixo do lado
da ilha, então nenhuma sai voando pra fora do mundo. Um traçante a cada
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

O primeiro veículo é um jipe Willys MB, e ele é veículo de verdade e não um
modelo que desliza: quatro rodas com suspensão independente, tração nas quatro,
motor de 6 kN embaixo e 28 kW em cima (0-60 km/h em 7,9 s, 77 km/h de teto),
freio que para de 77 km/h em 26 m, ré curta e freio de mão que solta a
traseira. O esterçamento cai com a velocidade — 35° parado, 12° na velocidade
cheia — e o volante tem inércia.

O terreno manda: asfalto agarra 0,85 e arrasta pouco, grama 0,66, barranco 0,50,
areia 0,42, água 0,30. Ele sobe 20% de grama a 34 km/h, 40% a 10 km/h, e trava
numa rampa de 55% de terra solta — e com dois pneus arrebentados não sobe os
30% que subia inteiro. Nada disso está escrito como caso especial: a carga da
mola limita o atrito, e o resto cai de graça.

Capotar não é um limiar: é a gravidade em torno do apoio contra as molas, e
quando as rodas de um lado saem do chão o tombo termina sozinho. Capotado ele
assenta deitado, com a carroceria no chão, sem motor e sem comando — mas ainda
com física, porque sucata em encosta desce.

Ele tem quatro lugares (motorista, passageiro e dois atrás), entra e sai no E, e
a vista de dentro sai do NÓ do assento: acelerar cola o corpo no banco, frear
joga pra frente, e o olho dipa e sobe com a suspensão porque o assento faz isso.
Quem está no volante não atira; passageiro atira.

Dano por componente: motor, transmissão, tanque, carroceria e um pneu por roda,
cada um com vida própria. Tiro no pneu fura (menos aderência, muito mais
arrasto, e o veículo puxa pro lado sozinho), tiro no motor para o jipe, tanque
furado leva a carroceria junto. Bater e capotar machucam pela velocidade do
impacto, não por encostar. E atropelar tem três faixas: até 5 km/h empurra o
soldado, até 15 derruba, acima disso mata.

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

E ele sabe de onde veio e onde pegou. Um arco vermelho aparece em volta da
mira no rumo da boca de fogo — o rumo é do mundo, então virar a cabeça desliza
o arco e andar também —, e um boneco acima da classe e da vida acende a região
que a bala achou: capacete, cabeça, tronco, braço ou perna. O boneco é a
própria hitbox desenhada de frente, então ele não pode discordar de onde o
dano foi resolvido. `?dano=rumo` em `tools/screens-shot.html` fotografa os
dois.

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
