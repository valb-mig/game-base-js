"""Puxa a croma pra baixo ate um TETO, e o matiz pro amarelo, sem mexer no brilho.

Verde de vegetacao em dia encoberto e oliva, nao esmeralda: a luz difusa lava a
cor. A regra e uma so — croma alvo fixa e um empurrao de matiz na direcao do
amarelo — e o brilho (luma) fica onde estava, senao a floresta muda de valor
junto e a leitura de distancia vai com ela.
"""

CROMA_TETO = 0.42   # medida (max-min)/max; a vegetacao estava em 0,56 a 0,61

# TETO, nao alvo. Aplicada como alvo ela SATURA o que ja estava contido: a areia
# em 0,287 subia pra 0,420 e a praia ficava amarela, e o caminho de terra ia de
# 0,365 pra 0,421. Cor que ja esta abaixo do teto sai intacta.
PRO_AMARELO = 0.30  # quanto do caminho do vermelho ate o verde o R anda

def luma(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def croma(c):
    M = max(c)
    return (M - min(c)) / M if M else 0.0

def repintar(hexcor, pro_amarelo=None):
    r, g, b = (hexcor >> 16) & 255, (hexcor >> 8) & 255, hexcor & 255
    antes = (r, g, b)
    M = max(antes)
    if croma(antes) <= CROMA_TETO:
        return antes, antes
    # 1. comprime a distancia de cada canal ao maximo, ate o teto de croma
    alvo_min = M * (1 - CROMA_TETO)
    faixa_antes = M - min(antes)
    k = (M - alvo_min) / faixa_antes if faixa_antes else 0
    c = [M - (M - v) * k for v in antes]
    # 2. empurra o vermelho na direcao do verde: verde-oliva, nao verde-folha.
    #    Mas so em cor que JA era quente. A agulha de pinheiro e fria de
    #    proposito (b > r), e o empurrao invertia isso: ela saia mais quente
    #    que a folhosa e as duas especies deixavam de se distinguir a
    #    distancia, que e a unica coisa que a cor delas tem que fazer.
    empurrao = PRO_AMARELO if pro_amarelo is None else pro_amarelo
    if antes[0] >= antes[2]:
        c[0] += (c[1] - c[0]) * empurrao
    # 3. devolve o brilho original, pra distancia continuar lendo igual
    alvo = luma(antes)
    atual = luma(c)
    if atual:
        c = [min(255, v * alvo / atual) for v in c]
    dep = tuple(int(round(v)) for v in c)
    return antes, dep

CORES = [
    ('GRASS_COLOR', 0x5f8b3c),
    ('TREE_COLOR', 0x2f6b3a),
    ('FOLHA_COLOR', 0x4c7a30),
    ('FOLHA_CLARA', 0x5d8c39),
    ('BUSH_COLOR', 0x40702f),
    ('BUSH_COLOR_DARK', 0x2d5222),
]

# Tom de TERRA nao leva empurrao de matiz. Marrom ja e quente, e puxar o
# vermelho na direcao do verde o deixaria amarelo-esverdeado — barro nao e isso.
# So a croma desce, e por um motivo medido: a escarpa e o maior bloco de cor
# unica do mapa, e em 0,451 ela sai laranja debaixo da curva nova.
TERRAS = [
    ('DIRT_COLOR', 0x7d6446),
    ('SOIL_COLOR', 0x6b5334),
    ('TERRA_BATIDA', 0x9c8763),
    ('SAND_COLOR', 0xd8c89a),
]

print(f'{"cor":18} {"antes":16} {"depois":16} croma  luma')
for nome, h in CORES:
    antes, dep = repintar(h)
    hx = (dep[0] << 16) | (dep[1] << 8) | dep[2]
    print(f'{nome:18} 0x{h:06x} {str(antes):14} 0x{hx:06x} {str(dep):14}'
          f' {croma(antes):.3f}->{croma(dep):.3f}  {luma(antes):5.1f}->{luma(dep):5.1f}')

print()
print('--- tons de terra: so croma, sem empurrao de matiz ---')
for nome, h in TERRAS:
    antes, dep = repintar(h, pro_amarelo=0.0)
    hx = (dep[0] << 16) | (dep[1] << 8) | dep[2]
    print(f'{nome:18} 0x{h:06x} {str(antes):14} 0x{hx:06x} {str(dep):14}'
          f' {croma(antes):.3f}->{croma(dep):.3f}  {luma(antes):5.1f}->{luma(dep):5.1f}')
