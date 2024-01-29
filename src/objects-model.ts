import { Vector2, Vector3 } from "three";
import { sc_type_node, sc_type_node_struct } from "ts-sc-client";
import { Algorithms, SCgMath } from "./math";
import { sc_type_dedge_common, sc_type_edge_access } from "ts-sc-client";
import { SCgScene } from "./scene";
    const enum SCgObjectState {
        Normal = 0,
        MergedWithMemory = 1,
        NewInMemory = 2,
        FromMemory = 3,
        RemovedFromMemory = 4,
    };

    const enum SCgObjectLevel {
        First = 0,
        Second = 1,
        Third = 2,
        Fourth = 3,
        Fifth = 4,
        Sixth = 5,
        Seventh = 6,
        Count = 7,
    };

    type ModelObjectOptions = {
        position: Vector3,
        scale: Vector2,
        sc_type: number,
        sc_addr?: number,
        text?: string
    }

    let ObjectId = 0;
    /**
     * Initialize sc.g-object with specified options.
     *
     * @param {Object} options
     * Initial options of object. There are possible options:
     * - observer - object, that observe this
     * - position - object position. Vector3 object
     * - scale - object size. Vector2 object.
     * - sc_type - object type. See sc-types for more info.
     * - text - text identifier of object
     */
    export class ModelObject {
        need_observer_sync = true;

        position: Vector3;
        scale: Vector2;
        //! TODO: migrate to ScAddr and ScType
        sc_type: number;
        sc_addr: number | null;
        text: String | null;

        id = ObjectId++;
        edges: ModelEdge[] = [];    // list of connected edges
        copies = {};
        need_update = true;    // update flag
        state = SCgObjectState.FromMemory;
        is_selected = false;
        is_highlighted = false;
        scene: SCgScene | null = null;
        bus: ModelBus | null = null;
        level: number | null = null;
        contour?: ModelContour = undefined;
        constructor(position: Vector3,
            scale: Vector2,
            sc_type: number,
            sc_addr?: number,
            text?: string) {

            if (position) {
                this.position = position;
            } else {
                this.position = new Vector3(0.0, 0.0, 0.0);
            }

            if (scale) {
                this.scale = scale;
            } else {
                this.scale = new Vector2(20.0, 20.0);
            }

            if (sc_type) {
                this.sc_type = sc_type;
            } else {
                this.sc_type = sc_type_node;
            }

            if (sc_addr) {
                this.sc_addr = sc_addr;
            } else {
                this.sc_addr = null;
            }

            if (text) {
                this.text = text;
            } else {
                this.text = null;
            }
        }

        /**
         * Destroy object
         */
        destroy() {
        };

        /**
         * Setup new position of object
         * @param {Vector3} pos
         *      New position of object
         */
        setPosition(pos: Vector3) {
            this.position = pos;
            this.need_observer_sync = true;

            this.requestUpdate();
            this.notifyEdgesUpdate();
            this.notifyBusUpdate();
        };

        /**
         * Setup new scale of object
         * @param {Vector2} scale
         *      New scale of object
         */
        setScale(scale: Vector2) {
            this.scale = scale;
            this.need_observer_sync = true;
        };

        setLevel(level: number) {
            this.level = level;
            this.need_observer_sync = true;
        };

        /**
         * Setup new text value
         * @param {String} text New text value
         */
        setText(text: string) {
            this.text = text;
            this.need_observer_sync = true;
        };

        /**
         * Setup new type of object
         * @param {Number} type New type value
         */
        setScType(type: number) {
            this.sc_type = type;
            this.need_observer_sync = true;
        };


        /**
         * Notify all connected edges to sync
         */
        notifyEdgesUpdate() {
            for (let i = 0; i < this.edges.length; i++) {
                this.edges[i].need_update = true;
                this.edges[i].need_observer_sync = true;
            }
        };

        /**
         * Notify connected bus to sync
         */
        notifyBusUpdate() {
            if (this.bus != undefined) {
                this.bus.need_update = true;
                this.bus.need_observer_sync = true;
            }
        };

        /** Function iterate all objects, that need to be updated recursively, and
         * mark them for update.
         */
        requestUpdate() {
            this.need_update = true;
            for (let i = 0; i < this.edges.length; ++i) {
                this.edges[i].requestUpdate();
            }

            if (this.bus != undefined) {
                this.bus.requestUpdate();
            }
        };

        /** Updates object state.
         */
        update() {
            this.need_update = false;
            this.need_observer_sync = true;

            for (let i = 0; i < this.edges.length; ++i) {
                let edge = this.edges[i];

                if (edge.need_update) {
                    edge.update();
                }
            }
        };

        /*! Calculate connector position.
         * @param {Vector3} Position of other end of connector
         * @param {Float} Dot position on this object.
         * @returns Returns position of connection point (new instance of Vector3, that can be modified later)
         */
        getConnectionPos(from: Vector3, dotPos: number) {
            return new Vector3(0, 0, 0);
        };
        /*! Calculates dot position on object, for specified coordinates in scene
         * @param {Vector2} pos Position in scene to calculate dot position
         */
        calculateDotPos(pos: Vector2): number {
            return 0
        };

        /*! Setup new state of object
         * @param {SCgObjectState} state New object state
         */
        setObjectState(state: SCgObjectState) {
            this.state = state;
            this.need_observer_sync = true;
        };

        /*!
         * Change value of selection flag
         */
        _setSelected(value: boolean) {
            this.is_selected = value;
            this.need_observer_sync = true;
        };

        /**
         * Remove edge from edges list
         */
        removeEdge(edge: ModelEdge) {
            const idx = this.edges.indexOf(edge);

            if (idx < 0) return;

            this.edges.splice(idx, 1);
        };

        /**
         * Remove edge from edges list
         */
        removeBus() {
            this.bus = null;
        };

        /**
         * Setup new sc-addr of object
         */
        setScAddr(addr: number, isCopy = false) {
            if (this.scene) {
                if (isCopy) {
                    this.sc_addr = addr;
                    this.scene.objects.get(this.sc_addr).copies[this.id] = this;
                } else {
                    // remove old sc-addr from map
                    if (this.sc_addr && Object.prototype.hasOwnProperty.call(this.scene.objects, this.sc_addr)) {
                        delete this.scene.objects.get(this.sc_addr)?.destroy;
                    }
                    this.sc_addr = addr;

                    if (this.sc_addr) this.scene.objects.get(this.sc_addr) = this;
                }

                this.need_observer_sync = true;
            }
        }
    };

    // -------------- node ---------

    /**
     * Initialize sc.g-node object.
     * @param {Object} options
     *      Initial options of sc.g-node. It can include params from base object
     */
    export class ModelNode extends ModelObject {

        constructor(position: Vector3,
            scale: Vector2,
            sc_type: number,
            sc_addr?: number,
            text?: string) {
            super(position, scale, sc_type, sc_addr, text);
        };


        getConnectionPos(from: Vector3, dotPos: number) {

            var radius = this.scale.x;
            var center = this.position;

            var result = new Vector3(0, 0, 0);

            result.copy(from).sub(center).normalize();
            result.multiplyScalar(radius).add(center);

            return result;
        };
    }


    type ModelLinkOptions = ModelObjectOptions & {

    }
    // ---------------- link ----------
    export class ModelLink extends ModelObject {
        contentLoaded: boolean = false
        contentType: string | null = null
        containerId: string
        content: string
        constructor(position: Vector3,
            scale: Vector2,
            sc_type: number,
            containerId: string,
            content: string,
            sc_addr?: number,
            text?: string) {
            super(position,
                scale,
                sc_type,
                sc_addr,
                text);

            this.containerId = containerId;
            this.content = content;
        };

        getConnectionPos(from: Vector3, dotPos: number) {

            var y2 = this.scale.y * 0.5,
                x2 = this.scale.x * 0.5;

            var left = this.position.x - x2 - 5,
                top = this.position.y - y2 - 5,
                right = this.position.x + x2 + 5,
                bottom = this.position.y + y2 + 5;

            var points = Algorithms.polyclip([
                new Vector2(left, top),
                new Vector2(right, top),
                new Vector2(right, bottom),
                new Vector2(left, bottom)
            ], from, this.position);

            if (points.length == 0)
                throw "There are no intersection";

            // find shortes
            var dMin = null,
                res = null;
            for (var i = 0; i < points.length; ++i) {
                var p = points[i];
                var d = SCgMath.distanceSquared(p, from);

                if (dMin === null || dMin > d) {
                    dMin = d;
                    res = p;
                }
            }

            return res ? new Vector3(res.x, res.y, this.position.z) : this.position;
        };

        /**
         * Setup new content value
         * @param {String} content New content value
         * @param {String} contentType Type of content (string, float, int8, int16, int32)
         */
        setContent(content: string, contentType: string) {
            this.content = content;
            this.contentType = contentType;
            this.need_observer_sync = true;
            this.contentLoaded = false;
        };
    }

    // --------------- arc -----------

    type ModelEdgeOptions = ModelObjectOptions & {
        source: ModelObject
        target: ModelObject
    }
    /**
     * Initialize sc.g-arc(edge) object
     * @param {Object} options
     *      Initial opations of sc.g-arc.
     */
    export class ModelEdge extends ModelObject {

        source: ModelObject
        target: ModelObject
        source_pos: Vector3
        target_pos: Vector3
        points: Array<Vector3>
        source_dot: number
        target_dot: number

        constructor(position: Vector3,
            scale: Vector2,
            sc_type: number,
            source: ModelObject,
            target: ModelObject,
            sc_addr?: number,
            text?: string) {
            super(position,
                scale,
                sc_type,
                sc_addr,
                text,
            );
            this.source = source;
            this.target = target;

            if (source)
                this.setSource(source);
            if (target)
                this.setTarget(target);

            this.source_pos = this.source.position; // the begin position of egde in world coordinates
            this.target_pos = this.target.position; // the end position of edge in world coordinates
            this.points = [];
            this.source_dot = 0.5;
            this.target_dot = 0.5;
        }
        //this.requestUpdate();
        //this.update();

        setPosition(offset: Vector3) {
            var dp = offset.clone().sub(this.position);
            for (var i = 0; i < this.points.length; i++) {
                this.points[i].x += dp.x;
                this.points[i].y += dp.y;
            }
            ModelObject.prototype.setPosition.call(this, offset);
        };

        /**
         * Destroy object
         */
        destroy() {
            ModelObject.prototype.destroy.call(this);

            if (this.target)
                this.target.removeEdge(this);
            if (this.source)
                this.source.removeEdge(this);
        };

        /**
         * Setup new source object for sc.g-edge
         * @param {Object} scg_obj
         *      sc.g-object, that will be the source of edge
         */
        setSource(scg_obj: ModelObject) {
            if (this.source == scg_obj) return; // do nothing

            if (this.source)
                this.source.removeEdge(this);

            this.source = scg_obj;
            this.source.edges.push(this);
            this.need_observer_sync = true;
            this.need_update = true;
        };

        /**
         * Setup new value of source dot position
         */
        setSourceDot(dot: number) {
            this.source_dot = dot;
            this.need_observer_sync = true;
            this.need_update = true;
        };

        /**
         * Setup new target object for sc.g-edge
         * @param {Object} scg_obj
         *      sc.g-object, that will be the target of edge
         */
        setTarget(scg_obj: ModelObject) {

            if (this.target == scg_obj) return; // do nothing

            if (this.target)
                this.target.removeEdge(this);

            this.target = scg_obj;
            this.target.edges.push(this);
            this.need_observer_sync = true;
            this.need_update = true;
        };

        /**
         * Setup new value of target dot position
         */
        setTargetDot(dot: number) {
            this.target_dot = dot;
            this.need_observer_sync = true;
            this.need_update = true;
        };

        update() {
            if (!this.source || !this.target)
                return;
            if (isNaN(this.source.position.x) || isNaN(this.source.position.y))
                this.source.setPosition(new Vector3(250.0, 250.0, 0.0))
            if (isNaN(this.target.position.x) || isNaN(this.target.position.y))
                this.target.setPosition(new Vector3(250.0, 250.0, 0.0))

            if (!this.source_pos || isNaN(this.source_pos.x) || isNaN(this.source_pos.y) || isNaN(this.source_pos.z))
                this.source_pos = this.source.position.clone();
            if (!this.target_pos || isNaN(this.target_pos.x) || isNaN(this.target_pos.y) || isNaN(this.target_pos.z))
                this.target_pos = this.target.position.clone();

            ModelObject.prototype.update.call(this);

            // calculate begin and end positions
            if (this.points.length > 0) {

                if (this.source instanceof ModelEdge) {
                    this.source_pos = this.source.getConnectionPos(new Vector3(this.points[0].x, this.points[0].y, 0), this.source_dot);
                    this.target_pos = this.target.getConnectionPos(new Vector3(this.points[this.points.length - 1].x, this.points[this.points.length - 1].y, 0), this.target_dot);
                } else {
                    this.target_pos = this.target.getConnectionPos(new Vector3(this.points[this.points.length - 1].x, this.points[this.points.length - 1].y, 0), this.target_dot);
                    this.source_pos = this.source.getConnectionPos(new Vector3(this.points[0].x, this.points[0].y, 0), this.source_dot);
                }

            } else {

                if (this.source instanceof ModelEdge) {
                    this.source_pos = this.source.getConnectionPos(this.target_pos, this.source_dot);
                    this.target_pos = this.target.getConnectionPos(this.source_pos, this.target_dot);
                } else {
                    this.target_pos = this.target.getConnectionPos(this.source_pos, this.target_dot);
                    this.source_pos = this.source.getConnectionPos(this.target_pos, this.source_dot);
                }
            }

            this.position.copy(this.target_pos).add(this.source_pos).multiplyScalar(0.5);
        };

        /*! Checks if this edge need to be drawen with arrow at the end
         */
        hasArrow() {
            return this.sc_type & (sc_type_dedge_common | sc_type_edge_access);
        };

        /*!
         * Setup new points for edge
         */
        setPoints(points: Vector3[]) {
            this.points = points;
            this.need_observer_sync = true;
            this.requestUpdate();
        };

        getConnectionPos(from: Vector3, dotPos: number): Vector3 {

            if (this.need_update) this.update();

            // first of all we need to determine sector an it relative position
            var sector = Math.floor(dotPos);
            var sector_pos = dotPos - sector;

            // now we need to determine, if sector is correct (in sector bounds)
            if ((sector < 0) || (sector > this.points.length + 1)) {
                sector = this.points.length / 2;
            }

            var beg_pos, end_pos;
            if (sector == 0) {
                beg_pos = this.source_pos;
                if (this.points.length > 0)
                    end_pos = new Vector3(this.points[0].x, this.points[0].y, 0);
                else
                    end_pos = this.target_pos;
            } else if (sector == this.points.length) {
                end_pos = this.target_pos;
                if (this.points.length > 0)
                    beg_pos = new Vector3(this.points[sector - 1].x, this.points[sector - 1].y, 0);
                else
                    beg_pos = this.source_pos;
            } else {
                if (this.points.length > sector) {
                    beg_pos = new Vector3(this.points[sector - 1].x, this.points[sector - 1].y, 0);
                    end_pos = new Vector3(this.points[sector].x, this.points[sector].y, 0);
                } else {
                    beg_pos = new Vector3(this.source.position.x, this.source.position.y, 0);
                    end_pos = new Vector3(this.target.position.x, this.target.position.y, 0);
                }
            }

            var l_pt = new Vector3(0, 0, 0);

            l_pt.copy(beg_pos).sub(end_pos);
            l_pt.multiplyScalar(1 - sector_pos).add(end_pos);

            var result = new Vector3(0, 0, 0);
            result.copy(from).sub(l_pt).normalize();
            result.multiplyScalar(10).add(l_pt);

            return result;
        }

        calculateDotPos(pos: Vector2): number {

            var pts = [];
            pts.push(new Vector2(this.source_pos.x, this.source_pos.y));
            for (const idx in this.points)
                pts.push(new Vector2(this.points[idx].x, this.points[idx].y));
            pts.push(new Vector2(this.target_pos.x, this.target_pos.y));

            var minDist = -1.0;
            var result = 0.0;

            for (var i = 1; i < pts.length; i++) {
                var p1 = pts[i - 1];
                var p2 = pts[i];

                var v = p2.clone().sub(p1);
                var vp = pos.clone().sub(p1);

                var vn = v.clone().normalize();

                // calculate point on line
                var p = p1.clone().add(vn.clone().multiplyScalar(vn.clone().dot(vp)));

                if (v.length() == 0)
                    return result;

                var dotPos = p.clone().sub(p1).length() / v.length();

                if (dotPos < 0 || dotPos > 1)
                    continue;

                // we doesn't need to get real length, because we need minimum
                // so we get squared length to make that procedure faster
                var d = pos.clone().sub(p).lengthSq();

                // compare with minimum distance
                if (minDist < 0 || minDist > d) {
                    minDist = d;
                    result = (i - 1) + dotPos;
                }
            }

            return result;
        };
    }

    //---------------- contour ----------------
    type ModelContourOptions = ModelObjectOptions & {

    };
    /**
     * Initialize sc.g-arc(edge) object
     * @param {Object} options
     *      Initial opations of sc.g-arc.
     */
    export class ModelContour extends ModelObject {
        childs: ModelObject[];
        points: Vector3[];
        previousPoint: Vector3 | null
        constructor(position: Vector3,
            scale: Vector2,
            sc_type: number,
            verticies: Vector3[],
            sc_addr?: number,
            text?: string) {
            super(position,
                scale,
                sc_type,
                sc_addr,
                text);

            this.childs = [];
            this.points = verticies ? verticies : [];
            this.sc_type = sc_type ? sc_type : sc_type_node_struct | sc_type_node;
            this.previousPoint = null;

            var cx = 0;
            var cy = 0;
            for (var i = 0; i < this.points.length; i++) {
                cx += this.points[i].x;
                cy += this.points[i].y;
            }

            cx /= this.points.length;
            cy /= this.points.length;

            this.position.x = cx;
            this.position.y = cy;

        }



        setPosition(pos: Vector3) {
            const dp = pos.clone().sub(this.position);

            for (let i = 0; i < this.childs.length; i++) {
                let newPos = this.childs[i].position.clone().add(dp);
                this.childs[i].setPosition(newPos);
            }

            for (let i = 0; i < this.points.length; i++) {
                this.points[i].x += dp.x;
                this.points[i].y += dp.y;
            }

            ModelObject.prototype.setPosition.call(this, pos);
        };

        update() {
            ModelObject.prototype.update.call(this);
        };

        /**
         * Append new child into contour
         * @param {ModelObject} child Child object to append
         */
        addChild(child: ModelObject) {
            if (child === this) return;

            this.childs.push(child);
            child.contour = this;
        };

        /**
         * Remove child from contour
         * @param {ModelObject} child Child object for remove
         */
        removeChild(child: ModelObject) {
            const idx = this.childs.indexOf(child);
            this.childs.splice(idx, 1);
            child.contour = undefined;
        };

        isObjectInPolygon(node: ModelObject) {
            return Algorithms.isPointInPolygon(node.position, this.points);
        };

        /**
         * Convenient function for testing, which does mass checking nodes is in the contour
         * and adds them to childs of the contour
         * @param nodes array of {ModelNode}
         */
        addNodesWhichAreInContourPolygon(nodes: ModelNode[]) {
            for (let i = 0; i < nodes.length; i++) {
                if (!nodes[i].contour && this.isObjectInPolygon(nodes[i])) {
                    this.addChild(nodes[i]);
                }
            }
        };

        isEdgeInPolygon(edge: ModelEdge) {
            return !edge.contour && this.isObjectInPolygon(edge.source) && this.isObjectInPolygon(edge.target);
        };

        addEdgesWhichAreInContourPolygon(edges: ModelEdge[]) {
            for (let i = 0; i < edges.length; i++) {
                if (this.isEdgeInPolygon(edges[i])) {
                    this.addChild(edges[i]);
                }
            }
        };

        addElementsWhichAreInContourPolygon(scene: SCgScene) {
            this.addNodesWhichAreInContourPolygon(scene.nodes);
            this.addNodesWhichAreInContourPolygon(scene.links);
            this.addEdgesWhichAreInContourPolygon(scene.edges);
        };

        getConnectionPos(from: Vector3, dotPos: number) {
            const points = Algorithms.polyclip(this.points, from, this.position);
            let nearestIntersectionPoint = new Vector3(points[0].x, points[0].y, 0);
            for (var i = 1; i < points.length; i++) {
                var nextPoint = new Vector3(points[i].x, points[i].y, 0);
                var currentLength = from.clone().sub(nearestIntersectionPoint).length();
                var newLength = from.clone().sub(nextPoint).length();
                if (currentLength > newLength) {
                    nearestIntersectionPoint = nextPoint;
                }
            }
            return nearestIntersectionPoint;
        };

        getCenter() {
            var center = new Vector3();

            center.x = this.points[0].x;
            center.y = this.points[1].x;
            center.z = 0;

            for (const p of this.points) {
                center.x += p.x;
                center.y += p.y;
            }

            center.x /= this.points.length;
            center.y /= this.points.length;

            return center;
        };
    }

    type ModelBusOptions = ModelObjectOptions & {
        source: ModelObject
        source_pos?: Vector3
        target_pos?: Vector3
    };

    export class ModelBus extends ModelObject {
        id_bus: number;
        source: ModelObject;
        source_pos: Vector3;
        target_pos: Vector3;
        points: Vector3[];
        source_dot: number;
        target_dot: number;
        previousPoint: Vector3;
        constructor(position: Vector3,
            scale: Vector2,
            sc_type: number,
            source: ModelObject,
            source_pos?: Vector3,
            target_pos?: Vector3,
            sc_addr?: number,
            text?: string) {
                super(position,
                    scale,
                    sc_type,
                    sc_addr,
                    text);
            this.id_bus = this.id;
            this.source = source;
            this.source_pos = source_pos ??this.source.position // the begin position of bus in world coordinates
            this.target_pos = target_pos ?? this.source.position; // the end position of bus in world coordinates
            this.points = [];
            this.source_dot = 0.5;
            this.target_dot = 0.5;
            this.previousPoint = this.target_pos;
        }

        setPosition(offset: Vector3) {
            var dp = offset.clone().sub(this.position);
            for (var i = 0; i < this.points.length; i++) {
                this.points[i].x += dp.x;
                this.points[i].y += dp.y;
            }
            ModelObject.prototype.setPosition.call(this, offset);
        };

        update() {

            if (!this.source_pos)
                this.source_pos = this.source.position.clone();
            if (!this.target_pos) {
                var target = this.points[this.points.length - 1];
                this.target_pos = new Vector3(target.x, target.y, 0);
            }
            ModelObject.prototype.update.call(this);

            // calculate begin and end positions
            if (this.points.length > 0) {
                this.source_pos = this.source.getConnectionPos(new Vector3(this.points[0].x, this.points[0].y, 0), this.source_dot);
            } else {
                this.source_pos = this.source.getConnectionPos(this.target_pos, this.source_dot);
            }

            this.position.copy(this.target_pos).add(this.source_pos).multiplyScalar(0.5);
        };

        setSource(scg_obj: ModelObject) {
            if (this.source) this.source.removeBus();
            this.source = scg_obj;
            this.id = scg_obj.id;
            this.source.bus = this;
            this.need_observer_sync = true;
            this.need_update = true;
        };

        /**
         * Setup new value of source dot position
         */
        setSourceDot(dot: number) {
            this.source_dot = dot;
            this.need_observer_sync = true;
            this.need_update = true;
        };

        /**
         * Setup new value of target dot position
         */
        setTargetDot(dot: number) {
            this.target_dot = dot;
            this.need_observer_sync = true;
            this.need_update = true;
        };

        /*!
         * Setup new points for bus
         */
        setPoints(points: Vector3[]) {
            this.points = points;
            this.need_observer_sync = true;
            this.requestUpdate();
        };

        getConnectionPos = ModelEdge.prototype.getConnectionPos;

        calculateDotPos = ModelEdge.prototype.calculateDotPos;

        changePosition(mouse_pos: { x: number, y: number }) {

            var dx = mouse_pos.x - this.previousPoint.x,
                dy = mouse_pos.y - this.previousPoint.y,
                diff = new Vector3(dx, dy, 0);

            this.position.add(diff);

            for (var i = 0; i < this.points.length; i++) {
                this.points[i].x += diff.x;
                this.points[i].y += diff.y;
            }

            var new_pos = this.source.position.clone().add(diff);
            this.source.setPosition(new_pos);


            this.previousPoint.x = mouse_pos.x;
            this.previousPoint.y = mouse_pos.y;

            this.need_observer_sync = true;

            this.requestUpdate();
            this.notifyEdgesUpdate();
        };

        destroy() {
            ModelObject.prototype.destroy.call(this);
            if (this.source)
                this.source.removeBus();
        };


    }