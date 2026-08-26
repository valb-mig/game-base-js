"""
Exporta o soldado como UMA SkinnedMesh com 19 ossos e skinning rigido
(peso 1.0 num unico osso por vertice) -> visual facetado identico, 1 draw call.

Le a T-pose ja validada e reescreve o glTF na mao, porque trimesh nao exporta skin.
Saida: soldado_skinned.glb
"""
import json, struct, base64
import numpy as np
import trimesh

SRC = "/home/claude/soldado_aliado_rifleman_tpose.glb"
OUT = "/home/claude/soldado_skinned.glb"

# ---------------------------------------------------------------------------
# 1. Le a cena de origem: nos-osso, nos-malha e a que osso cada peca pertence
# ---------------------------------------------------------------------------
raw = open(SRC, "rb").read()
jlen = struct.unpack("<I", raw[12:16])[0]
gsrc = json.loads(raw[20:20 + jlen])
nodes_src = gsrc["nodes"]

parent_of = {}
for i, n in enumerate(nodes_src):
    for c in n.get("children", []):
        parent_of[c] = i

def local_mat(i):
    """glTF permite 'matrix' (column-major) OU translation/rotation/scale."""
    n = nodes_src[i]
    if "matrix" in n:
        return np.array(n["matrix"], float).reshape(4, 4).T
    M = np.eye(4)
    if "rotation" in n:
        x, y, z, w = n["rotation"]
        M[:3, :3] = np.array([
            [1-2*(y*y+z*z), 2*(x*y-z*w),   2*(x*z+y*w)],
            [2*(x*y+z*w),   1-2*(x*x+z*z), 2*(y*z-x*w)],
            [2*(x*z-y*w),   2*(y*z+x*w),   1-2*(x*x+y*y)]])
    if "scale" in n:
        M[:3, :3] = M[:3, :3] @ np.diag(n["scale"])
    M[:3, 3] = n.get("translation", [0, 0, 0])
    return M

world_pos = {}
def wpos(i):
    if i in world_pos:
        return world_pos[i]
    M = local_mat(i)
    t = M[:3, 3].copy()
    if i in parent_of:
        P_ = local_mat(parent_of[i])  # so translacao nos joints de origem
        t = t + wpos(parent_of[i])
    world_pos[i] = t
    return t

BONE_ORDER = ["root", "hips", "spine", "chest", "neck", "head",
              "shoulder_L", "elbow_L", "hand_L",
              "shoulder_R", "elbow_R", "hand_R",
              "thigh_L", "knee_L", "foot_L",
              "thigh_R", "knee_R", "foot_R",
              "weapon"]
name_to_src = {n.get("name"): i for i, n in enumerate(nodes_src)}
assert all(b in name_to_src for b in BONE_ORDER), "osso faltando na origem"
BONE_IDX = {b: k for k, b in enumerate(BONE_ORDER)}
BONE_OUT_NAME = {b: ("weapon_R" if b == "weapon" else b) for b in BONE_ORDER}

# ---------------------------------------------------------------------------
# 2. Achata a geometria em arrays unicos, com normais FLAT explicitas
#    (24 vertices por caixa: cada face com sua propria normal)
# ---------------------------------------------------------------------------
scene = trimesh.load(SRC)
P, N, UV, J, IDX = [], [], [], [], []
lookup = {}
peca_por_osso = {}

for gname in scene.geometry:
    node = scene.graph.geometry_nodes[gname][0]
    T = scene.graph.get(node)[0]
    mesh = scene.geometry[gname]
    verts = trimesh.transform_points(mesh.vertices, T)
    uvs = mesh.visual.uv

    # osso = no pai da peca na cena de origem
    src_i = name_to_src[gname]
    bone_name = nodes_src[parent_of[src_i]].get("name")
    b = BONE_IDX[bone_name]
    peca_por_osso.setdefault(bone_name, []).append(gname)

    for f in mesh.faces:
        tri = verts[f]
        nrm = np.cross(tri[1] - tri[0], tri[2] - tri[0])
        nrm = nrm / (np.linalg.norm(nrm) + 1e-12)
        for k, vi in enumerate(f):
            pos = verts[vi]
            key = (b, round(pos[0], 6), round(pos[1], 6), round(pos[2], 6),
                   round(nrm[0], 3), round(nrm[1], 3), round(nrm[2], 3))
            if key not in lookup:
                lookup[key] = len(P)
                P.append(pos)
                N.append(nrm)
                UV.append([float(uvs[vi][0]), 0.5])  # atlas em faixas: v irrelevante
                J.append(b)
            IDX.append(lookup[key])

P = np.array(P, np.float32)
N = np.array(N, np.float32)
UV = np.array(UV, np.float32)
JOINTS = np.zeros((len(P), 4), np.uint16); JOINTS[:, 0] = J
WEIGHTS = np.zeros((len(P), 4), np.float32); WEIGHTS[:, 0] = 1.0
IDX = np.array(IDX, np.uint16)
print(f"vertices: {len(P)}  triangulos: {len(IDX)//3}  ossos: {len(BONE_ORDER)}")

