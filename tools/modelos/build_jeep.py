"""
Jeep Willys MB (1945) - low poly, estilo Scorched Earth.
Mesmo atlas 64x64 e mesmo material do soldado.

Corpo inteiro fundido em 1 malha; so o que gira fica em no separado
(4 rodas, esterco, volante) -> 6 malhas por jeep, nao 30.
Eixos: Y para cima, frente para +Z, origem no chao entre as rodas.
"""
import numpy as np
import trimesh
from PIL import Image

PALETTE = {"olive": "#4C5527", "olive_dk": "#3A4220", "tan": "#C2A44E",
           "skin": "#E3C48F", "brown": "#7A4B2A", "brown_dk": "#4E3220",
           "metal": "#2B2B2B", "white": "#E8E6DC"}
NAMES = list(PALETTE)
IDX = {n: i for i, n in enumerate(NAMES)}
atlas = Image.open("/home/claude/soldado_atlas.png").convert("RGB")
MATERIAL = trimesh.visual.material.PBRMaterial(
    name="Soldado_Atlas", baseColorTexture=atlas,
    metallicFactor=0.0, roughnessFactor=0.85, doubleSided=False)

def paint(m, color):
    """Achata os vertices (normais flat) e aplica a faixa do atlas."""
    m.unmerge_vertices()
    uv = np.tile([(IDX[color] * 8 + 4) / 64.0, 0.5], (len(m.vertices), 1))
    m.visual = trimesh.visual.TextureVisuals(uv=uv, material=MATERIAL)
    return m

def weld_flat(m, uvs):
    """Dedupe por (posicao, normal de face, uv) - mantem o facetado, corta 1/3 dos verts."""
    V, N, U, F, seen = [], [], [], [], {}
    fn = m.face_normals
    for fi, f in enumerate(m.faces):
        tri = []
        for vi in f:
            k = (*np.round(m.vertices[vi], 6), *np.round(fn[fi], 4), round(uvs[vi][0], 5))
            if k not in seen:
                seen[k] = len(V)
                V.append(m.vertices[vi]); N.append(fn[fi]); U.append(uvs[vi])
            tri.append(seen[k])
        F.append(tri)
    out = trimesh.Trimesh(vertices=np.array(V), faces=np.array(F),
                          vertex_normals=np.array(N), process=False)
    out.visual = trimesh.visual.TextureVisuals(uv=np.array(U), material=MATERIAL)
    return out

def star(node, cx, cy, cz, r_out, r_in, thick, color, points=5):
    """Estrela invicta da USAAF: leque de triangulos, deitada no plano XZ."""
    ang = np.pi / 2                     # uma ponta para a frente (+Z)
    rim = []
    for k in range(points * 2):
        r = r_out if k % 2 == 0 else r_in
        a = ang + k * np.pi / points
        rim.append([cx + r * np.cos(a), cz + r * np.sin(a)])
    rim = np.array(rim)
    V, F = [], []
    for sign, y in ((1, cy + thick), (-1, cy)):
        base = len(V)
        V.append([cx, y, cz])
        for px, pz in rim:
            V.append([px, y, pz])
        for k in range(len(rim)):
            a, b = base + 1 + k, base + 1 + (k + 1) % len(rim)
            F.append([base, a, b] if sign > 0 else [base, b, a])
    m = trimesh.Trimesh(vertices=np.array(V), faces=np.array(F), process=False)
    PARTS.append((node, paint(m, color)))

PARTS = []          # (node, mesh)
def box(node, extents, center, color, rot=None):
    m = trimesh.creation.box(extents=extents)
    if rot is not None:
        m.apply_transform(rot)
    m.apply_translation(center)
    PARTS.append((node, paint(m, color)))

def cyl(node, radius, length, center, color, axis="x", sections=10):
    m = trimesh.creation.cylinder(radius=radius, height=length, sections=sections)
    if axis == "x":
        m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    elif axis == "y":
        m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    m.apply_translation(center)
    PARTS.append((node, paint(m, color)))

