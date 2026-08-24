# game.bf

FPS de classes ambientado em 1945, frente ocidental. Three.js puro, sem build
e sem dependência de npm — abre no navegador e roda.

## Rodar e verificar

```bash
tools/dev.sh serve            # sobe o servidor estático (idempotente)
tools/dev.sh check            # roda a suíte; sai != 0 se algo falhar
tools/dev.sh errors index.html            # erro de console na página
tools/dev.sh shot index.html /tmp/a.png   # captura headless
```

`tools/dev.sh check` é o portão. Rode antes e depois de qualquer mudança.

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
  core/    input.js  teclado bruto · stage.js  renderer, cena, luz
  player/  player.js estado + ordem dos sistemas
           locomotion.js  stance.js  collision.js  view.js  heading.js
  world/   world.js  terreno e props · course.js  pista de teste
  items/   classes.js  knife.js  viewmodel.js
  ui/      menu.js  session.js  debug.js  status.js
tests/     run.html + suites/  (aim, movement, jump, stance, model, flow)
tools/     dev.sh  model-viewer.html
vendor/    three.js 0.169 local — não vem de CDN
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

**Teste tem que exercitar o código, não repetir a conta.** `aim.js` já passou
por engano enquanto o jogo usava a fórmula errada, porque duplicava a lógica.
Por isso `heading.js` existe como módulo.

## Convenções

- Código e comentário em pt-br. Comentário explica **por quê**, não o quê.
- Sistemas do jogador são funções que recebem a instância (`updateStance(player, delta)`),
  não métodos privados: o estado é público de propósito.
- `config.js` guarda número de ajuste; a classe sobrescreve o que declarar em
  `movement`, e herda o resto.
- Nada de CDN. `vendor/` é local pra o ciclo de teste ser rápido e offline.

## Estado atual

Funciona: movimento (andar, correr como alternância no Shift, agachar em C,
deitar em Z, pulo com coyote time e buffer), pista de teste em frente ao
spawn, seleção de classe, e a faca KA-BAR como modelo e viewmodel.

Ainda não existe: dano (a vida é só leitura), tiro, e o golpe da faca — ela é
modelo e animação de mão, sem ataque nem traço de acerto. Só a Assault é
jogável; as outras três estão no catálogo, bloqueadas.