# inverse bind matrices = inversa da matriz mundial do osso (so translacao)
IBM = np.zeros((len(BONE_ORDER), 16), np.float32)
for b, name in enumerate(BONE_ORDER):
    m = np.eye(4)
    m[:3, 3] = -wpos(name_to_src[name])
    IBM[b] = m.T.reshape(-1)          # glTF = column-major

# ---------------------------------------------------------------------------
# 3. Monta o binario
# ---------------------------------------------------------------------------
png = open("/home/claude/soldado_atlas.png", "rb").read()
blob = bytearray()
views, accessors = [], []

def add_view(data, target=None):
    while len(blob) % 4:
        blob.append(0)
    off = len(blob)
    blob.extend(data)
    v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
    if target:
        v["target"] = target
    views.append(v)
    return len(views) - 1

def add_acc(arr, ctype, atype, target, minmax=False):
    vi = add_view(arr.tobytes(), target)
    a = {"bufferView": vi, "componentType": ctype, "count": len(arr), "type": atype}
    if minmax:
        a["min"] = arr.min(axis=0).tolist()
        a["max"] = arr.max(axis=0).tolist()
    accessors.append(a)
    return len(accessors) - 1

FLOAT, USHORT = 5126, 5121 + 2
ARRAY, ELEMENT = 34962, 34963
a_pos = add_acc(P, FLOAT, "VEC3", ARRAY, minmax=True)
a_nrm = add_acc(N, FLOAT, "VEC3", ARRAY)
a_uv = add_acc(UV, FLOAT, "VEC2", ARRAY)
a_jnt = add_acc(JOINTS, USHORT, "VEC4", ARRAY)
a_wgt = add_acc(WEIGHTS, FLOAT, "VEC4", ARRAY)
a_idx = add_acc(IDX, USHORT, "SCALAR", ELEMENT)
a_ibm = add_acc(IBM, FLOAT, "MAT4", None)
v_png = add_view(png)

# ---------------------------------------------------------------------------
# 4. Nos: no 0 = malha; ossos a partir do indice 1 (root = 1)
# ---------------------------------------------------------------------------
nodes = [{"name": "Soldado", "mesh": 0, "skin": 0}]
children_of = {b: [] for b in BONE_ORDER}
for b in BONE_ORDER:
    src_i = name_to_src[b]
    if src_i in parent_of:
        pn = nodes_src[parent_of[src_i]].get("name")
        if pn in children_of:
            children_of[pn].append(b)

for b in BONE_ORDER:
    src_i = name_to_src[b]
    pn = nodes_src[parent_of[src_i]].get("name") if src_i in parent_of else None
    t = (wpos(src_i) - wpos(name_to_src[pn])) if pn in BONE_IDX else wpos(src_i)
    node = {"name": BONE_OUT_NAME[b]}
    if np.abs(t).max() > 1e-9:
        node["translation"] = [float(x) for x in t]
    kids = [BONE_IDX[c] + 1 for c in children_of[b]]
    if kids:
        node["children"] = kids
    nodes.append(node)

gltf = {
    "asset": {"version": "2.0", "generator": "soldado-skinner"},
    "scene": 0,
    "scenes": [{"nodes": [0, BONE_IDX["root"] + 1]}],
    "nodes": nodes,
    "meshes": [{"name": "Soldado_LOD0", "primitives": [{
        "attributes": {"POSITION": a_pos, "NORMAL": a_nrm, "TEXCOORD_0": a_uv,
                       "JOINTS_0": a_jnt, "WEIGHTS_0": a_wgt},
        "indices": a_idx, "material": 0, "mode": 4}]}],
    "skins": [{"name": "Soldado_Rig", "inverseBindMatrices": a_ibm,
               "skeleton": BONE_IDX["root"] + 1,
               "joints": [BONE_IDX[b] + 1 for b in BONE_ORDER]}],
    "materials": [{"name": "Soldado_Atlas", "doubleSided": False,
                   "pbrMetallicRoughness": {
                       "baseColorTexture": {"index": 0},
                       "metallicFactor": 0.0, "roughnessFactor": 0.85}}],
    "textures": [{"sampler": 0, "source": 0}],
    "images": [{"bufferView": v_png, "mimeType": "image/png", "name": "atlas64"}],
    "samplers": [{"magFilter": 9728, "minFilter": 9728,
                  "wrapS": 33071, "wrapT": 33071}],  # NEAREST + clamp
    "bufferViews": views,
    "accessors": accessors,
    "buffers": [{"byteLength": len(blob)}],
}

jb = json.dumps(gltf, separators=(",", ":")).encode()
jb += b" " * ((4 - len(jb) % 4) % 4)
bb = bytes(blob) + b"\x00" * ((4 - len(blob) % 4) % 4)
glb = (struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(bb))
       + struct.pack("<II", len(jb), 0x4E4F534A) + jb
       + struct.pack("<II", len(bb), 0x004E4942) + bb)
open(OUT, "wb").write(glb)
print(f"{OUT}  {len(glb)/1024:.1f} KB")
print("pecas por osso:", {k: len(v) for k, v in sorted(peca_por_osso.items())})