def rotX(deg):
    return trimesh.transformations.rotation_matrix(np.radians(deg), [1, 0, 0])

# --- medidas reais do MB: entre-eixos 2,03 / bitola 1,23 / pneu 6.00-16 ---
WB, TRACK, R_TIRE, W_TIRE = 2.03, 1.30, 0.39, 0.17
# num decagono o contato com o chao e o apotema (r*cos(18)), nao o raio:
# compensa para o pneu assentar em y=0 em vez de flutuar 19 mm
R_MESH = R_TIRE / np.cos(np.pi / 10)
ZF, ZR, XW = WB / 2, -WB / 2, TRACK / 2

# ============================ CARROCERIA ====================================
box("chassi", [1.22, 0.10, 2.30], (0, 0.47, -0.15), "olive")          # assoalho
box("chassi", [0.10, 0.42, 2.30], (0.61, 0.71, -0.15), "olive")       # lateral E
box("chassi", [0.10, 0.42, 2.30], (-0.61, 0.71, -0.15), "olive")      # lateral D
box("chassi", [1.22, 0.42, 0.10], (0, 0.71, -1.35), "olive")          # traseira
box("chassi", [1.22, 0.30, 0.26], (0, 0.80, 0.40), "olive")           # cowl
box("chassi", [1.28, 0.22, 1.02], (0, 0.86, 0.96), "olive")           # capo
box("chassi", [1.24, 0.44, 0.12], (0, 0.74, 1.52), "olive_dk")        # grade
for gx in np.linspace(-0.42, 0.42, 7):                                 # 7 ranhuras
    box("chassi", [0.055, 0.32, 0.04], (gx, 0.74, 1.585), "metal")
box("chassi", [0.20, 0.20, 0.10], (0.33, 0.88, 1.575), "white")       # farol E
box("chassi", [0.20, 0.20, 0.10], (-0.33, 0.88, 1.575), "white")      # farol D
box("chassi", [1.45, 0.09, 0.13], (0, 0.50, 1.60), "metal")           # para-choque
box("chassi", [0.16, 0.09, 0.13], (0.45, 0.50, -1.45), "metal")
box("chassi", [0.16, 0.09, 0.13], (-0.45, 0.50, -1.45), "metal")
for sx in (0.70, -0.70):                                               # para-lamas
    box("chassi", [0.28, 0.09, 1.10], (sx, 0.88, 1.00), "olive")
    box("chassi", [0.28, 0.09, 0.92], (sx, 0.88, -0.95), "olive")
    box("chassi", [0.10, 0.30, 0.10], (sx, 0.70, 1.50), "olive")      # suporte
star("chassi", 0.0, 0.972, 0.92, 0.29, 0.125, 0.02, "white")          # estrela USAAF
# para-brisa rebatível, inclinado 12 graus
box("chassi", [1.30, 0.46, 0.07], (0, 1.16, 0.235), "olive_dk", rotX(12))
box("chassi", [1.16, 0.34, 0.03], (0, 1.16, 0.265), "metal", rotX(12))
# bancos
for sx in (0.32, -0.32):
    box("chassi", [0.44, 0.12, 0.42], (sx, 0.62, -0.18), "olive_dk")
    box("chassi", [0.44, 0.42, 0.10], (sx, 0.85, -0.44), "olive_dk")
box("chassi", [1.10, 0.12, 0.34], (0, 0.62, -0.95), "olive_dk")
box("chassi", [1.10, 0.34, 0.10], (0, 0.81, -1.16), "olive_dk")
# coluna de direcao (LHD: motorista na esquerda = +X olhando para +Z)
box("chassi", [0.07, 0.07, 0.34], (0.32, 0.92, 0.36), "metal", rotX(-38))
box("chassi", [0.19, 0.44, 0.17], (-0.50, 0.80, -1.44), "olive_dk")   # jerrycan
box("chassi", [0.09, 0.06, 0.05], (-0.50, 1.03, -1.44), "metal")
box("chassi", [0.06, 0.55, 0.06], (0.66, 1.18, 0.30), "olive_dk")     # antena
cyl("chassi", 0.115, 0.30, (0, 1.02, -0.62), "metal", axis="y", sections=8)  # pedestal MG

