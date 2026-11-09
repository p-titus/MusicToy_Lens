#!/usr/bin/env python3
"""One-off script: writes the 8 placeholder blob meshes as plain OBJ files.

Run it once (python3 Tools/make_blob_meshes.py). It is NOT part of the Lens and nothing here runs at
runtime. The OBJ files land in Assets/Meshes/Blobs/ and are ordinary assets: replace them with your own.

Every mesh is normalised to a 1 x 1 x 1 box centred on its pivot (y up). So a Visual scale of (4, 6, 4)
makes the blob 4 cm wide and 6 cm tall, and the 1x1x1 box collider on the Visual always matches it.
The "natural" proportions of each blob are printed below; they are used for the default toy scales.
"""
import math
import os
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Assets", "Meshes", "Blobs")
NU = 40  # steps around
NV = 32  # steps along


def smax(a, b, k):
    """Smooth maximum: joins two shapes with a soft blend (no crease)."""
    h = max(k - abs(a - b), 0.0) / k
    return max(a, b) + h * h * k * 0.25


def ell(y, cy, ry, rr):
    """Radius of an ellipse (centre height cy, half height ry, half width rr) at height y."""
    t = (y - cy) / ry
    return rr * math.sqrt(max(0.0, 1.0 - t * t))


# ---- surfaces: each returns (x, y, z) for u, v in 0..1 -------------------------------------------------
def lathe(radius):
    """Surface of revolution. radius(y, phi) with y in 0..1 (bottom..top)."""
    def f(u, v):
        phi = 2 * math.pi * u
        y = 0.5 - 0.5 * math.cos(math.pi * v)  # denser near the rounded poles
        r = radius(y, phi)
        return (r * math.cos(phi), y, r * math.sin(phi))
    return f


def pebble(y, phi):
    return ell(y, 0.5, 0.5, 0.5) * (1 + 0.07 * math.cos(3 * phi + 0.6))


def pebble_lumpy(y, phi):
    """A second pebble: squashed, two big lumps and a few small ones, off-centre belly."""
    lump = 1 + 0.16 * math.cos(2 * phi + 0.4) + 0.06 * math.cos(5 * phi + 1.3)
    return ell(y, 0.42, 0.5, 0.5) * lump * (0.9 + 0.2 * (1 - y))


def flower_star(y, phi):
    """A second flower: six broad petals, pinched waist, dimpled top."""
    petal = 1 + 0.34 * math.cos(6 * phi) * math.sin(math.pi * y) ** 0.7
    dimple = 1 - 0.12 * math.exp(-((y - 1.0) / 0.12) ** 2)
    return ell(y, 0.5, 0.5, 0.5) * petal * dimple


def flower(y, phi):
    lobe = 1 + 0.26 * math.cos(5 * phi) * math.sin(math.pi * y) ** 0.5
    return ell(y, 0.5, 0.5, 0.5) * lobe


def donut(big=0.32, small=0.18, ruffle=0.0, waves=8):
    def f(u, v):
        a = 2 * math.pi * u
        b = 2 * math.pi * v
        sm = small * (1 + ruffle * math.cos(waves * a))
        r = big + sm * math.cos(b)
        return (r * math.cos(a), sm * math.sin(b), r * math.sin(a))
    return f


def bean(bend=0.7, taper=0.0, radius=0.26):
    """A fat capsule along x, bent downward in the middle, with rounded ends. taper > 0 makes one end thinner."""
    def centre(t):
        x = t - 0.5
        return (x, -bend * x * x, 0.0)

    def f(u, v):
        t = 0.5 - 0.5 * math.cos(math.pi * v)
        rad = radius * max(0.0, 1 - (2 * t - 1) ** 4) ** 0.5 * (1 + 0.1 * math.sin(math.pi * t)) * (1 - taper * (t - 0.5))
        c = centre(t)
        c2 = centre(min(1.0, t + 0.002))
        c1 = centre(max(0.0, t - 0.002))
        tx, ty = c2[0] - c1[0], c2[1] - c1[1]
        n = math.hypot(tx, ty)
        tx, ty = tx / n, ty / n
        nx, ny = -ty, tx
        phi = 2 * math.pi * u
        return (c[0] + rad * math.cos(phi) * nx, c[1] + rad * math.cos(phi) * ny, rad * math.sin(phi))
    return f


