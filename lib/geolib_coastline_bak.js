"use strict";

/**
 * GeoCoastline.merge(features)
 *
 * polygonize + BBOX 分割 + right-side probe 面選別版
 *
 * 方針:
 * - natural=coastline の LineString / MultiLineString / Polygon / MultiPolygon を抽出
 * - open coastline を BBOX でクリップ
 * - open coastline の端点で BBOX 辺を分割
 * - coastline + 分割済み BBOX 辺を polygonize
 * - polygonize された面のうち
 *    1) BBOX 四隅に接続し
 *    2) open coastline の右側 probe 点を1つ以上含む
 *   面だけを sea として採用
 * - Polygon/MultiPolygon coastline と closed coastline は land として差し引く
 *
 * 前提:
 * - turf がグローバルに存在すること
 * - turf.polygonize が存在すること
 */
class GeoCoastline {
    merge(features) {
        if (!Array.isArray(features) || features.length === 0) return features;
        if (typeof turf === "undefined") {
            console.error("GeoCoastline: turf is required");
            return features;
        }
        if (typeof turf.polygonize !== "function") {
            console.error("GeoCoastline: turf.polygonize is required");
            return features;
        }

        if (typeof window !== "undefined") {
            window.GeoCoastlineDebug = {
                lastCandidates: [],
                lastCandidateFC: null,
                lastSeaFC: null,
                lastBBoxSplitEdges: null,
                lastProbePoints: null,
                lastInputCount: features.length
            };
        }

        const dbg = (...args) => console.log("[GeoCoastlineDBG]", ...args);

        const B = GeoCont.get_LL();
        const BB = {
            minX: B.NW.lng,
            maxX: B.SE.lng,
            minY: B.SE.lat,
            maxY: B.NW.lat
        };

        const EPS = 1e-10;
        const SCALE = Math.max(BB.maxX - BB.minX, BB.maxY - BB.minY);
        const PROBE = Math.max(SCALE * 1e-5, 1e-7);

        const samePt = (a, b, eps = EPS) =>
            !!a && !!b &&
            Math.abs(a[0] - b[0]) < eps &&
            Math.abs(a[1] - b[1]) < eps;

        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

        const snapToBBox = (p) => {
            const x = clamp(p[0], BB.minX, BB.maxX);
            const y = clamp(p[1], BB.minY, BB.maxY);
            return [
                Math.abs(x - BB.minX) < EPS ? BB.minX :
                Math.abs(x - BB.maxX) < EPS ? BB.maxX : x,
                Math.abs(y - BB.minY) < EPS ? BB.minY :
                Math.abs(y - BB.maxY) < EPS ? BB.maxY : y
            ];
        };

        const cleanLine = (coords) => {
            const out = [];
            for (const p of coords || []) {
                const q = snapToBBox(p);
                if (out.length === 0 || !samePt(out[out.length - 1], q)) out.push(q);
            }
            return out;
        };

        const closeRing = (ring) => {
            const out = cleanLine(ring);
            if (out.length < 3) return out;
            if (!samePt(out[0], out[out.length - 1])) out.push(out[0].slice());
            return out;
        };

        const ringArea = (ring) => {
            if (!ring || ring.length < 4) return 0;
            let a = 0;
            for (let i = 0; i < ring.length - 1; i++) {
                const [x1, y1] = ring[i];
                const [x2, y2] = ring[i + 1];
                a += (x1 * y2 - x2 * y1);
            }
            return a / 2;
        };

        const bboxCornerPoints = () => [
            turf.point([BB.minX + PROBE, BB.minY + PROBE]),
            turf.point([BB.maxX - PROBE, BB.minY + PROBE]),
            turf.point([BB.maxX - PROBE, BB.maxY - PROBE]),
            turf.point([BB.minX + PROBE, BB.maxY - PROBE]),
        ];

        const isCoastFeature = (f) => {
            const g = f && f.geometry;
            const p = f && f.properties ? f.properties : {};
            if (!g) return false;
            if (!(p.natural === "coastline" || p._coastline === true)) return false;
            return ["LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(g.type);
        };

        const asPolygonFeature = (ring, props = {}) => {
            const r = closeRing(ring);
            if (r.length < 4) return null;
            const a = Math.abs(ringArea(r));
            if (a < SCALE * SCALE * 1e-14) return null;
            return turf.polygon([r], props);
        };

        const flattenPolygons = (feature) => {
            if (!feature || !feature.geometry) return [];
            const g = feature.geometry;
            const p = feature.properties || {};
            if (g.type === "Polygon") return [turf.feature(g, p)];
            if (g.type === "MultiPolygon") return g.coordinates.map(coords => turf.polygon(coords, p));
            return [];
        };

        const featureArrayUnion = (arr) => {
            let acc = null;
            for (const f of arr) {
                if (!acc) {
                    acc = f;
                    continue;
                }
                try {
                    acc = turf.union(turf.featureCollection([acc, f]));
                } catch (e1) {
                    try {
                        acc = turf.union(acc, f);
                    } catch (e2) {
                        console.error("GeoCoastline union failed", e1, e2);
                    }
                }
            }
            return acc;
        };

        const difference2 = (a, b) => {
            if (!a) return null;
            if (!b) return a;
            try {
                return turf.difference(turf.featureCollection([a, b]));
            } catch (e1) {
                try {
                    return turf.difference(a, b);
                } catch (e2) {
                    console.error("GeoCoastline difference failed", e1, e2);
                    return a;
                }
            }
        };

        const clipLineFeatureToBBox = (lineFeature) => {
            try {
                const clipped = turf.bboxClip(lineFeature, [BB.minX, BB.minY, BB.maxX, BB.maxY]);
                if (!clipped || !clipped.geometry) return [];
                if (clipped.geometry.type === "LineString") {
                    const c = cleanLine(clipped.geometry.coordinates);
                    return c.length >= 2 ? [c] : [];
                }
                if (clipped.geometry.type === "MultiLineString") {
                    return clipped.geometry.coordinates.map(cleanLine).filter(c => c.length >= 2);
                }
                return [];
            } catch (e) {
                console.error("GeoCoastline bboxClip failed", e);
                return [];
            }
        };

        const joinLines = (lines) => {
            const pool = lines.map(cleanLine).filter(line => Array.isArray(line) && line.length >= 2);
            const out = [];
            const take = (arr, i) => arr.splice(i, 1)[0];

            while (pool.length > 0) {
                let line = pool.shift();
                let changed = true;

                while (changed) {
                    changed = false;
                    const head = line[0];
                    const tail = line[line.length - 1];

                    for (let i = 0; i < pool.length; i++) {
                        const seg = pool[i];
                        const s0 = seg[0];
                        const s1 = seg[seg.length - 1];

                        if (samePt(tail, s0)) {
                            take(pool, i);
                            line = line.concat(seg.slice(1));
                            changed = true;
                            break;
                        }
                        if (samePt(tail, s1)) {
                            take(pool, i);
                            line = line.concat(seg.slice(0, -1).reverse());
                            changed = true;
                            break;
                        }
                        if (samePt(head, s1)) {
                            take(pool, i);
                            line = seg.slice(0, -1).concat(line);
                            changed = true;
                            break;
                        }
                        if (samePt(head, s0)) {
                            take(pool, i);
                            line = seg.slice(1).reverse().concat(line);
                            changed = true;
                            break;
                        }
                    }
                }

                out.push(cleanLine(line));
            }
            return out;
        };

        const edgeOf = (p) => {
            const [x, y] = snapToBBox(p);
            if (Math.abs(y - BB.maxY) < EPS) return "N";
            if (Math.abs(x - BB.maxX) < EPS) return "E";
            if (Math.abs(y - BB.minY) < EPS) return "S";
            if (Math.abs(x - BB.minX) < EPS) return "W";
            return null;
        };

        const edgeParam = (edge, p) => {
            const q = snapToBBox(p);
            switch (edge) {
                case "N": return q[0] - BB.minX;
                case "S": return q[0] - BB.minX;
                case "W": return q[1] - BB.minY;
                case "E": return q[1] - BB.minY;
                default: return 0;
            }
        };

        const splitBBoxEdges = (endpoints) => {
            const edges = {
                N: [[BB.minX, BB.maxY], [BB.maxX, BB.maxY]],
                E: [[BB.maxX, BB.minY], [BB.maxX, BB.maxY]],
                S: [[BB.minX, BB.minY], [BB.maxX, BB.minY]],
                W: [[BB.minX, BB.minY], [BB.minX, BB.maxY]],
            };

            const result = [];
            const dbgEdges = { N: [], E: [], S: [], W: [] };

            for (const edgeName of ["N", "E", "S", "W"]) {
                const pts = [edges[edgeName][0], edges[edgeName][1]];
                for (const p of endpoints) {
                    if (edgeOf(p) === edgeName) pts.push(snapToBBox(p));
                }

                const uniq = [];
                for (const p of pts) {
                    if (!uniq.some(u => samePt(u, p))) uniq.push(p);
                }

                uniq.sort((a, b) => edgeParam(edgeName, a) - edgeParam(edgeName, b));
                dbgEdges[edgeName] = uniq.map(p => p.slice());

                for (let i = 0; i < uniq.length - 1; i++) {
                    if (!samePt(uniq[i], uniq[i + 1])) {
                        result.push(turf.lineString([uniq[i], uniq[i + 1]], { _gen: "bboxEdgeSplit", edge: edgeName }));
                    }
                }
            }

            if (typeof window !== "undefined") {
                window.GeoCoastlineDebug.lastBBoxSplitEdges = dbgEdges;
            }

            dbg("bbox split edges", dbgEdges);
            return result;
        };

        const polygonCornerHits = (poly) => {
            return bboxCornerPoints().map((pt, idx) => {
                try {
                    return turf.booleanPointInPolygon(pt, poly, { ignoreBoundary: false }) ? idx : null;
                } catch (e) {
                    return null;
                }
            }).filter(v => v !== null);
        };

        const polygonProbeHits = (poly, probes) => {
            const hits = [];
            probes.forEach((pt, idx) => {
                try {
                    if (turf.booleanPointInPolygon(pt, poly, { ignoreBoundary: false })) hits.push(idx);
                } catch (e) {}
            });
            return hits;
        };

        const pickRightProbePoint = (seg) => {
            for (let i = 0; i < seg.length - 1; i++) {
                const a = seg[i];
                const b = seg[i + 1];
                const dx = b[0] - a[0];
                const dy = b[1] - a[1];
                const len = Math.hypot(dx, dy);
                if (len > PROBE * 10) {
                    const mx = (a[0] + b[0]) / 2;
                    const my = (a[1] + b[1]) / 2;
                    // coastline の右側
                    const nx = dy / len;
                    const ny = -dx / len;
                    const px = clamp(mx + nx * PROBE, BB.minX + PROBE, BB.maxX - PROBE);
                    const py = clamp(my + ny * PROBE, BB.minY + PROBE, BB.maxY - PROBE);
                    return turf.point([px, py], { _gen: "rightProbe" });
                }
            }
            return null;
        };

        const coastlineLines = [];
        const landPolys = [];
        const etcs = [];

        for (const f of features) {
            if (!isCoastFeature(f)) {
                etcs.push(f);
                continue;
            }

            const g = f.geometry;

            if (g.type === "Polygon") {
                if (g.coordinates[0]) {
                    const p = asPolygonFeature(g.coordinates[0], { _gen: "landFromPolygonCoast" });
                    if (p) landPolys.push(p);
                }
            } else if (g.type === "MultiPolygon") {
                for (const poly of g.coordinates) {
                    if (poly[0]) {
                        const p = asPolygonFeature(poly[0], { _gen: "landFromMultiPolygonCoast" });
                        if (p) landPolys.push(p);
                    }
                }
            } else if (g.type === "LineString") {
                coastlineLines.push(g.coordinates);
            } else if (g.type === "MultiLineString") {
                for (const line of g.coordinates) coastlineLines.push(line);
            }
        }

        dbg("input", {
            total: features.length,
            coastlineLines: coastlineLines.length,
            landPolys: landPolys.length,
            etcs: etcs.length
        });

        const clippedLines = [];
        for (const coords of coastlineLines) {
            const ls = turf.lineString(coords);
            const parts = clipLineFeatureToBBox(ls);
            for (const p of parts) clippedLines.push(p);
        }

        const mergedLines = joinLines(clippedLines);
        const polygonizeLines = [];
        const bboxEndpoints = [];
        const rightProbePoints = [];

        for (const line of mergedLines) {
            if (!line || line.length < 2) continue;

            if (samePt(line[0], line[line.length - 1])) {
                const p = asPolygonFeature(line, { _gen: "landFromClosedLine" });
                if (p) landPolys.push(p);
                dbg("closed coastline -> land", { points: line.length, area: p ? turf.area(p) : 0 });
            } else {
                polygonizeLines.push(turf.lineString(line, { _gen: "coastlineOpen" }));
                bboxEndpoints.push(line[0], line[line.length - 1]);

                const probe = pickRightProbePoint(line);
                if (probe) rightProbePoints.push(probe);

                dbg("open coastline kept", {
                    points: line.length,
                    start: line[0],
                    end: line[line.length - 1],
                    probe: probe ? probe.geometry.coordinates : null
                });
            }
        }

        if (typeof window !== "undefined") {
            window.GeoCoastlineDebug.lastProbePoints = turf.featureCollection(rightProbePoints);
        }

        for (const edge of splitBBoxEdges(bboxEndpoints)) {
            polygonizeLines.push(edge);
        }

        dbg("polygonize line count", polygonizeLines.length);

        if (polygonizeLines.length === 0) {
            dbg("no polygonize lines -> return original");
            return features;
        }

        let polyFC;
        try {
            polyFC = turf.polygonize(turf.featureCollection(polygonizeLines));
        } catch (e) {
            console.error("GeoCoastline polygonize failed", e);
            return features;
        }

        if (!polyFC || !Array.isArray(polyFC.features) || polyFC.features.length === 0) {
            dbg("polygonize produced no faces");
            return features;
        }

        dbg("polygonize faces", polyFC.features.length);

        const landUnion = featureArrayUnion(landPolys);

        const candidateFeatures = [];
        const candidateMeta = [];

        polyFC.features.forEach((poly, idx) => {
            const area = turf.area(poly);
            const corners = polygonCornerHits(poly);
            const cornerTouch = corners.length > 0;
            const probeHits = polygonProbeHits(poly, rightProbePoints);
            const probeTouch = probeHits.length > 0;

            let diff = poly;
            let diffCount = 1;
            if (landUnion) {
                diff = difference2(poly, landUnion);
            }
            const polys = flattenPolygons(diff).filter(p => turf.area(p) > 0);
            diffCount = polys.length;

            candidateMeta.push({
                idx,
                area,
                touchesBBoxCorner: cornerTouch,
                cornerHits: corners,
                touchesRightProbe: probeTouch,
                probeHits,
                diffCount
            });

            dbg("face", {
                idx,
                area,
                touchesBBoxCorner: cornerTouch,
                cornerHits: corners,
                touchesRightProbe: probeTouch,
                probeHits,
                diffCount
            });

            for (const p of polys) {
                const pArea = turf.area(p);
                const pCorners = polygonCornerHits(p);
                const pCornerTouch = pCorners.length > 0;
                const pProbeHits = polygonProbeHits(p, rightProbePoints);
                const pProbeTouch = pProbeHits.length > 0;

                dbg("face-part", {
                    idx,
                    area: pArea,
                    touchesBBoxCorner: pCornerTouch,
                    cornerHits: pCorners,
                    touchesRightProbe: pProbeTouch,
                    probeHits: pProbeHits
                });

                if (pCornerTouch && pProbeTouch) {
                    p.properties = Object.assign({}, p.properties || {}, {
                        natural: "water",
                        water: "sea",
                        _gen: "seaPolygonPolygonizedProbeChecked",
                        _faceIndex: idx
                    });
                    candidateFeatures.push(p);
                }
            }
        });

        if (typeof window !== "undefined") {
            window.GeoCoastlineDebug.lastCandidates = candidateMeta;
            window.GeoCoastlineDebug.lastCandidateFC = turf.featureCollection(candidateFeatures);
        }

        dbg("accepted sea candidate count", candidateFeatures.length);

        if (candidateFeatures.length === 0) {
            dbg("no accepted sea candidates -> return original");
            return features;
        }

        const seaFeatures = candidateFeatures.map(f => {
            f.properties = Object.assign({}, f.properties || {}, {
                natural: "water",
                water: "sea",
                _gen: "seaPolygonPolygonizedProbeChecked"
            });
            return f;
        });

        if (typeof window !== "undefined") {
            window.GeoCoastlineDebug.lastSeaFC = turf.featureCollection(seaFeatures);
        }

        dbg("final sea feature count", seaFeatures.length);

        return seaFeatures.concat(etcs);
    }
}
