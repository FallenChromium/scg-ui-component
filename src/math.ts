import { Vector, Vector2, Vector3 } from "three";

    export namespace SCgMath {
        export function distanceSquared(p1: {x: number, y: number}, p2: {x: number, y: number}) {
            var x = p1.x - p2.x,
                y = p1.y - p2.y;
    
            return x * x + y * y;
        };
    }

    export namespace Algorithms {
        /*!
        * Check if a point is in polygon
        * http://habrahabr.ru/post/125356/
        * @param point object with 'x' and 'y' fields, {Vector2} for example
        * @param vertecies Array of points, which represents a polygon
        * @return {boolean} true if the point is in the polygon, false otherwise
        */
        export function isPointInPolygon(point: {x: number, y: number}, vertices: Array<{x: number, y: number}>) {
            var polygon = vertices
    
            var Q_PATT = [
                [0, 1],
                [3, 2],
            ];
    
            var pred_pt = polygon[polygon.length - 1];
            var t1 = pred_pt.y - point.y < 0 ? 1 : 0;
            var t2 = pred_pt.x - point.x < 0 ? 1 : 0;
            var pred_q = Q_PATT[t1][t2];
    
            var w = 0;
    
            for (var i = 0; i < polygon.length; i++) {
                var cur_pt = polygon[i];
                cur_pt.x -= point.x;
                cur_pt.y -= point.y;
    
                t1 = cur_pt.y < 0 ? 1 : 0;
                t2 = cur_pt.x < 0 ? 1 : 0;
                var q = Q_PATT[t1][t2];
    
                switch (q - pred_q) {
                    case -3:
                        ++w;
                        break;
                    case 3:
                        --w;
                        break;
                    case -2:
                        if (pred_pt.x * cur_pt.y >= pred_pt.y * cur_pt.x) ++w;
                        break;
                    case 2:
                        if (!(pred_pt.x * cur_pt.y >= pred_pt.y * cur_pt.x)) --w;
                        break;
                }
    
                pred_pt = cur_pt;
                pred_q = q;
            }
    
            return w != 0;
        };
    /*!
     * Find intersection points of line and polygon
     * @param pin Array of points, which represents a polygon
     * @param segStart the first point, object with 'x' and 'y' fields, {Vector2 | Vector3} for example
     * @param segEnd the second point, object with 'x' and 'y' fields, {Vector2 | Vector3} for example
     * @return {Array} intersection points
     */
    export function polyclip(pin: string | any[], segStart: { x: number, y: number }, segEnd: { x: number, y: number }) {
        const inside = function (p: Vector2, plane: Array<number>) {
            const d = p.x * plane[0] + p.y * plane[1];
            return d > plane[2];
        };
        const clip = function (segStart: { x: number, y: number }, segEnd: { x: number, y: number }, plane: Array<number>) {
            const d1 = segStart.x * plane[0] + segStart.y * plane[1] - plane[2];
            const d2 = segEnd.x * plane[0] + segEnd.y * plane[1] - plane[2];
            const t = (0 - d1) / (d2 - d1);
            const x1 = segStart.x + t * (segEnd.x - segStart.x);
            const y1 = segStart.y + t * (segEnd.y - segStart.y);
            return { x: x1, y: y1 };
        };
        const plane = [segStart.y - segEnd.y, segEnd.x - segStart.x, 0];
        plane[2] = segStart.x * plane[0] + segStart.y * plane[1];
        const n = pin.length;
        let pout = [];
        let s = pin[n - 1];
        for (let ci = 0; ci < n; ci++) {
            const p = pin[ci];
            if (inside(p, plane)) {
                if (!inside(s, plane)) {
                    const t = clip(s, p, plane);
                    pout.push(t);
                }
            } else {
                if (inside(s, plane)) {
                    const t = clip(s, p, plane);
                    pout.push(t);
                }
            }
            s = p;
        }
        return pout;
    };    
    }