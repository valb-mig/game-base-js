# game.bf

FPS de classes ambientado em 1945, escrito em Three.js puro. Sem build, sem
npm: abre no navegador e roda.

![Ilha Corvo](docs/screenshot.png)

## Rodar

O projeto é estático, mas precisa de um servidor HTTP — módulos ES não
carregam por `file://`, e o pointer lock exige `localhost` ou HTTPS.

```bash
tools/dev.sh serve      # sobe o servidor e imprime a URL
```

Ou qualquer servidor estático apontado pra raiz do repositório.

## Controles

| tecla | ação |
|---|---|
| WASD / setas | andar |
| Shift | liga e desliga a corrida |
| C | agachar (alterna) |
| Z | deitar (alterna) |
| Espaço | pular · na água sobe · deitado, levanta |
| Botão esquerdo | golpear ou atirar |
| Botão direito | mirar pela mira de ferro |
| R | recarregar |
| 1 a 4 | trocar de item |
| Pá (4) | esquerdo cava · direito despeja a terra |
| G / E | largar item · apanhar do chão |
| K | morrer (tecla de teste) |
| ` ou F2 | painel de depuração |

Observando: **Shift** voa rápido, **Espaço** sobe, **C** desce.

## O que existe

Entra-se no mapa como observador: um fantasma que voa e vê a partida. Pela
tela de deploy escolhe-se o equipamento e um ponto de desembarque no mapa
tático da ilha. Morrer devolve pra essa mesma tela.

Ilha com praia, floresta e natação, duas bases militares opostas e um campo
de treino com estande de baioneta. Faca KA-BAR e Colt M1911A1 com balística
de projétil: a bala viaja, cai por gravidade e um traçante a cada quatro
tiros marca o caminho.

## Campo de treinamento

Segundo botão da abertura, e **outro mapa**: chão plano, alvos parados a 10,
25, 50, 90 e 140 metros — soldados desarmados, com a mesma silhueta e a mesma
esfera de acerto dos do combate, e a distância marcada no chão. Derrubados,
levantam sozinhos em quatro segundos. Mais os obstáculos pra
medir salto e degrau, e o arsenal inteiro largado ao lado da linha de tiro.

A munição não acaba, mas o **carregador acaba**: recarregar continua custando
os mesmos segundos. Munição infinita que dispensasse a recarga treinaria uma
arma que o jogo não tem.

## O mapa

**Sainte-Mère**, Normandia, 1944 — dois quilômetros de lado. De norte pra sul:
o mar, a praia de desembarque, a escarpa que domina essa praia, o planalto com
a vila e a fazenda, e o rio cortando na diagonal com duas pontes.

O terreno é a regra do mapa: cada ponto é difícil de um jeito diferente porque
o chão ali é diferente. A praia é aberta e sem cobertura, a colina vê a praia
e a vila, o rio é gargalo com duas travessias.

## Modo de jogo

Dois países inventados: **Pacto de Karnia** (norte, vermelho) e **Aliança de
Vestria** (sul, azul). Inventados de propósito — a ilha e a guerra são ficção,
e nenhum exército real leva a culpa por nada que aconteça aqui.

Seis pontos de captura, na ordem em que a frente avança: **01 Praia**,
**02 Bunker da Colina**, **03 Vila Central**, **04 Fazenda La Haye**,
**05 Ponte do Rio**, **06 Moinho**.

A frente anda em ordem. Vestria desembarca na praia e empurra; Karnia defende
e retoma o que perdeu. Cada lado só pode mexer num ponto por vez — o atacante
no próximo, o defensor no último que caiu. Sem isso a partida seria seis
brigas soltas em vez de uma linha que anda pelo mapa.

Cada ponto tem quatro mastros.

Pra tomar uma bandeira, chegue no mastro e segure **F**: a bandeira de quem
era desce até o meio do mastro, o mastro fica vazio, e a sua sobe. São 30
segundos por bandeira, quatro bandeiras por posto — dois minutos de posto com
um soldado só.

O posto é o spawn do time, e basta **uma** bandeira mexida pra ele deixar de
servir: posto dominado, ou sendo dominado, o time perde o spawn ali. A base
principal continua sempre disponível.

Há nove soldados no mapa: cinco de Karnia e quatro de Vestria, com você
fechando cinco de cada lado. Eles brigam entre si sem precisar de você — em
90 segundos de guerra sozinha dá umas dez mortes, e os postos trocam de mão.
Cada um avança pro posto mais próximo, engaja
quem vê pela frente, troca de arma quando o carregador acaba (e puxa a faca se
você colar nele), procura cobertura quando leva tiro, e captura bandeira como
você. Se você atirar nele pelo flanco, ele para de içar e varre o horizonte
sem saber de onde veio — quem atirou primeiro leva vantagem.

A bala dele machuca de verdade — mesma balística da sua, então ela viaja, cai
e para numa parede. Uma vinheta vermelha nas bordas avisa que você está
levando tiro, porque entre o primeiro tiro doer e você morrer há pouco mais de
um segundo. Morrer devolve pra tela de deploy.

Eles seguram o tiro quando um companheiro está na linha, e voltam ao combate
seis segundos depois de cair, num posto que o time ainda domine.

Os dois lados se distinguem pelo tom da farda — Karnia escura, Vestria clara —
com a bandeira do time no peito e um vivo da cor dele no capacete. O tom
resolve a quarenta metros; a bandeira diz qual é de perto. Uniforme inteiro na
cor do time seria fantasia, e o soldado deixaria de se esconder no mato.

A mira deles é feita pra ser enfrentável: ele demora a reagir, vira a cabeça
numa velocidade finita, e a pontaria nasce aberta e fecha sem nunca ficar
perfeita. Medido a 25 metros: parado você morre em 2,6 segundos, andando de
lado sobrevive 7,5. Mexa-se.

## Depuração

**F2** (ou a crase) liga o modo de depuração:

- painel com as teclas acesas e o estado do jogador — postura, velocidade,
  vida, item na mão, dispersão atual e quanto o corpo a multiplica;
- a caixa de colisão de tudo desenhada na cena, em verde quando dá pra ficar
  em pé em cima e em azul quando é só parede;
- a esfera de acerto de cada alvo, em vermelho: é onde a bala pega, que não é
  o mesmo lugar por onde o corpo não passa;
- o que cada bot está pensando, escrito sobre a cabeça dele, com vida e
  munição no carregador;
- a trajetória do próximo tiro: o arco que a bala vai fazer, a reta que ela
  faria sem gravidade, e no painel a distância até o impacto, a queda no
  caminho e quanto o cano está desviado da mira.

**P** grava a tela num PNG, com o estado do jogador queimado embaixo da
imagem — posição, direção do olhar, postura, vida, arma e quantos colisores o
mapa tem. O nome do arquivo leva a posição junto (`bf45-154658-x-12z38.png`),
então dá pra achar o lugar sem abrir a foto. Ligue o F2 antes se o que você
quer mostrar for uma caixa de colisão.

## Fôlego e peso

Correr e pular gastam fôlego, e a arma na mão decide quanto. A MP40 pesa
4,7 kg carregada e a faca 320 g — medido, a corrida rende **10,4 segundos com
a faca e 5,3 com a MP40**. Um fôlego cheio dá cinco pulos com a MP40.

Sem fôlego você não corre e não pula, mas continua andando: jogador parado sem
poder fazer nada é punição, não mecânica. Recuperar custa parar de verdade —
soltar o Shift por um instante não devolve nada.

Trocar de item leva tempo: guardar o que está na mão e sacar o outro. Da MP40
pra faca são **0,78 segundo**, e a faca só chega na mão aos 0,48 — no fundo do
movimento. Enquanto isso não se atira, não se golpeia e não se cava. Os bots
pagam o mesmo tempo.

## Onde a bala pega

O corpo é dividido em regiões, e a promessa é em **tiros**, não em pontos:

| onde | com a MP40 |
| --- | --- |
| cabeça | **1 tiro** |
| capacete | **2** |
| tronco | 5 |
| braço ou perna | 7 |

Os números são calibrados pela arma mais fraca do jogo — com as outras a
promessa vale com folga. O capacete cobre a parte de cima da cabeça de
propósito: acertar ali é quase acertar, e não é.

A faca mata em **dois golpes**, ou num só **pelas costas** — o que decide é
pra onde o alvo está virado, não de onde veio a lâmina.

O kill feed no canto direito diz quem matou quem, com que arma e em que
região. As linhas que envolvem você ficam destacadas.

## Atirar

Parado, a bala vai exatamente onde a mira aponta — sem dispersão nenhuma.
Andando ela abre um pouco, correndo abre muito (e o cano ainda sai de
posição), e pulando é o pior lugar pra atirar. O anel da mira abre junto, pra
você ver o que está prometendo antes de puxar o gatilho.

Medido a 25 metros com a MP40, onde um homem tem meio metro de largura:

| estado | desvio médio |
| --- | --- |
| parado | 0 cm |
| andando | 22 cm |
| andando, na mira de ferro | 8 cm |
| correndo | 118 cm |
| no ar | 111 cm |

Parar pra atirar é a decisão mais cara do tiroteio, porque parado você é alvo
fácil. É essa troca que o jogo pede.

MP40 no slot 1 da Assault: 9×19mm, automática de 500 tiros por minuto, 32 no
carregador. Segurar o gatilho despeja rajada — é a primeira arma do jogo que
faz isso. Aço estampado, baquelite marrom no punho e no guarda-mão, carregador
reto pendurado e a coronha tubular dobrada por baixo do corpo.

Pá M1943 no slot 4, comum a todas as classes: o botão esquerdo cava e enche a
pá, o direito despeja a terra. O terreno é escavável de verdade — trincheira e
parapeito ficam gravados no relevo, e a colisão os enxerga. Cavar embaixo de
uma árvore, de uma pedra ou de uma parede derruba o que ficou sem chão.

Tiro no chão marca o terreno também, em escala: a pá move 90 cm por pazada,
um tiro de primária afunda 8,5 cm, um de secundária 4,5 cm, e o corpo a corpo
não mexe em nada. Esvaziar um carregador num ponto abre uma cova rasa.

Um tiro afunda pouco, mas expõe terra: a mancha escura no capim é o que se vê
de longe, não o buraco.

Não existe ainda: dano ao jogador além da tecla de teste, objetivo de partida
e captura de base.

## Desenvolvimento

```bash
tools/dev.sh check              # sintaxe + suíte de testes
tools/dev.sh errors index.html  # erro de console na página
tools/dev.sh shot index.html /tmp/a.png
```

A suíte roda em Chrome headless e cobre movimento, natação, terreno,
balística, combate e as telas. `CLAUDE.md` documenta a arquitetura e as
armadilhas que já custaram caro.

## Créditos

Ícones do HUD por [game-icons.net](https://game-icons.net), sob
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/):

- **pistol-gun** — John Colburn ([ninmunanmu.com](http://ninmunanmu.com))
- **bowie-knife** — Skoll
- **first-aid-kit** — Delapouite ([delapouite.com](https://delapouite.com))
- **bullets** — Lorc ([lorcblog.blogspot.com](https://lorcblog.blogspot.com))
- **spade** — Lorc ([lorcblog.blogspot.com](https://lorcblog.blogspot.com))

Os arquivos originais e a licença completa estão em `vendor/icons/`.

[Three.js](https://threejs.org) r169 (MIT) fica vendorizado em
`vendor/three/`.