# ============================== RODAS =======================================
WHEELS = {"wheel_FL": (XW, R_TIRE, ZF), "wheel_FR": (-XW, R_TIRE, ZF),
          "wheel_RL": (XW, R_TIRE, ZR), "wheel_RR": (-XW, R_TIRE, ZR)}
for wn, c in WHEELS.items():
    cyl(wn, R_MESH, W_TIRE, c, "metal", sections=10)
    cyl(wn, 0.145, W_TIRE + 0.02, c, "olive", sections=8)
cyl("chassi", R_MESH, W_TIRE, (0.30, 0.92, -1.50), "metal", axis="z", sections=10)
cyl("chassi", 0.145, W_TIRE + 0.02, (0.30, 0.92, -1.50), "olive", axis="z", sections=8)
m = trimesh.creation.cylinder(radius=0.165, height=0.035, sections=10)
m.apply_transform(rotX(50)); m.apply_translation((0.32, 1.06, 0.16))
PARTS.append(("volante", paint(m, "olive_dk")))

# ========================== GRAFO DE CENA ===================================
# steer_* fica no centro da roda dianteira: girar em Y esterca, a roda gira em X
JOINTS = {
    "root":     (None,       (0.0, 0.0, 0.0)),
    "chassi":   ("root",     (0.0, 0.0, 0.0)),
    "steer_L":  ("root",     (XW, R_TIRE, ZF)),
    "wheel_FL": ("steer_L",  (XW, R_TIRE, ZF)),
    "steer_R":  ("root",     (-XW, R_TIRE, ZF)),
    "wheel_FR": ("steer_R",  (-XW, R_TIRE, ZF)),
    "wheel_RL": ("root",     (XW, R_TIRE, ZR)),
    "wheel_RR": ("root",     (-XW, R_TIRE, ZR)),
    "volante":  ("root",     (0.32, 1.06, 0.16)),
    "mount_MG": ("root",     (0.0, 1.17, -0.62)),   # attach point da .50
    "seat_driver": ("root",  (0.32, 0.68, -0.18)),
    "seat_pax":    ("root",  (-0.32, 0.68, -0.18)),
    "seat_rear_L": ("root",  (0.28, 0.68, -0.95)),
    "seat_rear_R": ("root",  (-0.28, 0.68, -0.95)),
}
WORLD = {k: np.array(v[1], float) for k, v in JOINTS.items()}

scene = trimesh.Scene()
for name, (parent, _) in JOINTS.items():
    T = np.eye(4)
    if parent is None:
        scene.graph.update(frame_to=name, frame_from=scene.graph.base_frame, matrix=T)
    else:
        T[:3, 3] = WORLD[name] - WORLD[parent]
        scene.graph.update(frame_to=name, frame_from=parent, matrix=T)

# funde tudo que pertence ao mesmo no em UMA malha
for node in dict.fromkeys(n for n, _ in PARTS):
    pieces = [m for n, m in PARTS if n == node]
    merged = trimesh.util.concatenate(pieces)
    uvs = np.vstack([p.visual.uv for p in pieces])
    merged = weld_flat(merged, uvs)
    merged.apply_translation(-WORLD[node])      # geometria local ao no
    T = np.eye(4)
    scene.add_geometry(merged, node_name=f"{node}_mesh", geom_name=f"{node}_mesh",
                       parent_node_name=node, transform=T)

glb = trimesh.exchange.gltf.export_glb(scene, include_normals=True)
open("/home/claude/jeep_willys_mb.glb", "wb").write(glb)

tris = sum(len(g.faces) for g in scene.geometry.values())
print(f"malhas: {len(scene.geometry)}  triangulos: {tris}  "
      f"vertices: {sum(len(g.vertices) for g in scene.geometry.values())}")
print(f"bounds: {np.round(scene.bounds, 3).tolist()}")
print(f"glb: {len(glb)/1024:.1f} KB")
