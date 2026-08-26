"""Valida o GLB skinnado: estrutura, bind pose e uma pose de teste."""
import json, struct
import numpy as np

raw = open("/home/claude/soldado_skinned.glb", "rb").read()
assert raw[:4] == b"glTF" and struct.unpack("<I", raw[4:8])[0] == 2
jlen = struct.unpack("<I", raw[12:16])[0]
g = json.loads(raw[20:20 + jlen])
boff = 20 + jlen + 8
blob = raw[boff:]

CT = {5120: ("i1", 1), 5121: ("u1", 1), 5122: ("i2", 2),
      5123: ("u2", 2), 5125: ("u4", 4), 5126: ("f4", 4)}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

def read(i):
    a = g["accessors"][i]
    bv = g["bufferViews"][a["bufferView"]]
    dt, sz = CT[a["componentType"]]
    n = NC[a["type"]]
    need = a["count"] * n * sz
    assert need <= bv["byteLength"], f"accessor {i} estoura a bufferView"
    off = bv["byteOffset"] + a.get("byteOffset", 0)
    arr = np.frombuffer(blob, dtype=dt, count=a["count"] * n, offset=off)
    return arr.reshape(a["count"], n) if n > 1 else arr

# --- estrutura ---
for k, bv in enumerate(g["bufferViews"]):
    assert bv["byteOffset"] % 4 == 0, f"bufferView {k} desalinhada"
    assert bv["byteOffset"] + bv["byteLength"] <= len(blob), f"bufferView {k} fora do buffer"
assert g["buffers"][0]["byteLength"] <= len(blob)
prim = g["meshes"][0]["primitives"][0]
P = read(prim["attributes"]["POSITION"]).astype(float)
NRM = read(prim["attributes"]["NORMAL"]).astype(float)
JNT = read(prim["attributes"]["JOINTS_0"]).astype(int)
WGT = read(prim["attributes"]["WEIGHTS_0"]).astype(float)
UVv = read(prim["attributes"]["TEXCOORD_0"]).astype(float)
IDX = read(prim["indices"]).astype(int)
IBM = read(g["skins"][0]["inverseBindMatrices"]).astype(float).reshape(-1, 4, 4)
IBM = np.transpose(IBM, (0, 2, 1))          # column-major -> row-major

assert IDX.max() < len(P), "indice fora do range"
assert np.allclose(WGT.sum(axis=1), 1.0), "pesos nao somam 1"
assert (WGT[:, 1:] == 0).all(), "peso vazando pra osso secundario"
assert np.allclose(np.linalg.norm(NRM, axis=1), 1.0, atol=1e-3), "normais nao unitarias"
assert len(np.unique(JNT[:, 0])) <= len(g["skins"][0]["joints"])
print(f"estrutura OK | {len(P)} verts, {len(IDX)//3} tris, "
      f"{len(g['skins'][0]['joints'])} ossos, {len(g['materials'])} material, "
      f"{len(g['meshes'])} mesh")

# --- hierarquia / poses ---
nodes = g["nodes"]
joints = g["skins"][0]["joints"]
parent = {}
for i, n in enumerate(nodes):
    for c in n.get("children", []):
        parent[c] = i

def local(i, pose):
    T = np.eye(4)
    t = nodes[i].get("translation", [0, 0, 0])
    T[:3, 3] = t
    if i in pose:
        T[:3, :3] = pose[i]
    return T

def world(i, pose):
    T = local(i, pose)
    while i in parent:
        i = parent[i]
        T = local(i, pose) @ T
    return T

def skin(pose):
    out = np.zeros_like(P)
    for b_i, jn in enumerate(joints):
        m = world(jn, pose) @ IBM[b_i]
        sel = JNT[:, 0] == b_i
        if sel.any():
            v = np.c_[P[sel], np.ones(sel.sum())]
            out[sel] = (v @ m.T)[:, :3]
    return out

bind = skin({})
err = np.abs(bind - P).max()
print(f"bind pose: erro maximo {err:.2e} m", "OK" if err < 1e-6 else "FALHOU")

# pose de teste: bracos 60 graus para baixo + torso girado
def rotZ(d):
    a = np.radians(d); c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])
def rotY(d):
    a = np.radians(d); c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

name_i = {n.get("name"): i for i, n in enumerate(nodes)}
pose = {name_i["shoulder_L"]: rotZ(-60), name_i["shoulder_R"]: rotZ(60),
        name_i["chest"]: rotY(25)}
posed = skin(pose)

# a mao esquerda deve ter descido; a cabeca deve ter girado junto com o peito
hL = JNT[:, 0] == joints.index(name_i["hand_L"]) if False else (JNT[:, 0] == [j for j, n in enumerate(joints) if nodes[n]["name"] == "hand_L"][0])
print(f"mao_L y: {P[hL][:,1].mean():.3f} -> {posed[hL][:,1].mean():.3f} (deve cair)")
head = JNT[:, 0] == [j for j, n in enumerate(joints) if nodes[n]["name"] == "head"][0]
print(f"cabeca x: {P[head][:,0].mean():+.3f} -> {posed[head][:,0].mean():+.3f} (deve sair de 0)")
np.save("/home/claude/posed.npy", posed)
np.save("/home/claude/bind_attrs.npy", np.c_[UVv[:, 0], IDX[:len(UVv)] * 0])
print("ossos:", [nodes[j]["name"] for j in joints])