SHAPES = [
    ("Blob_01_PebbleLumpy", lathe(pebble_lumpy)),
    ("Blob_02_Pebble", lathe(pebble)),
    ("Blob_03_Donut", donut()),
    ("Blob_04_DonutRuffle", donut(0.28, 0.22, 0.28, 8)),
    ("Blob_05_BeanCurl", bean(1.5, 0.7, 0.24)),
    ("Blob_06_Bean", bean()),
    ("Blob_07_Flower", lathe(flower)),
    ("Blob_08_FlowerStar", lathe(flower_star)),
]


def build(surface):
    grid = []
    for j in range(NV + 1):
        row = []
        for i in range(NU + 1):
            row.append(surface((i % NU) / NU, j / NV))
        grid.append(row)
    # normalise to a unit box centred on the pivot
    pts = [p for row in grid for p in row]
    lo = [min(p[k] for p in pts) for k in range(3)]
    hi = [max(p[k] for p in pts) for k in range(3)]
    size = [max(hi[k] - lo[k], 1e-6) for k in range(3)]
    grid = [[tuple((p[k] - (lo[k] + hi[k]) / 2) / size[k] for k in range(3)) for p in row] for row in grid]

    tris = []
    for j in range(NV):
        for i in range(NU):
            a, b, c, d = (j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)
            tris.append((a, b, c))
            tris.append((a, c, d))

    def pos(k):
        return grid[k[0]][k[1]]

    # signed volume decides whether the winding faces outward
    vol = 0.0
    for t in tris:
        p, q, r = (pos(k) for k in t)
        vol += (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]))
    if vol < 0:
        tris = [(t[0], t[2], t[1]) for t in tris]

    # smooth normals: add up face normals of vertices that share a position (welds seams and poles)
    def key(p):
        return (round(p[0], 5), round(p[1], 5), round(p[2], 5))

    acc = {}
    for t in tris:
        p, q, r = (pos(k) for k in t)
        e1 = (q[0] - p[0], q[1] - p[1], q[2] - p[2])
        e2 = (r[0] - p[0], r[1] - p[1], r[2] - p[2])
        n = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
        for k in t:
            s = acc.setdefault(key(pos(k)), [0.0, 0.0, 0.0])
            s[0] += n[0]
            s[1] += n[1]
            s[2] += n[2]
    return grid, tris, acc, key, size


def write_obj(name, surface):
    grid, tris, acc, key, size = build(surface)
    lines = ["# %s: placeholder blob, fits a 1x1x1 box centred on the pivot (y up)." % name,
             "# Natural proportions x:y:z = %.2f : %.2f : %.2f" % (size[0] / max(size), size[1] / max(size), size[2] / max(size)),
             "o " + name]
    index = {}
    vt = []
    for j, row in enumerate(grid):
        for i, p in enumerate(row):
            index[(j, i)] = len(index) + 1
            lines.append("v %.5f %.5f %.5f" % p)
    for j in range(NV + 1):
        for i in range(NU + 1):
            lines.append("vt %.5f %.5f" % (i / NU, j / NV))
    for j, row in enumerate(grid):
        for i, p in enumerate(row):
            n = acc.get(key(p), [0, 1, 0])
            m = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) or 1.0
            lines.append("vn %.5f %.5f %.5f" % (n[0] / m, n[1] / m, n[2] / m))
    for t in tris:
        idx = [index[k] for k in t]
        if len(set(key(grid[k[0]][k[1]]) for k in t)) < 3:
            continue  # collapsed triangle at a pole
        lines.append("f " + " ".join("%d/%d/%d" % (n, n, n) for n in idx))
    path = os.path.join(OUT, name + ".obj")
    with open(path, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    print("%-18s natural x:y:z = %.2f : %.2f : %.2f" % (name, size[0] / max(size), size[1] / max(size), size[2] / max(size)))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for n, s in SHAPES:
        write_obj(n, s)
    sys.exit(0)
