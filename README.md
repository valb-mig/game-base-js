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
